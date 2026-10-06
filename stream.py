"""
StreamDiffusion 방식으로 화면을 끊김 없이 다시 칠한다. paint.py 가 쓴다.

StreamDiffusion(Kodaira 외, 2023, https://github.com/cumulo-autumn/StreamDiffusion, Apache-2.0)의
img2img 경로를 지금의 diffusers 위에 옮겨 적은 것이다. 원래 패키지를 그대로 쓰지 않는 이유는
둘이다. diffusers 0.24.0 에 묶여 있고, 실행 중에 torch.cuda.Event 를 불러서 맥(mps)에서 멈춘다.
이 작품은 맥북에서 돈다. 그래서 빠른 이유가 되는 다섯 가지만 가져왔다.

  1. 노이즈를 한 번 정해 두고 계속 쓴다. 프레임마다 새 노이즈를 뽑으면 같은 자세여도 그림이
     매번 달라져 화면이 끓는다. 같은 노이즈면 같은 몸에서 같은 그림이 나온다.
  2. 걸음을 한 줄로 세워 한 번에 돈다(denoising batch). 두 걸음짜리라도 모델을 한 번만 부른다.
     대신 그림이 한 장 늦게 나온다. 초당 열 장 넘게 돌면 보이지 않는 늦음이다.
  3. 그림을 풀고 묶는 일(VAE)을 작은 것(TAESD)으로 바꾼다. 원래 것보다 열 배 남짓 빠르다.
  4. 비슷한 장면이 이어지면 계산을 건너뛴다(similar image filter). 관객이 가만히 앉아 있으면
     그래픽 칩이 쉰다. 조용한 방에서 노트북 팬이 덜 운다. 다만 0.5초에 한 번은 꼭 다시 칠한다.
     원본처럼 장 수로 묶으면 느린 기계에서 액체가 차오르는 변화를 몇 초씩 놓친다.
  5. 프롬프트를 글자에서 숫자로 바꾸는 일(텍스트 인코딩)은 단계마다 한 번만 한다.

세기(strength)는 걸음의 자리(t_index)로 바뀐다. 세기가 낮으면 노이즈를 조금만 섞어 원래
그림이 많이 남고, 높으면 모델이 더 많이 지어낸다.
"""

from __future__ import annotations

import random
import time


def pick_device():
    import torch

    if torch.cuda.is_available():
        return "cuda", torch.float16
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps", torch.float16
    return "cpu", torch.float32


def t_indices(strength: float, steps: int, total: int = 50) -> list[int]:
    """세기를 걸음의 자리로 바꾼다. 원본 예제의 [32, 45] 가 세기 0.35, 두 걸음에 해당한다."""
    first = min(total - 2, max(0, round((total - 1) * (1 - strength))))
    if steps <= 1:
        return [first]
    second = min(total - 1, first + max(1, round((total - 1 - first) * 0.76)))
    return [first, second]


class SimilarFilter:
    """앞 장면과 거의 같으면 건너뛴다.

    원본은 「열 장까지」 건너뛰는데, 초당 장 수가 낮은 기계에서는 그 열 장이 몇 초가 되어
    액체가 차오르는 느린 변화를 놓친다. 그래서 장 수 대신 시간으로 묶는다. 마지막으로 칠한 지
    max_wait 초가 지나면 비슷해도 다시 칠한다.
    """

    def __init__(self, threshold: float = 0.98, max_wait: float = 0.5) -> None:
        self.threshold = threshold
        self.max_wait = max_wait
        self.prev = None
        self.at = 0.0

    def same(self, x) -> bool:
        import torch

        now = time.perf_counter()
        if self.prev is None or self.prev.shape != x.shape or now - self.at > self.max_wait:
            self.prev, self.at = x.detach().clone(), now
            return False
        sim = torch.nn.functional.cosine_similarity(self.prev.reshape(-1).float(), x.reshape(-1).float(), dim=0).item()
        skip_p = 0.0 if self.threshold >= 1 else max(0.0, 1 - (1 - sim) / (1 - self.threshold))
        if random.random() < skip_p:
            return True
        self.prev, self.at = x.detach().clone(), now
        return False


