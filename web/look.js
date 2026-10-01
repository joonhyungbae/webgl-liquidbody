/*
 그림. **이 파일이 작가가 고칠 첫 번째 자리다.** (두 번째는 water.js)

 카메라가 준 몸 마스크 한 장을, 경계가 번진 수채화 덩어리로 바꾼다. 화면 전체가 셰이더
 한 장이고, 조절판의 값이 그 안의 숫자를 바꾼다.

 수채화처럼 보이게 하는 것은 세 가지다.
   번짐    마스크를 크게 흐려서 경계를 푼다
   결      흐리기 전에 자리를 잡음으로 흔들어 경계가 고르게 퍼지지 않게 한다
   가장자리 물감이 가장자리에 몰리는 성질. 큰 흐림과 작은 흐림의 차이로 만든다

 액체는 몸 안에서 수면 두 개(uWaterTop, uWaterBottom) 사이를 채운다. 차오를 때는 아래가
 내려가고, 빠질 때는 위가 내려간다. 시간의 규칙은 water.js 에 있다.

 바꿔 볼 것
   PALETTE 의 색 네 줄. 새벽빛과 미색 사이를 조절판의 「색」이 오간다
   edge 를 만드는 두 줄. 가장자리에 물감이 얼마나 몰릴지
   stars 의 밀도와 크기
*/

export const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uMask;     // 몸 마스크 (R)
uniform sampler2D uText;     // 글자 한 장 (RGBA)
uniform vec2  uRes;
uniform float uTime;
uniform float uBleed;        // 번짐
uniform float uGrain;        // 결의 크기
uniform float uSoak;         // 배어든 정도
uniform float uSurface;      // 수면의 일렁임
uniform float uStars;        // 별
uniform float uWarm;         // 색 치우침
uniform float uPaper;        // 종이결
uniform float uWaterTop;     // 액체의 위 수면 (0 화면 위 ~ 1 아래)
uniform float uWaterBottom;  // 액체의 아래 수면
uniform float uRing;         // 결계. 0~1 로 퍼진다. 0 이면 없음
uniform float uMirror;       // 1 이면 좌우를 뒤집어 거울처럼 본다
uniform float uFade;         // 전체 밝기. 들어오고 나갈 때 쓴다

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  // 겹을 셋만 쌓는다. 전시용 큰 화면에서도 가볍게 돌아야 한다
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}

/* 마스크를 둥글게 돌며 여러 번 읽어 흐린다. 한 번에 크게 흐리면 네모진 자국이 남는다. */
float blur(vec2 uv, float r) {
  float sum = texture(uMask, uv).r;
  float w = 1.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854;                 // 45도씩
    float d = (i < 4 ? 0.55 : 1.0) * r;
    vec2 o = vec2(cos(a), sin(a)) * d;
    o.y *= uRes.x / uRes.y;                      // 화면이 길어도 동그랗게 흐려지도록
    sum += texture(uMask, uv + o).r;
    w += 1.0;
  }
  return sum / w;
}

