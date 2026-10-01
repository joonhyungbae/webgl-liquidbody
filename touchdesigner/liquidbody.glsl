// 터치디자이너의 GLSL TOP 에 그대로 붙여 넣는 픽셀 셰이더.
//
// 브라우저 쪽 web/look.js 와 같은 그림을 그린다. 터치디자이너로 옮길 때 노드로 바꾸기
// 번거로운 부분(잡음으로 흔든 번짐, 가장자리에 몰리는 물감, 액체의 두 수면)을 한 덩이로 둔 것이다.
//
// 입력
//   첫 번째 입력  몸 마스크. 사람이 1, 배경이 0. 흑백이면 된다
//   두 번째 입력  글자 한 장(선택). 없으면 안 넣어도 된다
//
// 쓰는 법과 파라미터 이름은 같은 폴더의 「네트워크-만드는-법.md」에 적어 두었다.

out vec4 fragColor;

uniform float uTime;         // absTime.seconds
uniform vec2  uRes;          // 이 TOP 의 가로세로 픽셀
uniform float uBleed;        // 번짐 0~1
uniform float uGrain;        // 결의 크기 0.2~3
uniform float uSoak;         // 배어든 정도 0~1
uniform float uSurface;      // 수면의 일렁임 0~1
uniform float uStars;        // 별 0~1
uniform float uWarm;         // 색 0 새벽 ~ 1 미색
uniform float uPaper;        // 종이결 0~1
uniform float uWaterTop;     // 액체의 위 수면 0 화면 위 ~ 1 아래
uniform float uWaterBottom;  // 액체의 아래 수면
uniform float uFront;        // 지금 움직이는 수면. 글은 이것이 지나갈 때 지워진다
uniform float uRing;         // 결계 0~1. 0 이면 없음
uniform float uFade;         // 전체 밝기 0~1

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}

// 마스크를 둥글게 돌며 여러 번 읽어 흐린다. 한 번에 크게 흐리면 네모진 자국이 남는다.
float blurMask(vec2 uv, float r) {
  float sum = texture(sTD2DInputs[0], uv).r;
  float w = 1.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854;
    float d = (i < 4 ? 0.55 : 1.0) * r;
    vec2 o = vec2(cos(a), sin(a)) * d;
    o.y *= uRes.x / max(1.0, uRes.y);
    sum += texture(sTD2DInputs[0], uv + o).r;
    w += 1.0;
  }
  return sum / w;
}

void main() {
  vec2 uv = vec2(vUV.s, 1.0 - vUV.t);          // 위가 0, 아래가 1

  float g = max(0.2, uGrain);
  vec2 wobble = vec2(
    fbm(uv * (6.0 / g) + uTime * 0.05),
    fbm(uv * (6.0 / g) + 13.7 - uTime * 0.04)
  ) - 0.5;
  vec2 mv = vec2(uv.x, 1.0 - uv.y) + wobble * uBleed * 0.09;   // 마스크는 TD 좌표로 읽는다

  float near = blurMask(mv, 0.004 + uBleed * 0.012);
  float far  = blurMask(mv, 0.012 + uBleed * 0.05);
  float body = smoothstep(0.32, 0.62, far);
  float edge = clamp((near - far) * 2.6, 0.0, 1.0) * body;
  float inner = mix(near, far, 0.5) * body;

  vec3 paper = mix(vec3(0.047, 0.059, 0.082), vec3(0.086, 0.078, 0.071), uWarm);
  vec3 ink   = mix(vec3(0.42, 0.56, 0.68), vec3(0.72, 0.66, 0.56), uWarm);
  vec3 wet   = mix(vec3(0.78, 0.92, 0.96), vec3(0.98, 0.95, 0.88), uWarm);
  vec3 spark = mix(vec3(0.78, 0.9, 1.0), vec3(1.0, 0.94, 0.8), uWarm);

  vec3 col = paper;
  col = mix(col, ink * 0.55, inner * (0.2 + uSoak * 0.45));
  col = mix(col, ink, edge * 0.85);

  float ripple = (fbm(vec2(uv.x * 7.0, uTime * 0.5)) - 0.5) * uSurface * 0.07
               + sin(uv.x * 11.0 + uTime * 1.3) * uSurface * 0.012;
  float top = uWaterTop + ripple;
  float bot = uWaterBottom + ripple * 0.6;
  float soft = 0.012 + uSurface * 0.02;
  float water = smoothstep(top - soft, top + soft, uv.y) * (1.0 - smoothstep(bot - soft, bot + soft, uv.y));
  water *= body;

  col = mix(col, wet, water * (0.5 + 0.45 * inner));
  float front = exp(-pow((uv.y - top) / (0.02 + uSurface * 0.02), 2.0)) * body;
  col += wet * front * 0.5;

  vec2 grid = uv * vec2(46.0, 34.0) + vec2(0.0, uTime * 0.22);
  vec2 cell = floor(grid);
  float star = hash(cell);
  if (star > 0.965) {
    vec2 mid = fract(grid) - vec2(hash(cell + 7.1), hash(cell + 3.3));
    mid.y *= uRes.y / max(1.0, uRes.x) * 1.4;
    float twinkle = 0.45 + 0.55 * sin(uTime * 2.4 + star * 31.4);
    col += spark * exp(-dot(mid, mid) * 220.0) * twinkle * uStars * (1.2 + water * 2.5);
  }

  if (uRing > 0.001) {
    float d = distance(vec2(uv.x, uv.y * 1.15), vec2(0.5, 0.62));
    float ring = exp(-pow((d - uRing * 0.75) / 0.015, 2.0));
    col += spark * ring * (1.0 - uRing) * 0.9;
  }

  // 글자. 두 번째 입력이 있을 때만. 움직이는 수면이 지나가면 지워진다
#if TD_NUM_2D_INPUTS > 1
  float letters = texture(sTD2DInputs[1], vUV.st).a;
  float edgeY = uFront + ripple;
  letters *= 1.0 - smoothstep(uv.y - 0.05, uv.y + 0.02, edgeY);
  col = mix(col, wet * 1.05, letters * 0.9);
#endif

  col += (noise(vUV.st * uRes / 2.2) - 0.5) * uPaper * 0.1;
  col *= smoothstep(1.25, 0.3, distance(vUV.st, vec2(0.5)));
  col *= uFade;

  fragColor = TDOutputSwizzle(vec4(col, 1.0));
}
