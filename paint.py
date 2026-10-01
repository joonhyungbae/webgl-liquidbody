#!/usr/bin/env python3
"""
그림 덧칠 서버. 화면 한 장을 받아 그림 모델로 다시 칠해서 돌려준다.

브라우저가 몇 초에 한 번 지금 화면을 보내면, 여기서 모델이 칠한 그림을 돌려주고,
브라우저가 그것을 원래 화면 위에 천천히 겹친다. 모델이 없거나 느려도 작품은 그대로 돈다.
켜지 않으면 브라우저는 한 번 물어보고 그만둔다.

  python3 paint.py                     시험용(stub). 모델 없이 색만 입혀 길이 뚫렸는지 본다
  python3 paint.py --backend diffusion 진짜 모델로. 아래 「모델 붙이기」를 먼저 읽는다
  python3 paint.py --size 384          모델에 넣기 전에 이 가로로 줄인다. 가벼운 기계에서 낮춘다
  python3 paint.py --port 7010         포트를 바꾼다

왜 매 프레임이 아니라 몇 초에 한 번인가
  이 작품은 느리다. 초당 몇 장이면 충분하고, 돌려받은 그림을 천천히 겹치면 모델이 프레임마다
  다르게 그리는 떨림이 보이지 않는다. 매 프레임 칠하면 물이 끓는 것처럼 보인다.

가벼운 노트북에서
  한 장에 2초가 걸려도 작품은 끊기지 않는다. 브라우저가 몇 초에 한 장만 받아 가기 때문이다.
  느리면 덧칠 간격을 늘리고(조절판), --size 를 384 나 320 으로 줄이고, 한 걸음(step)짜리
  작은 모델을 쓴다. SDXS-512 나 SD-Turbo 가 그런 모델이다. 큰 모델을 넣고 간격을 줄이는 것보다
  작은 모델을 넉넉한 간격으로 쓰는 쪽이 이 작품에 맞는다.

모델 깔기
  pip install torch diffusers transformers accelerate
  처음 켤 때 모델을 받는다(sd-turbo 는 약 2.5GB). 그다음부터는 받아 둔 것을 쓴다.
  더 빠른 것을 원하면 --model IDKiro/sdxs-512-dreamshaper 처럼 작은 모델을 준다.

  더 빠르게 돌리고 싶으면 StreamDiffusion 쪽을 붙여도 된다. 입력도 출력도 PNG 바이트라서
  Diffusion.paint() 안만 바꾸면 나머지 코드는 그대로다.
  https://github.com/patrickhartono/StreamDiffusion-Mac · https://github.com/pvjosue/StreamDiffusion-OSX
"""

from __future__ import annotations

import argparse
import http.server
import io
import json
import sys
import time
from urllib.parse import parse_qs, urlparse


def shrink(png: bytes, width: int) -> bytes:
    """모델에 넣기 전에 줄인다. 큰 그림은 모델을 몇 배로 느리게 만든다."""
    if not width:
        return png
    try:
        from PIL import Image
    except ImportError:
        return png
    img = Image.open(io.BytesIO(png))
    if img.width <= width:
        return png
    img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


class Stub:
    """모델 없이 길이 뚫렸는지만 본다. 받은 그림에 색을 입혀 돌려준다."""

    name = "시험용(stub)"

    def __init__(self, **_):
        try:
            from PIL import Image, ImageFilter  # noqa: F401
            self.ok = True
        except ImportError:
            self.ok = False
            print("Pillow 가 없어 받은 그림을 그대로 돌려줍니다. conda install pillow")

    def paint(self, png: bytes, prompt: str, strength: float) -> bytes:
        if not self.ok:
            return png
        from PIL import Image, ImageEnhance, ImageFilter

        img = Image.open(io.BytesIO(png)).convert("RGB")
        img = img.filter(ImageFilter.GaussianBlur(2 + 6 * strength))
        img = ImageEnhance.Color(img).enhance(1 + strength)
        out = io.BytesIO()
        img.save(out, format="PNG")
        return out.getvalue()


