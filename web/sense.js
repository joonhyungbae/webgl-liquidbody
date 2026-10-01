/*
 감지. 카메라에 비친 사람의 몸을 0~1 의 마스크 한 장으로 바꾼다.

 매 프레임 내보내는 것
   mask     MASK_W×MASK_H 칸. 1 에 가까울수록 사람 몸이다
   present  지금 사람이 있나
   top      몸의 가장 위(0 화면 위, 1 화면 아래). 액체가 여기서부터 들어온다
   bottom   몸의 가장 아래. 액체가 여기로 빠져나간다

 몸을 찾는 일은 MediaPipe Image Segmenter(Apache-2.0)가 한다. 관절이 아니라 몸 전체를
 한 덩어리로 주기 때문에 수채화 덩어리로 바꾸기에 맞다. 인터넷에서 아무것도 불러오지 않는다.

 카메라가 없으면 「가짜 사람」으로 돌린다. 장비 없이 그림부터 만들어 보라고 둔 것이다.
*/

import { INPUT_WIDTH, MASK_W, MASK_H, MASK_SMOOTH, PRESENT_AT } from "./settings.js";

const IN_W = Math.max(192, Math.min(640, Number(new URLSearchParams(location.search).get("in")) || INPUT_WIDTH));
const IN_H = Math.round((IN_W * 3) / 4);

// 라이브러리는 저장소에 들어 있고(web/vendor/mediapipe), 모델은 설치할 때 web/models/ 에 받는다.
// 둘 다 index.html 기준 경로다. 이 파일 기준으로 부르면 다른 곳을 찾는다.
const LIB = new URL("vendor/mediapipe", document.baseURI).href;
const MODEL = new URL("models/selfie_segmenter.tflite", document.baseURI).href;

async function exists(url) {
  try {
    return (await fetch(url, { method: "HEAD" })).ok;
  } catch {
    return false;
  }
}

/* 마스크에서 몸의 위아래 끝과 넓이를 잰다. 액체가 들어오고 나가는 자리다. */
function measure(mask) {
  let top = 1, bottom = 0, area = 0;
  for (let y = 0; y < MASK_H; y++) {
    let row = 0;
    for (let x = 0; x < MASK_W; x++) row += mask[y * MASK_W + x];
    if (row > MASK_W * 0.01) {
      const v = y / (MASK_H - 1);
      if (v < top) top = v;
      if (v > bottom) bottom = v;
    }
    area += row;
  }
  const fill = area / (MASK_W * MASK_H);
  return { top: top > bottom ? 0 : top, bottom, fill, present: fill > PRESENT_AT };
}

export class CameraSense {
  constructor(video, { file = null, deviceId = null, say = () => {} } = {}) {
    this.video = video;
    this.file = file;
    this.deviceId = deviceId;
    this.say = say;
    this.source = file ? "영상 파일" : "카메라";
    this.note = "";
    this.input = document.createElement("canvas");
    this.input.width = IN_W;
    this.input.height = IN_H;
    this.ictx = this.input.getContext("2d", { willReadFrequently: true });
    this.mask = new Float32Array(MASK_W * MASK_H);
    this.frame = { mask: this.mask, present: false, top: 0, bottom: 1, fill: 0, image: this.input };
    this.fps = 0;
    this._last = 0;
    this._lastTs = -1;
  }

  async start() {
    if (this.file) {
      this.video.src = typeof this.file === "string" ? this.file : URL.createObjectURL(this.file);
      this.video.loop = true;
      this.video.muted = true;
    } else {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("이 브라우저에서는 카메라를 열 수 없습니다. 주소가 localhost 이거나 https 여야 합니다");
      }
      const video = { width: 1280, height: 720 };
      if (this.deviceId) video.deviceId = { exact: this.deviceId };
      this.video.srcObject = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    }
    await this.video.play();

