/*
 시작하는 자리. 감지 → 액체의 시간 → 그림 을 한 프레임마다 잇는다.

 주소 뒤에 붙여 쓰는 것
   ?sim          카메라 없이 가짜 사람으로 시작
   ?display      조절판 없이 화면만 (전시용)
   ?video=...    카메라 대신 영상 파일로
   ?in=256       몸을 찾는 그림 크기(기본 384). 느린 기계에서 줄인다
   ?gpu          GPU 로 감지한다 (기본은 CPU)
   ?offline=20   20초를 녹화해 서버에 보내고 끝낸다 (./start.sh --offline 20 이 쓴다)

 카메라 영상은 이 브라우저 안에서만 돌고 어디로도 보내지 않는다. 적은 글도 마찬가지다.
*/

import { PARAMS, MASK_W, MASK_H } from "./settings.js";
import { CameraSense, SimSense } from "./sense.js";
import { Water } from "./water.js";
import { Text } from "./text.js";
import { Clip } from "./clip.js";
import { Paint } from "./paint.js";
import { FRAG } from "./look.js";
import { make } from "./gl.js";

const $ = (id) => document.getElementById(id);
const url = new URLSearchParams(location.search);

const STORE = "liquidbody.params.v1";
const DEFAULTS = Object.fromEntries(PARAMS.map((d) => [d.key, d.value]));
const p = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "null");
  if (saved && JSON.stringify(saved.defaults) === JSON.stringify(DEFAULTS)) Object.assign(p, saved.values);
} catch {}
const save = () => {
  try { localStorage.setItem(STORE, JSON.stringify({ defaults: DEFAULTS, values: p })); } catch {}
};

/* ---------- 조절판 ---------- */

function buildPanel() {
  const box = $("params");
  box.innerHTML = "";
  for (const d of PARAMS) {
    const row = document.createElement("label");
    row.className = "param";
    const input = document.createElement("input");
    if (d.type === "check") {
      input.type = "checkbox";
      input.checked = !!p[d.key];
    } else {
      input.type = "range";
      Object.assign(input, { min: d.min, max: d.max, step: d.step });
      input.value = p[d.key];
    }
    const out = document.createElement("output");
    const show = () => (out.textContent = d.type ? "" : Number(p[d.key]).toFixed(d.step < 1 ? 2 : 0));
    input.addEventListener("input", () => {
      p[d.key] = d.type === "check" ? input.checked : Number(input.value);
      show();
      save();
      text.shown = -1;        // 글을 다시 그리게 한다
    });
    show();
    row.append(Object.assign(document.createElement("span"), { textContent: d.label }), input, out);
    box.append(row);
  }
}

/* ---------- 감지 고르기 ---------- */

let sense = null;
const video = $("video");

async function useSource(kind, file) {
  sense?.stop();
  sense = null;
  $("status").textContent = "여는 중";
  try {
    sense = kind === "sim"
      ? new SimSense()
      : new CameraSense(video, { file, say: (t) => ($("status").textContent = t) });
    await sense.start();
    $("status").textContent = `${sense.source}${sense.note ? ` · ${sense.note}` : ""}`;
  } catch (e) {
    $("status").textContent = `열지 못했습니다: ${e.message || e}. 「가짜 사람」으로 바꿔 그림부터 볼 수 있습니다`;
    sense = new SimSense();
  }
}

$("source").addEventListener("change", (e) => {
  const v = e.target.value;
  if (v === "file") $("file").click();
  else useSource(v);
});
$("file").addEventListener("change", (e) => e.target.files[0] && useSource("file", e.target.files[0]));

/* ---------- 액체 영상 ---------- */

const clip = new Clip();
async function openClip(src) {
  try {
    const name = await clip.open(src);
    $("cliphint").textContent = `액체 영상: ${name}. 몸 안에서만 보입니다. 조절판의 「액체 영상 섞기」로 양을 바꿉니다`;
    $("clip").textContent = "액체 영상 바꾸기";
  } catch (e) {
    $("cliphint").textContent = `영상을 열지 못했습니다: ${e.message || e}`;
  }
}
$("clip").addEventListener("click", () => $("clipfile").click());
$("clipfile").addEventListener("change", (e) => e.target.files[0] && openClip(e.target.files[0]));

/* ---------- 글 ---------- */

const text = new Text();
$("sayform").addEventListener("submit", (e) => {
  e.preventDefault();
  text.say($("saytext").value);
  text.shown = -1;
});

/* ---------- 기록 ---------- */

let recorder = null;
function stamp() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function toggleRecord() {
  if (recorder) { recorder.stop(); return; }
  const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) =>
    window.MediaRecorder?.isTypeSupported?.(t)
  );
  if (!type) { $("status").textContent = "이 브라우저는 화면 녹화를 지원하지 않습니다"; return; }
  const chunks = [];
  recorder = new MediaRecorder($("out").captureStream(30), { mimeType: type });
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    download(new Blob(chunks, { type }), `liquidbody-${stamp()}.${type.includes("mp4") ? "mp4" : "webm"}`);
    recorder = null;
    $("rec").textContent = "녹화 시작";
    $("rec").classList.remove("on");
  };
  recorder.start(1000);
  $("rec").textContent = "녹화 멈추고 저장";
  $("rec").classList.add("on");
}
$("rec").addEventListener("click", toggleRecord);
$("snap").addEventListener("click", () => $("out").toBlob((b) => download(b, `liquidbody-${stamp()}.png`)));
$("only").addEventListener("click", () => document.body.classList.toggle("display"));
$("restart").addEventListener("click", () => water.go("idle"));
$("reset").addEventListener("click", () => {
  for (const d of PARAMS) p[d.key] = d.value;
  save();
  buildPanel();
});
addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  const k = e.key.toLowerCase();
  if (e.code === "Space") { e.preventDefault(); water.go("idle"); }
  if (k === "h") document.body.classList.toggle("display");
  if (k === "f") document.fullscreenElement ? document.exitFullscreen() : $("stage").requestFullscreen?.();
  if (k === "r") toggleRecord();
});

