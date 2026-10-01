/*
 만지는 숫자는 전부 여기 있다.

 화면 오른쪽 조절판의 값은 여기 적힌 것이 처음 값이다. 조절판에서 바꾼 값은 그 브라우저에
 남아 새로 고침해도 그대로다. 이 파일의 처음 값을 고치면 남아 있던 값을 버리고 다시 시작한다.

 몸이 어떤 덩어리로 보이는지(그림의 성격)는 숫자만으로 정해지지 않아서 look.js 에,
 액체가 언제 차고 언제 빠지는지(시간의 규칙)는 water.js 에 있다.
*/

// ─── 조절판 ──────────────────────────────────────────────────────────────
export const PARAMS = [
  // 몸의 경계가 번지는 정도. 크면 수채화처럼 풀리고, 0 에 가까우면 오려 낸 실루엣이 된다
  { key: "bleed", label: "번짐", min: 0, max: 1, step: 0.02, value: 0.55 },
  // 경계를 흔드는 결의 크기. 작으면 잘게 떨리고 크면 크게 일렁인다
  { key: "grain", label: "결의 크기", min: 0.2, max: 3, step: 0.05, value: 1.0 },
  // 몸이 종이에 밴 정도. 크면 안쪽이 고르게 차고, 작으면 가장자리만 진하다
  { key: "soak", label: "배어든 정도", min: 0, max: 1, step: 0.02, value: 0.45 },
  // 액체가 머리에서 발까지 내려오는 데 걸리는 시간
  { key: "fillSeconds", label: "차오르는 시간(초)", min: 4, max: 90, step: 1, value: 24 },
  // 발밑으로 빠져나가는 데 걸리는 시간
  { key: "drainSeconds", label: "빠지는 시간(초)", min: 2, max: 60, step: 1, value: 14 },
  // 액체의 앞머리가 일렁이는 폭
  { key: "surface", label: "수면의 일렁임", min: 0, max: 1, step: 0.02, value: 0.4 },
  // 작가가 만든 액체 영상을 쓸지. 0 이면 셰이더가 만든 액체만 보인다
  { key: "clipMix", label: "액체 영상 섞기", min: 0, max: 1, step: 0.02, value: 0.85 },
  // 별이 얼마나 많이 보이나
  { key: "stars", label: "별", min: 0, max: 1, step: 0.02, value: 0.5 },
  // 색의 온도. 0 이면 푸른 새벽, 1 이면 따뜻한 미색
  { key: "warm", label: "색 (새벽 ↔ 미색)", min: 0, max: 1, step: 0.02, value: 0.3 },
  // 종이결. 화면이 매끈하지 않고 종이처럼 보이게 한다
  { key: "paper", label: "종이결", min: 0, max: 1, step: 0.02, value: 0.35 },
  { key: "mirror", label: "좌우 뒤집기", type: "check", value: true },
  { key: "text", label: "글 띄우기", type: "check", value: true },
];

// ─── 감지 ────────────────────────────────────────────────────────────────
export const INPUT_WIDTH = 384;    // 사람을 찾는 그림의 가로. 느린 기계에서는 주소에 ?in=256
export const MASK_W = 256;         // 몸 마스크의 크기. 셰이더가 이것을 받아 번지게 한다
export const MASK_H = 192;
export const MASK_SMOOTH = 0.45;   // 마스크가 프레임마다 튀지 않게 섞는 정도. 1 이면 섞지 않는다
export const PRESENT_AT = 0.012;   // 화면의 이만큼이 사람으로 차면 「앉았다」고 본다
export const GONE_SECONDS = 2.0;   // 사람이 사라지고 이만큼 지나면 처음으로 돌아간다

// ─── 액체 (water.js) ─────────────────────────────────────────────────────
export const HOLD_SECONDS = 6;     // 다 찬 뒤 그대로 머무는 시간
export const START_DELAY = 1.2;    // 앉고 나서 결계가 쳐지기까지
export const RING_SECONDS = 1.6;   // 결계가 퍼지는 시간

// ─── 글 (text.js) ────────────────────────────────────────────────────────
export const LINES = [
  "오늘 당신을 잠 못 들게 한 것은 무엇인가요",
  "적지 않아도 됩니다. 떠올리기만 해도 됩니다",
];
export const LINE_SECONDS = 5.5;   // 한 줄이 떠 있는 시간
export const ANSWER_HINT = "여기에 적으면 액체가 지워 갑니다";