void main() {
  vec2 uv = vUv;
  uv.y = 1.0 - uv.y;                             // 위가 0, 아래가 1
  vec2 look = uv;
  if (uMirror > 0.5) look.x = 1.0 - look.x;

  // 결. 경계를 흔들어 물이 종이에 번진 것처럼 들쭉날쭉하게 만든다
  float g = max(0.2, uGrain);
  vec2 wobble = vec2(
    fbm(look * (6.0 / g) + uTime * 0.05),
    fbm(look * (6.0 / g) + 13.7 - uTime * 0.04)
  ) - 0.5;
  vec2 mv = look + wobble * uBleed * 0.09;

  float near = blur(mv, 0.004 + uBleed * 0.012);
  float far  = blur(mv, 0.012 + uBleed * 0.05);
  float body = smoothstep(0.32, 0.62, far);
  // 물감이 가장자리에 몰린다. 큰 흐림과 작은 흐림의 차이가 그 테두리다
  float edge = clamp((near - far) * 2.6, 0.0, 1.0) * body;
  float inner = mix(near, far, 0.5) * body;

  // 색. 새벽의 푸름과 종이의 미색 사이를 오간다
  vec3 paper = mix(vec3(0.047, 0.059, 0.082), vec3(0.086, 0.078, 0.071), uWarm);
  vec3 ink   = mix(vec3(0.42, 0.56, 0.68), vec3(0.72, 0.66, 0.56), uWarm);
  vec3 wet   = mix(vec3(0.78, 0.92, 0.96), vec3(0.98, 0.95, 0.88), uWarm);
  vec3 spark = mix(vec3(0.78, 0.9, 1.0), vec3(1.0, 0.94, 0.8), uWarm);

  // 물이 들기 전의 몸은 비어 있는 그릇이다. 옅게 두고 가장자리만 남긴다
  vec3 col = paper;
  col = mix(col, ink * 0.55, inner * (0.2 + uSoak * 0.45));
  col = mix(col, ink, edge * 0.85);

  // 액체. 몸 안에서 두 수면 사이를 채운다. 수면은 잔물결로 흔들린다
  float ripple = (fbm(vec2(look.x * 7.0, uTime * 0.5)) - 0.5) * uSurface * 0.07
               + sin(look.x * 11.0 + uTime * 1.3) * uSurface * 0.012;
  float top = uWaterTop + ripple;
  float bot = uWaterBottom + ripple * 0.6;
  float soft = 0.012 + uSurface * 0.02;
  float water = smoothstep(top - soft, top + soft, uv.y) * (1.0 - smoothstep(bot - soft, bot + soft, uv.y));
  water *= body;

  col = mix(col, wet, water * (0.5 + 0.45 * inner));
  // 수면의 앞머리만 한 번 더 밝다. 물이 들어오는 자리가 보이게 한다
  float front = exp(-pow((uv.y - top) / (0.02 + uSurface * 0.02), 2.0)) * body;
  col += wet * front * 0.5;

  // 별. 액체 안에서 더 밝다. 물에 섞여 도는 작은 빛이다
  vec2 grid = look * vec2(46.0, 34.0) + vec2(0.0, uTime * 0.22);
  vec2 cell = floor(grid);
  float star = hash(cell);
  if (star > 0.965) {
    vec2 mid = fract(grid) - vec2(hash(cell + 7.1), hash(cell + 3.3));
    mid.y *= uRes.y / uRes.x * 1.4;
    float twinkle = 0.45 + 0.55 * sin(uTime * 2.4 + star * 31.4);
    float dot_ = exp(-dot(mid, mid) * 220.0) * twinkle;
    col += spark * dot_ * uStars * (1.2 + water * 2.5);
  }

  // 결계. 앉은 순간 한 번 퍼지는 반원
  if (uRing > 0.001) {
    float d = distance(vec2(uv.x, uv.y * 1.15), vec2(0.5, 0.62));
    float r = uRing * 0.75;
    float ring = exp(-pow((d - r) / 0.015, 2.0));
    col += spark * ring * (1.0 - uRing) * 0.9;
  }

  // 글자. 액체가 지나간 자리에서는 지워진다. 물이 차오르며 글이 사라지는 자리다
  vec4 t = texture(uText, vec2(vUv.x, vUv.y));
  float wash = smoothstep(top - 0.02, top + 0.06, uv.y);
  float letters = t.a * (1.0 - wash);
  col = mix(col, wet * 1.05, letters * 0.9);

  // 종이결과 가장자리 어둠
  float paperGrain = (noise(vUv * uRes / 2.2) - 0.5) * uPaper * 0.1;
  col += paperGrain;
  col *= smoothstep(1.25, 0.3, distance(vUv, vec2(0.5)));
  col *= uFade;

  outColor = vec4(col, 1.0);
}`;
