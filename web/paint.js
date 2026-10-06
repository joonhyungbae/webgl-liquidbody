/*
 덧칠. 지금 화면을 그림 모델에 보내 다시 칠한 그림을 받아 겹친다.

 보내는 화면은 글과 덧칠을 뺀 맨그림이다(app.js 가 uRaw 로 한 번 더 그린다). 글을 보내면
 모델이 뜻 없는 글자로 바꿔 그리고, 덧칠을 보내면 제 그림을 다시 칠해 점점 번져 나간다.
 받은 그림은 셰이더가 바탕 위, 글 아래에 얹는다.

 한 장을 돌려받자마자 다음 장을 보낸다(스트림). 모델이 초당 열 장을 칠하면 화면도 초당 열 번
 바뀐다. 서버(paint.py)는 StreamDiffusion 방식으로 노이즈를 고정해 두어서 같은 자세면 같은
 그림이 나오고, 여기서는 받은 그림을 앞 그림과 섞어 남은 떨림을 한 번 더 누른다.
 섞는 정도가 조절판의 「덧칠 부드럽게」다.

 작품의 단계마다 다른 말(프롬프트)을 보낸다. 결계일 때와 차오를 때와 빠질 때의 말이 다르고,
 그래서 같은 몸이라도 단계마다 다르게 칠해진다. 보내는 말은 settings.js 의 PROMPTS 에 있다.

 서버가 아직 모델을 올리는 중이거나 꺼져 있으면 5초마다 다시 물어본다. 그동안에도 작품은
 덧칠 없이 그대로 돈다.
 보내는 곳은 지금 보고 있는 주소다. serve.py 가 덧칠 서버로 넘기므로 다른 기기에서 열어도 된다.
*/

import { PROMPTS, PAINT_SIZE } from "./settings.js";

export class Paint {
  constructor() {
    this.img = new Image();          // 마지막으로 받은 그림
    this.fresh = false;              // 아직 섞지 않은 새 그림이 있나
    this.have = false;
    this.mix = 0;                    // 덧칠이 드러난 정도. 처음 받은 뒤 1초에 걸쳐 오른다
    this.retryAt = 0;                // 서버가 없으면 이때까지 묻지 않는다
    this.busy = false;
    this.note = "";
    this.count = 0;
    this.small = document.createElement("canvas");   // 보낼 때 줄이는 자리
    this.sctx = this.small.getContext("2d");
    this.acc = document.createElement("canvas");     // 받은 그림을 섞어 쌓는 자리
    this.actx = this.acc.getContext("2d");
    this.took = 0;                                   // 보내고 받기까지 걸린 시간(초)
    this.rate = 0;                                   // 초당 받은 장 수
    this.server = null;                              // 서버가 알려 준 상태
    this.lastHealth = 0;
  }

  prompt(phase) {
    return PROMPTS[phase] || PROMPTS.fill || "";
  }

  /* 한 프레임. 드러나는 정도를 맞추고, 가끔 서버 상태를 물어본다 */
  step(dt) {
    const target = this.have ? 1 : 0;
    this.mix += (target - this.mix) * Math.min(1, dt / 1.0);
    const now = performance.now();
    if (now - this.lastHealth > 2000) {
      this.lastHealth = now;
      fetch("paint/health").then((r) => r.ok && r.json()).then((j) => (this.server = j || null)).catch(() => {});
    }
  }

  /* 지금 한 장을 보낼 때인가. 앞 장이 돌아왔으면 바로 다음 장을 보낸다 */
  wants(p) {
    return p.paintMix > 0 && !this.busy && performance.now() >= this.retryAt;
  }

  /* 덧칠이 화면에 드러나는 정도. 셰이더의 uPaintMix 로 간다 */
  amount(p) {
    return this.have ? this.mix * p.paintMix : 0;
  }

  send(canvas, w, p) {
    this.busy = true;
    const t0 = performance.now();
    // 화면 그대로 보내지 않는다. 1920 짜리 그림을 모델에 보내면 몇 배로 느려진다
    const W = PAINT_SIZE;
    const H = Math.round((W * canvas.height) / canvas.width / 8) * 8;
    if (this.small.width !== W || this.small.height !== H) {
      this.small.width = W;
      this.small.height = H;
    }
    this.sctx.drawImage(canvas, 0, 0, W, H);
    this.small.toBlob(async (blob) => {
      if (!blob) { this.busy = false; return; }
      const q = new URLSearchParams({ prompt: this.prompt(w.phase), strength: String(p.paintStrength) });
      try {
        // 같은 주소로 부른다. serve.py 가 덧칠 서버로 넘겨 준다. 다른 기기에서 열어도 된다
        const res = await fetch(`paint?${q}`, { method: "POST", body: blob });
        if (res.status === 429) return;      // 다른 창이 칠하는 중이면 건너뛴다
        if (!res.ok) throw new Error(res.status);
        const bmp = await createImageBitmap(await res.blob());
        this.img = bmp;
        this.fresh = true;
        this.have = true;
        this.count++;
        const took = (performance.now() - t0) / 1000;
        this.took = this.count === 1 ? took : this.took * 0.9 + took * 0.1;
        this.rate = 1 / Math.max(0.001, this.took);
        const s = this.server;
        const skip = s && s["칠한장"] ? ` · 가만히 있어 건너뜀 ${s["건너뜀"]}` : "";
        const gpu = s && s["한장초"] ? ` · 모델 ${Math.round(s["한장초"] * 1000)}ms` : "";
        this.note = `덧칠 초당 ${this.rate.toFixed(1)}장${gpu}${skip} · ${this.prompt(w.phase)}`;
      } catch {
        this.retryAt = performance.now() + 5000;
        this.note = "덧칠 서버를 기다립니다. 처음 켤 때는 모델을 올리느라 몇 분 걸립니다 (python paint.py)";
      } finally {
        this.busy = false;
      }
    }, "image/jpeg", 0.85);
  }

  /* 받은 그림을 앞 그림과 섞어 쌓는다. 새로 쌓았으면 true. 쌓인 그림은 this.acc 에 있다 */
  layer(W, H, p) {
    if (!this.have) return false;
    if (this.acc.width !== W || this.acc.height !== H) {
      this.acc.width = W;
      this.acc.height = H;
      this.actx.drawImage(this.img, 0, 0, W, H);
      return true;
    }
    if (!this.fresh) return false;
    // 새 그림을 다 덮지 않고 조금만 얹는다. 부드럽게가 클수록 앞 그림이 오래 남는다
    this.actx.globalAlpha = 1 - p.paintSmooth;
    this.actx.drawImage(this.img, 0, 0, W, H);
    this.actx.globalAlpha = 1;
    this.fresh = false;
    return true;
  }
}
