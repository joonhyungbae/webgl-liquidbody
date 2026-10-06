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
  // 그림 모델로 덧칠하는 정도. 0 이면 덧칠하지 않는다 (paint.py 를 켜 두어야 한다)
  { key: "paintMix", label: "덧칠", min: 0, max: 1, step: 0.02, value: 0 },
  // 받은 그림을 앞 그림과 섞는 정도. 클수록 떨림이 줄고, 대신 움직임을 늦게 따라온다
  // 0 이면 모델이 칠한 그대로. 가만히 앉아 보는 작품이라 0.5 안팎이 맞는다
  { key: "paintSmooth", label: "덧칠 부드럽게", min: 0, max: 0.95, step: 0.01, value: 0.5 },
  // 모델이 원래 그림을 얼마나 바꾸나. 크면 전혀 다른 그림이 된다
  // 0.5 를 넘으면 모델이 관객의 몸 위에 없는 얼굴과 옷을 지어낸다. 낮게 두어 색과 결만 얻는다
  { key: "paintStrength", label: "덧칠 세기", min: 0.1, max: 0.9, step: 0.02, value: 0.35 },
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

// ─── 덧칠 (paint.js) ─────────────────────────────────────────────────────
// 단계마다 다른 말을 보낸다. 같은 몸이라도 결계일 때와 빠질 때가 다르게 칠해진다.
//
// 말은 영어로 적는다. 그림 모델이 영어로 배웠기 때문에 한국어로 적으면 거의 알아듣지 못한다.
// 짧고 구체적인 말이 낫다. 긴 문장은 모델이 흘려듣는다.
//
// 얼굴을 그리지 말라고 매번 적어 둔다. 모델에 맡겨 두면 관객의 몸 위에 다른 사람의 얼굴을
// 지어낸다. 이 작품에서는 덩어리로 남아야 한다.
// 다만 이 모델(sd-turbo)은 부정 프롬프트를 쓰지 않아서 "no ○○" 가 약하게만 듣는다. 그림 모델은
// 구석에 화가의 서명 같은 낙서를 곧잘 그려 넣는데, "no signature" 라고 적으면 오히려 그 낱말을
// 그리는 쪽으로 읽힐 수 있어 적지 않았다.
export const PROMPTS = {
  // 기다림. 아무도 없다
  idle: "dark still water, ink wash, very pale blue, no face, abstract",
  // 결계. 빛이 한 번 퍼진다
  ring: "soft light spreading, watercolor, bleeding edges, pale blue white, no face, abstract shape",
  // 차오름. 물이 몸으로 들어온다
  fill: "clear water flowing into a body, watercolor, soft bleeding edges, pale blue white, no face, abstract figure",
  // 머무름. 가득 찬 채로 있다
  hold: "a body full of still water, calm, watercolor, pale warm white, no face, abstract figure",
  // 빠짐. 발밑으로 빠져나간다
  drain: "water draining away, fading body, watercolor, cold blue, no face, abstract figure",
  // 끝. 빈자리
  done: "empty pale paper, faint wash, almost white, no face",
};

// 모델에 보내는 그림의 가로 크기. 화면이 1920 이어도 이만큼 줄여서 보낸다.
// 모델은 작은 그림을 훨씬 빨리 칠하고, 경계가 번진 그림이라 늘려도 티가 안 난다.
// 초당 장 수가 모자라면 384 나 320 으로 줄인다. 512 를 넘기면 sd-turbo 가 배운 크기를 넘어
// 그림이 오히려 흐트러진다.
export const PAINT_SIZE = 448;