/* 전시 중에 화면이 저절로 꺼지면 안 된다. 되는 브라우저에서만 막는다. */
let wake = null;
async function keepAwake() {
  try {
    if (!wake && navigator.wakeLock) {
      wake = await navigator.wakeLock.request("screen");
      wake.addEventListener("release", () => (wake = null));
    }
  } catch {}
}
addEventListener("pointerdown", keepAwake);
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && keepAwake());

/* ---------- 한 프레임 ---------- */

const canvas = $("out");
const over = $("over");
const octx = over.getContext("2d");
const paint = new Paint();
const water = new Water();
let view = null;
try {
  view = make(canvas, FRAG);
} catch (e) {
  $("status").textContent = `셰이더를 올리지 못했습니다: ${e.message}`;
}
const prev = $("preview");
const pctx = prev.getContext("2d");
let last = performance.now();
let fps = 60;

function fit() {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);   // 셰이더가 무거워 화면 해상도를 조금 낮춘다
  const w = Math.max(320, Math.round(r.width * dpr));
  const h = Math.max(240, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  if (over.width !== w || over.height !== h) {
    over.width = w;
    over.height = h;
  }
}

function meter(id, v, t) {
  $(`m-${id}`).style.width = `${Math.min(1, Math.abs(v)) * 100}%`;
  $(`v-${id}`).textContent = t;
}

function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps = fps * 0.9 + (1 / Math.max(0.001, dt)) * 0.1;

  if (sense && view) {
    const f = sense.read(now);
    const w = water.step(dt, f, p);
    fit();
    view.mask(f.mask, MASK_W, MASK_H);
    const movie = clip.frame();
    if (movie) view.clip(movie);
    if (text.draw(w, p)) view.text(text.canvas);
    view.draw({
      uRes: [canvas.width, canvas.height],
      uTime: now / 1000,
      uBleed: p.bleed, uGrain: p.grain, uSoak: p.soak, uSurface: p.surface,
      uStars: p.stars, uWarm: p.warm, uPaper: p.paper,
      uWaterTop: w.waterTop, uWaterBottom: w.waterBottom, uFront: w.front,
      uRing: w.ring, uFade: w.fade, uMirror: p.mirror ? 1 : 0,
      uClipMix: movie ? p.clipMix : 0,
    });

    // 그림 모델이 다시 칠한 그림을 그 위에 천천히 겹친다
    paint.step(dt, canvas, w, p);
    paint.drawTo(octx, over.width, over.height, p);

    if (!document.body.classList.contains("display")) {
      pctx.save();
      if (p.mirror) { pctx.translate(prev.width, 0); pctx.scale(-1, 1); }
      pctx.drawImage(f.image, 0, 0, prev.width, prev.height);
      pctx.restore();
      meter("fill", f.fill * 8, f.present ? "있음" : "없음");
      meter("top", f.top, f.top.toFixed(2));
      meter("bot", f.bottom, f.bottom.toFixed(2));
      meter("filled", w.filled, w.filled.toFixed(2));
      $("phase").textContent = w.label;
      $("fps").textContent = `${Math.round(fps)} fps`;
      if (paint.note) $("painthint").textContent = paint.note;
    }
  }
  requestAnimationFrame(loop);
}

/* ---------- 시작 ---------- */

buildPanel();
if (url.has("display")) document.body.classList.add("display");
if (url.get("clip")) openClip(url.get("clip"));
if (url.get("video")) {
  $("source").value = "file";
  useSource("file", url.get("video"));
} else {
  const start = url.has("sim") ? "sim" : "camera";
  $("source").value = start;
  useSource(start);
}
requestAnimationFrame(loop);

/* ./start.sh --offline N. 장비 없이 N초를 녹화해 serve.py 에 보낸다. 검증용. */
const offline = Number(url.get("offline") || 0);
if (offline > 0) {
  setTimeout(() => {
    const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm"].find((t) => window.MediaRecorder?.isTypeSupported?.(t));
    if (!type) { $("status").textContent = "이 브라우저는 녹화를 지원하지 않습니다"; return; }
    const chunks = [];
    const rec = new MediaRecorder($("out").captureStream(30), { mimeType: type });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      const ext = type.includes("mp4") ? "mp4" : "webm";
      try {
        await fetch(`save?ext=${ext}`, { method: "POST", body: new Blob(chunks, { type }) });
        $("status").textContent = `out.${ext} 로 적었습니다. 이 창은 닫아도 됩니다`;
      } catch {
        download(new Blob(chunks, { type }), `out.${ext}`);
      }
    };
    $("status").textContent = `${offline}초 녹화 중`;
    rec.start(1000);
    setTimeout(() => rec.stop(), offline * 1000);
  }, 1500);
}

window.liquidbody = { p, water, text, clip, paint, get sense() { return sense; } };