class Stream:
    def __init__(self, model: str = "stabilityai/sd-turbo", vae: str = "madebyollin/taesd",
                 steps: int = 2, seed: int = 2, similar: float = 0.98) -> None:
        import torch
        from diffusers import AutoencoderTiny, LCMScheduler, StableDiffusionPipeline
        from diffusers.image_processor import VaeImageProcessor

        self.torch = torch
        self.device, self.dtype = pick_device()
        self.steps = max(1, min(2, steps))
        self.seed = seed
        pipe = StableDiffusionPipeline.from_pretrained(model, torch_dtype=self.dtype, safety_checker=None)
        pipe = pipe.to(self.device)
        pipe.set_progress_bar_config(disable=True)
        # 걸음 하나로 끝나는 계산(경계 조건 c_skip, c_out)을 쓰려고 LCM 스케줄러로 바꾼다
        self.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
        if vae:
            pipe.vae = AutoencoderTiny.from_pretrained(vae, torch_dtype=self.dtype).to(self.device)
        self.pipe = pipe
        self.unet = pipe.unet
        self.vae = pipe.vae
        self.images = VaeImageProcessor(vae_scale_factor=8)
        self.filter = SimilarFilter(threshold=similar)
        self.embeds: dict[str, object] = {}
        self.prompt = ""
        self.key = None          # 지금 준비된 크기와 세기. 바뀌면 다시 준비한다
        self.last = None         # 건너뛸 때 돌려줄 마지막 그림
        self.took = 0.0          # 한 장에 걸린 시간(초), 지수 평균
        self.skips = 0
        self.frames = 0
        self.name = f"StreamDiffusion 방식 {model} ({self.device}, {self.steps}걸음)"

    # ─── 준비 ──────────────────────────────────────────────────────────

    def embed(self, prompt: str):
        if prompt not in self.embeds:
            out = self.pipe.encode_prompt(prompt=prompt, device=self.device, num_images_per_prompt=1,
                                          do_classifier_free_guidance=False)
            self.embeds[prompt] = out[0]
        return self.embeds[prompt]

    def prepare(self, width: int, height: int, strength: float) -> None:
        torch = self.torch
        self.width, self.height = width, height
        lh, lw = height // 8, width // 8
        self.t_list = t_indices(strength, self.steps)
        n = len(self.t_list)
        self.scheduler.set_timesteps(50, self.device)
        sub = [self.scheduler.timesteps[t] for t in self.t_list]
        self.sub_t = torch.tensor(sub, dtype=torch.long, device=self.device)

        gen = torch.Generator().manual_seed(self.seed)
        self.init_noise = torch.randn((n, 4, lh, lw), generator=gen).to(self.device, self.dtype)
        self.buffer = torch.zeros((n - 1, 4, lh, lw), dtype=self.dtype, device=self.device) if n > 1 else None

        acp = self.scheduler.alphas_cumprod
        a = torch.stack([acp[t].sqrt() for t in sub]).view(n, 1, 1, 1)
        b = torch.stack([(1 - acp[t]).sqrt() for t in sub]).view(n, 1, 1, 1)
        self.a = a.to(self.device, self.dtype)
        self.b = b.to(self.device, self.dtype)
        cs, co = zip(*[self.scheduler.get_scalings_for_boundary_condition_discrete(t) for t in sub])
        self.c_skip = torch.stack([torch.as_tensor(c) for c in cs]).view(n, 1, 1, 1).to(self.device, self.dtype)
        self.c_out = torch.stack([torch.as_tensor(c) for c in co]).view(n, 1, 1, 1).to(self.device, self.dtype)
        self.key = (width, height, round(strength, 2))
        self.filter.prev = None

    # ─── 한 장 ─────────────────────────────────────────────────────────

    def encode(self, x):
        enc = self.vae.encode(x)
        lat = enc.latents if hasattr(enc, "latents") else enc.latent_dist.sample()
        return lat * self.vae.config.scaling_factor

    def decode(self, lat):
        return self.vae.decode(lat / self.vae.config.scaling_factor, return_dict=False)[0]

    def __call__(self, image, prompt: str, strength: float):
        """PIL 그림 한 장을 받아 다시 칠한 PIL 그림을 돌려준다."""
        torch = self.torch
        w, h = image.size
        w, h = max(64, w // 8 * 8), max(64, h // 8 * 8)
        if self.key != (w, h, round(strength, 2)):
            self.prepare(w, h, strength)
        t0 = time.perf_counter()
        with torch.inference_mode():
            x = self.images.preprocess(image, h, w).to(self.device, self.dtype)
            if self.last is not None and self.filter.same(x):
                self.skips += 1
                return self.last
            emb = self.embed(prompt)
            lat = self.encode(x)
            x_t = self.a[0] * lat + self.b[0] * self.init_noise[0]
            if self.buffer is not None:
                x_t = torch.cat((x_t, self.buffer), dim=0)
            pred = self.unet(x_t, self.sub_t, encoder_hidden_states=emb.repeat(len(self.t_list), 1, 1),
                             return_dict=False)[0]
            f = (x_t - self.b * pred) / self.a
            x0 = self.c_out * f + self.c_skip * x_t
            if self.buffer is not None:
                # 앞 걸음의 결과에 다음 걸음의 노이즈를 입혀 다음 장의 줄에 세운다
                self.buffer = self.a[1:] * x0[:-1] + self.b[1:] * self.init_noise[1:]
                x0 = x0[-1:]
            out = self.decode(x0)
            out = self.images.postprocess(out, output_type="pil")[0]
        if self.device == "cuda":
            torch.cuda.synchronize()
        took = time.perf_counter() - t0
        self.took = took if not self.frames else self.took * 0.9 + took * 0.1
        self.frames += 1
        self.last = out
        return out
