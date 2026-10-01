/*
 덧칠. 지금 화면을 그림 모델에 보내 다시 칠한 그림을 받아 겹친다.

 작품의 단계마다 다른 말(프롬프트)을 보낸다. 결계일 때와 차오를 때와 빠질 때의 말이 다르고,
 그래서 같은 몸이라도 단계마다 다르게 칠해진다. 보내는 말은 settings.js 의 PROMPTS 에 있다.

 매 프레임 칠하지 않는다. 이 작품은 느리고, 모델은 프레임마다 조금씩 다르게 그린다.
 매 프레임 바꾸면 물이 끓는 것처럼 떨린다. 몇 초에 한 장만 받아 천천히 겹치면 그 떨림이
 보이지 않고, 모델이 느린 기계에서도 작품이 끊기지 않는다.

 서버(paint.py)가 꺼져 있으면 한 번 물어보고 그만둔다. 덧칠이 없어도 작품은 그대로 돈다.
*/

import { PROMPTS, PAINT_URL, PAINT_SIZE } from "./settings.js";

export class Paint {
  constructor() {
    this.img = new Image();          // 마지막으로 받은 그림
    this.have = false;
    this.mix = 0;                    // 지금 겹쳐 있는 정도. 받은 뒤 천천히 오른다
    this.off = false;                // 서버가 없으면 끈다
    this.busy = false;
    this.last = 0;
    this.note = "";
    this.count = 0;
    this.small = document.createElement("canvas");   // 보낼 때 줄이는 자리
    this.sctx = this.small.getContext("2d");
    this.took = 0;                                   // 한 장에 걸린 시간(초)
  }

  prompt(phase) {
    return PROMPTS[phase] || PROMPTS.fill || "";
  }

  /* 한 프레임. 때가 되면 보내고, 받아 둔 그림이 있으면 겹치는 정도를 올린다 */
  step(dt, canvas, w, p) {
    const target = this.have ? 1 : 0;
    this.mix += (target - this.mix) * Math.min(1, dt / 1.2);   // 1초쯤에 걸쳐 겹친다

    if (this.off || !p.paintMix) return;
    const now = performance.now();
    if (this.busy || now - this.last < p.paintEvery * 1000) return;
    this.last = now;
    this.send(canvas, w, p);
  }

  send(canvas, w, p) {
    this.busy = true;
    const t0 = performance.now();
    // 화면 그대로 보내지 않는다. 1920 짜리 그림을 모델에 보내면 몇 배로 느려진다
    const W = PAINT_SIZE;
    const H = Math.round((W * canvas.height) / canvas.width);
    if (this.small.width !== W || this.small.height !== H) {
      this.small.width = W;
      this.small.height = H;
    }
    this.sctx.drawImage(canvas, 0, 0, W, H);
    this.small.toBlob(async (blob) => {
      if (!blob) { this.busy = false; return; }
      const q = new URLSearchParams({ prompt: this.prompt(w.phase), strength: String(p.paintStrength) });
      try {
        const res = await fetch(`${PAINT_URL}/paint?${q}`, { method: "POST", body: blob });
        if (res.status === 429) { this.busy = false; return; }   // 아직 칠하는 중이면 건너뛴다
        if (!res.ok) throw new Error(res.status);
        const out = URL.createObjectURL(await res.blob());
        await new Promise((ok, bad) => {
          this.img.onload = ok;
          this.img.onerror = bad;
          this.img.src = out;
        });
        setTimeout(() => URL.revokeObjectURL(out), 2000);
        this.have = true;
        this.count++;
        this.took = (performance.now() - t0) / 1000;
        this.note = `덧칠 ${this.count}장 · 한 장에 ${this.took.toFixed(1)}초 · ${this.prompt(w.phase)}`;
      } catch {
        this.off = true;
        this.note = "덧칠 꺼짐 (python paint.py 로 켭니다)";
      } finally {
        this.busy = false;
      }
    }, "image/jpeg", 0.85);
  }

  /* 받은 그림을 원래 화면 위에 겹친다. 2D 그림판에 그린다 */
  drawTo(ctx, W, H, p) {
    ctx.clearRect(0, 0, W, H);
    if (!this.have || !p.paintMix) return;
    ctx.globalAlpha = this.mix * p.paintMix;
    ctx.drawImage(this.img, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}
