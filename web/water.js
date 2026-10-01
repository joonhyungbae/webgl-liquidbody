/*
 액체. **이 파일이 작가가 고칠 두 번째 자리다.** (첫 번째는 look.js)

 한 사람이 앉아서 일어날 때까지의 시간을 정한다. 그림의 생김새가 아니라 순서와 길이다.

   기다림   아무도 없다. 바탕과 별만 있다
   결계     사람이 앉고 조금 지나면 한 번 퍼진다. 시작을 알리는 신호다
   차오름   액체가 머리에서 발끝으로 내려오며 몸을 채운다
   머무름   다 찬 채로 잠시 그대로 있다
   빠짐     발밑으로 빠져나간다. 위 수면이 내려오고 몸이 비워진다
   끝       잠시 뒤 기다림으로 돌아간다

 내보내는 것
   waterTop, waterBottom   액체가 차 있는 구간 (0 화면 위 ~ 1 아래)
   ring                    결계가 퍼진 정도 0~1. 0 이면 없음
   fade                    전체 밝기 0~1
   phase                   지금 어느 단계인지. 화면에 글로 보인다

 바꿔 볼 것
   차오름과 빠짐의 시간은 조절판에 있다. 호흡이 여기서 정해진다
   머무름 뒤에 바로 빠지지 않고 한 번 더 차오르게 하면 호흡이 두 번이 된다
   사람이 일어나면 곧바로 빠지게 할 수도 있다. 지금은 시간이 다 지나야 끝난다
*/

import { HOLD_SECONDS, START_DELAY, RING_SECONDS, GONE_SECONDS } from "./settings.js";

const PHASES = {
  idle: "기다림", ring: "결계", fill: "차오름", hold: "머무름", drain: "빠짐", done: "끝",
};

export class Water {
  constructor() {
    this.phase = "idle";
    this.t = 0;          // 지금 단계에 들어온 뒤 흐른 시간
    this.seen = 0;       // 사람이 보인 시간
    this.gone = 0;       // 사람이 사라진 시간
    this.top = 0.1;      // 몸의 위아래. 액체가 여기서 시작하고 여기서 끝난다
    this.bottom = 0.95;
  }

  go(phase) {
    this.phase = phase;
    this.t = 0;
  }

  /* dt 는 지난 시간(초), f 는 sense.js 가 준 프레임, p 는 조절판 */
  step(dt, f, p) {
    this.t += dt;
    if (f.present) {
      this.seen += dt;
      this.gone = 0;
      // 몸의 끝은 천천히 따라간다. 사람이 조금 움직여도 수면이 덜컥거리지 않게 한다
      this.top += (f.top - this.top) * Math.min(1, dt * 2);
      this.bottom += (f.bottom - this.bottom) * Math.min(1, dt * 2);
    } else {
      this.gone += dt;
      this.seen = 0;
    }

    switch (this.phase) {
      case "idle":
        if (this.seen > START_DELAY) this.go("ring");
        break;
      case "ring":
        if (this.t > RING_SECONDS) this.go("fill");
        break;
      case "fill":
        if (this.t > p.fillSeconds) this.go("hold");
        break;
      case "hold":
        if (this.t > HOLD_SECONDS) this.go("drain");
        break;
      case "drain":
        if (this.t > p.drainSeconds) this.go("done");
        break;
      case "done":
        if (this.t > 2) this.go("idle");
        break;
    }
    // 사람이 오래 자리를 뜨면 처음으로 돌아간다. 다음 사람이 처음부터 겪게 하려는 것이다
    if (this.gone > GONE_SECONDS && this.phase !== "idle") this.go("idle");

    return this.shape(p);
  }

  /* 지금 단계에서 액체가 어디까지 차 있는지 */
  shape(p) {
    const top = this.top, bottom = this.bottom;
    const ease = (u) => u * u * (3 - 2 * u);     // 처음과 끝이 느리게
    let waterTop = top, waterBottom = top, ring = 0, fade = 1;

    if (this.phase === "ring") {
      ring = Math.min(1, this.t / RING_SECONDS);
    } else if (this.phase === "fill") {
      waterBottom = top + (bottom - top) * ease(Math.min(1, this.t / p.fillSeconds));
    } else if (this.phase === "hold") {
      waterBottom = bottom;
    } else if (this.phase === "drain") {
      waterTop = top + (bottom - top) * ease(Math.min(1, this.t / p.drainSeconds));
      waterBottom = bottom;
    } else if (this.phase === "done") {
      waterTop = bottom;
      waterBottom = bottom;
      fade = Math.max(0.35, 1 - this.t / 2);
    }

    const filled = Math.max(0, waterBottom - waterTop) / Math.max(0.001, bottom - top);
    // 지금 움직이고 있는 수면. 차오를 때는 아래가, 빠질 때는 위가 내려간다.
    // 글은 이 수면이 지나갈 때 지워진다
    const front = this.phase === "drain" ? waterTop : waterBottom;
    return { waterTop, waterBottom, front, ring, fade, filled, phase: this.phase, label: PHASES[this.phase] };
  }
}