    if (!(await exists(MODEL))) {
      throw new Error("몸을 찾는 모델이 없습니다. 터미널에서 python3 fetch_model.py 를 한 번 실행하세요");
    }
    this.say("MediaPipe 를 여는 중");
    const vision = await import(`${LIB}/vision_bundle.mjs`);
    const fileset = await vision.FilesetResolver.forVisionTasks(`${LIB}/wasm`);
    // 기본은 CPU 다. GPU 로 돌리면 마스크가 비어 나오는 기계가 있었다. 주소에 ?gpu 로 바꿔 본다.
    const how = new URLSearchParams(location.search).has("gpu") ? "GPU" : "CPU";
    this.seg = await vision.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate: how },
      runningMode: "VIDEO",
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
    this.note = `MediaPipe · ${how} · 입력 ${IN_W}×${IN_H}`;
  }

  stop() {
    this.video.srcObject?.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
    this.seg?.close();
  }

  read(now) {
    const v = this.video;
    if (!this.seg || v.readyState < 2) return this.frame;
    if (v.currentTime === this._lastTs && !this.file) return this.frame;
    this._lastTs = v.currentTime;

    // 화면 비율이 달라도 가운데를 4:3 으로 잘라 넣는다
    const vw = v.videoWidth, vh = v.videoHeight;
    const want = IN_W / IN_H;
    let sw = vw, sh = vh;
    if (vw / vh > want) sw = vh * want;
    else sh = vw / want;
    this.ictx.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, IN_W, IN_H);

    this.seg.segmentForVideo(this.input, now, (res) => {
      const m = res.confidenceMasks?.[0];
      if (!m) return;
      const src = m.getAsFloat32Array();
      const sx = m.width / MASK_W, sy = m.height / MASK_H;
      // 프레임마다 마스크가 튀면 덩어리가 떨린다. 직전 것과 섞어 둔다
      const k = MASK_SMOOTH;
      for (let y = 0; y < MASK_H; y++) {
        const row = Math.floor(y * sy) * m.width;
        for (let x = 0; x < MASK_W; x++) {
          const i = y * MASK_W + x;
          this.mask[i] += (src[row + Math.floor(x * sx)] - this.mask[i]) * k;
        }
      }
      m.close?.();
      this.frame = { mask: this.mask, image: this.input, ...measure(this.mask) };
    });

    const dt = now - this._last;
    if (dt > 0) this.fps = this.fps * 0.9 + (1000 / dt) * 0.1;
    this._last = now;
    return this.frame;
  }
}

/* 가짜 사람. 카메라 없이 그림을 만들어 보려고 둔다. 앉은 사람의 윤곽이 숨 쉰다. */
export class SimSense {
  constructor() {
    this.source = "가짜 사람";
    this.note = "카메라 없이 앉은 사람의 윤곽을 그리는 중";
    this.mask = new Float32Array(MASK_W * MASK_H);
    this.canvas = document.createElement("canvas");
    this.canvas.width = MASK_W;
    this.canvas.height = MASK_H;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    this.fps = 60;
    this.frame = { mask: this.mask, present: true, top: 0.12, bottom: 0.95, fill: 0.1, image: this.canvas };
  }

  async start() {}
  stop() {}

  read(now) {
    const t = now / 1000;
    const c = this.ctx;
    const W = MASK_W, H = MASK_H;
    c.fillStyle = "#000";
    c.fillRect(0, 0, W, H);
    c.fillStyle = "#fff";

    const breath = Math.sin(t * 0.8) * 0.005;        // 숨
    const cx = W * (0.5 + Math.sin(t * 0.21) * 0.004);
    const headY = H * (0.17 + breath);
    const headR = W * 0.075;

    // 머리
    c.beginPath();
    c.arc(cx, headY, headR, 0, Math.PI * 2);
    c.fill();
    // 목과 어깨
    c.lineCap = "round";
    c.lineJoin = "round";
    c.strokeStyle = "#fff";
    c.lineWidth = W * 0.05;
    c.beginPath();
    c.moveTo(cx, headY + headR * 0.7);
    c.lineTo(cx, H * 0.3);
    c.stroke();
    // 몸통. 앉아 있어 짧고, 아래로 가며 조금 넓어진다
    c.beginPath();
    c.moveTo(cx - W * 0.095, H * 0.3);
    c.quadraticCurveTo(cx - W * 0.1, H * 0.5, cx - W * 0.095, H * 0.62);
    c.lineTo(cx + W * 0.095, H * 0.62);
    c.quadraticCurveTo(cx + W * 0.1, H * 0.5, cx + W * 0.095, H * 0.3);
    c.closePath();
    c.fill();
    // 무릎 위에 올린 두 팔
    c.lineWidth = W * 0.042;
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + side * W * 0.09, H * 0.34);
      c.quadraticCurveTo(cx + side * W * 0.15, H * 0.52, cx + side * W * 0.075, H * 0.64 + breath * H * 2);
      c.stroke();
    }
    // 앞으로 접은 허벅지와 아래로 내린 종아리
    c.lineWidth = W * 0.075;
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + side * W * 0.05, H * 0.6);
      c.lineTo(cx + side * W * 0.075, H * 0.72);
      c.lineTo(cx + side * W * 0.07, H * 0.93);
      c.stroke();
    }

    const px = c.getImageData(0, 0, W, H).data;
    for (let i = 0; i < this.mask.length; i++) this.mask[i] = px[i * 4] / 255;
    this.frame = { mask: this.mask, image: this.canvas, ...measure(this.mask) };
    return this.frame;
  }
}