class Diffusion:
    """진짜 그림 모델. img2img 로 지금 화면을 다시 칠한다.

    한 걸음짜리 작은 모델을 쓴다. 큰 모델은 한 장에 몇 초씩 걸려서, 느린 기계에서는
    덧칠이 한참 뒤에 오고 그만큼 작품의 흐름과 어긋난다.

    돌아가는 자리는 세 가지다. NVIDIA(cuda), 맥(mps), 그 밖(cpu). 알아서 고른다.
    """

    name = "그림 모델"

    def __init__(self, model: str = "stabilityai/sd-turbo", steps: int = 2, **_):
        self.steps = max(1, steps)
        self.pipe = None
        try:
            import torch
            from diffusers import AutoPipelineForImage2Image
        except ImportError:
            print("torch 와 diffusers 가 없습니다. 시험용으로 켜거나 다음을 깝니다:")
            print("  pip install torch diffusers transformers accelerate")
            return

        if torch.cuda.is_available():
            device, dtype = "cuda", torch.float16
        elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            device, dtype = "mps", torch.float16
        else:
            device, dtype = "cpu", torch.float32
        print(f"그림 모델을 올립니다: {model} ({device}). 처음에는 몇 분 걸립니다.")
        self.pipe = AutoPipelineForImage2Image.from_pretrained(model, torch_dtype=dtype)
        self.pipe = self.pipe.to(device)
        self.pipe.set_progress_bar_config(disable=True)
        if hasattr(self.pipe, "safety_checker"):
            self.pipe.safety_checker = None      # 관객의 몸이 찍힌 그림을 바깥으로 보내지 않는다
        self.name = f"그림 모델 {model} ({device})"
        print("올렸습니다. 브라우저 쪽 조절판의 「덧칠」을 올리면 칠하기 시작합니다.")

    def paint(self, png: bytes, prompt: str, strength: float) -> bytes:
        if self.pipe is None:
            return png
        from PIL import Image

        img = Image.open(io.BytesIO(png)).convert("RGB")
        w, h = img.size
        # 모델이 좋아하는 크기로 맞춘다. 8 의 배수가 아니면 거절한다
        img = img.resize((max(64, w // 8 * 8), max(64, h // 8 * 8)), Image.LANCZOS)
        # 걸음 수는 세기에 맞춘다. steps × strength 가 1 보다 작으면 아무것도 칠해지지 않는다
        steps = max(self.steps, int(1 / max(0.05, strength)) + 1)
        out = self.pipe(
            prompt=prompt or "watercolor",
            image=img,
            num_inference_steps=steps,
            strength=float(strength),
            guidance_scale=0.0,     # turbo 계열은 0 으로 둔다. 올리면 느려지고 타 버린다
        ).images[0]
        out = out.resize((w, h), Image.LANCZOS)
        buf = io.BytesIO()
        out.save(buf, format="PNG")
        return buf.getvalue()


class Handler(http.server.BaseHTTPRequestHandler):
    backend = None
    size = 0          # 0 이 아니면 이 가로로 줄여서 모델에 넣는다
    busy = False
    stats = {"장": 0, "평균초": 0.0}

    def _send(self, code: int, body: bytes, kind: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")   # 브라우저가 다른 포트에서 부른다
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/health":
            body = json.dumps({"backend": Handler.backend.name, **Handler.stats}, ensure_ascii=False).encode()
            self._send(200, body, "application/json; charset=utf-8")
            return
        self.send_error(404)

    def do_POST(self) -> None:
        url = urlparse(self.path)
        if url.path != "/paint":
            self.send_error(404)
            return
        # 한 장을 칠하는 동안 다음 장이 들어오면 흘린다. 줄을 세우면 점점 늦어진다
        if Handler.busy:
            self._send(429, b"busy", "text/plain")
            return
        q = parse_qs(url.query)
        prompt = q.get("prompt", [""])[0]
        strength = float(q.get("strength", ["0.4"])[0])
        png = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        Handler.busy = True
        t0 = time.time()
        try:
            out = Handler.backend.paint(shrink(png, Handler.size), prompt, strength)
        except Exception as exc:
            print(f"칠하지 못했습니다: {exc}")
            self._send(500, b"", "text/plain")
            return
        finally:
            Handler.busy = False
        took = time.time() - t0
        n = Handler.stats["장"] + 1
        Handler.stats["장"] = n
        Handler.stats["평균초"] = round(Handler.stats["평균초"] + (took - Handler.stats["평균초"]) / n, 3)
        self._send(200, out, "image/png")

    def log_message(self, *args) -> None:
        pass


def main() -> None:
    sys.stdout.reconfigure(line_buffering=True)
    ap = argparse.ArgumentParser(description="화면을 받아 다시 칠해 돌려준다")
    ap.add_argument("--backend", default="stub", choices=["stub", "diffusion"])
    ap.add_argument("--model", default="stabilityai/sd-turbo", help="그림 모델 이름")
    ap.add_argument("--steps", type=int, default=1)
    ap.add_argument("--size", type=int, default=0, help="모델에 넣기 전 가로 크기. 0 이면 받은 그대로")
    ap.add_argument("--port", type=int, default=7010)
    args = ap.parse_args()

    Handler.size = args.size
    Handler.backend = Stub() if args.backend == "stub" else Diffusion(model=args.model, steps=args.steps)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"그림 덧칠 서버를 켰습니다: 127.0.0.1:{args.port} ({Handler.backend.name})")
    print("브라우저 쪽에서 조절판의 「덧칠」을 올리면 칠하기 시작합니다. 끝내려면 Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n껐습니다.")


if __name__ == "__main__":
    main()
