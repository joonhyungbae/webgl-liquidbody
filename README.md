# webgl-liquidbody

**사람이 카메라 앞에 앉으면 그 몸이 경계가 번진 수채화 덩어리로 화면에 나타납니다.** 잠시 뒤
맑은 액체가 머리에서 들어와 몸을 채우며 내려오고, 다 차면 발밑으로 빠져나갑니다. 액체가
지나간 자리의 글자는 물에 씻기듯 지워집니다.

웹캠 한 대와 노트북, 브라우저로 돕니다. [MediaPipe](https://ai.google.dev/edge/mediapipe) 가 몸을
한 덩어리로 떼어내고, 그 덩어리를 수채화처럼 번지게 하는 일은 WebGL 셰이더가 합니다.
터치디자이너도 유니티도 켤 필요가 없습니다. 완성된 작품이 아니라 출발점이고, 바꿔 가며
자기 작품으로 만들라고 둔 예제입니다.

여기에 그림 모델(sd-turbo)이 화면을 실시간으로 다시 칠하는 **덧칠**을 더할 수 있습니다.
덧칠은 따로 깔아야 하고, 애플 실리콘 맥이나 NVIDIA 그래픽 칩이 있는 컴퓨터에서 씁니다
([7절](#7-그림-모델로-덧칠하기)). 덧칠이 없어도 작품은 처음부터 끝까지 돕니다.

설치 없이 보려면 <https://joonhyungbae.github.io/webgl-liquidbody/> 를 크롬으로 엽니다.
카메라 권한을 허락하면 바로 몸이 잡힙니다. 카메라 없이 보려면 주소 뒤에 `?sim` 을 붙입니다.
이 주소에는 덧칠이 없습니다. 덧칠은 그림 모델이 돌아가는 내 컴퓨터에서만 됩니다.

《2026 오픈서킷 부산: 아트앤테크 프랙티스》 멘토링 과정에서 만든 예제입니다. 참여 작가와
작업을 구상하다 공통으로 쓸 만한 뼈대가 나와, 참여자 누구나 쓸 수 있도록 공개합니다.

## 1. 깔기

터미널을 엽니다. 윈도우는 시작 메뉴에서 `PowerShell`, 맥은 `터미널`입니다.

**맥 · 리눅스**

```bash
curl -fsSL https://raw.githubusercontent.com/joonhyungbae/webgl-liquidbody/main/install.sh | bash
```

**윈도우 (PowerShell)**

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
irm https://raw.githubusercontent.com/joonhyungbae/webgl-liquidbody/main/install.ps1 -OutFile "$env:TEMP\install.ps1"
& "$env:TEMP\install.ps1"
```

설치가 챙기는 것: conda 환경(`liquidbody`)과 몸을 찾는 모델(약 250KB).
conda 가 없으면 [Miniforge](https://conda-forge.org/download/)를 사용자 폴더에 먼저 깝니다.
덧칠까지 쓰려면 [7절](#7-그림-모델로-덧칠하기)의 설치를 한 번 더 합니다.

## 2. 켜기

```bash
./start.sh          # 맥 · 리눅스
.\start.ps1         # 윈도우
```

브라우저가 저절로 열립니다. 안 열리면 `127.0.0.1:7000` 을 칩니다. 끌 때는 <kbd>Ctrl</kbd>+<kbd>C</kbd>.
맥에서는 폴더의 `start.command` 를 더블클릭해도 켜집니다.

| 명령 | 하는 일 |
|---|---|
| `./start.sh` | 카메라로 켠다 |
| `./start.sh --sim` | 카메라 없이 가짜 사람으로. 앉은 사람의 윤곽이 숨 쉰다 |
| `./start.sh --display` | 조절판 없이 화면만. 전시용이다 |
| `./start.sh --light` | 가벼운 노트북용. 감지 그림과 화면 해상도를 낮춘다 |
| `./start.sh --paint` | 그림 모델 덧칠까지 같이 켠다. 7절의 설치가 먼저다 |
| `./start.sh --offline 20` | 20초를 녹화해 out 파일로 적고 끝낸다 |
| `./start.sh --host 0.0.0.0` | 다른 컴퓨터에서 화면을 본다 |
| `./start.sh --host 0.0.0.0 --https` | 다른 컴퓨터에서 그 기기의 카메라까지 쓴다 |
| `./start.sh --port 7001` | 포트를 바꾼다 |

카메라 대신 영상 파일로 보려면 화면 오른쪽 위의 「영상 파일 열기」를 고릅니다.

## 3. 화면에서 보는 것

- **왼쪽 큰 화면**: 수채화 덩어리가 된 몸과, 그 안을 채우는 액체. 별이 함께 돕니다
- **감지한 것**: 카메라가 본 것과 몸 마스크. 몸의 위아래 끝이 액체가 드나드는 자리입니다
- **지금 단계**: 기다림 · 결계 · 차오름 · 머무름 · 빠짐. 시간의 규칙은 `web/water.js` 입니다
- **조절**: 번짐부터 색까지. 바꾼 값은 이 브라우저에 남습니다

## 4. 바꾸는 자리

1. **`web/settings.js`** — 숫자가 전부 여기 있습니다. 조절판 항목도 이 파일에서 만듭니다.
2. **`web/look.js`** — 몸이 어떤 덩어리로 보이는지. 셰이더 한 장이고, 색 네 줄부터 만져 보세요.
3. **`web/water.js`** — 액체가 언제 차고 언제 빠지는지. 작품의 호흡이 여기서 정해집니다.
4. **`web/text.js`** — 어떤 글이 언제 뜨는지. 지우는 쪽은 글이 아니라 액체가 맡습니다.

고치고 브라우저를 새로 고치면 바로 보입니다. 빌드가 없습니다.

## 5. 수채화처럼 보이게 하는 것

몸 마스크는 경계가 뚜렷한 오려 낸 모양입니다. 그대로 쓰면 실루엣이고, 수채화로 보이려면
세 가지를 더합니다. `web/look.js` 의 같은 이름을 찾으면 됩니다.

| 이름 | 하는 일 |
|---|---|
| `wobble` | 흐리기 전에 자리를 잡음으로 흔든다. 경계가 고르게 퍼지지 않고 종이에 번진 것처럼 들쭉날쭉해진다 |
| `blur` | 마스크를 둥글게 돌며 여러 번 읽어 흐린다. 한 번에 크게 흐리면 네모진 자국이 남는다 |
| `edge` | 큰 흐림과 작은 흐림의 차이. 물감이 가장자리에 몰리는 성질을 흉내 낸다 |

색은 네 줄입니다. `paper`(바탕) · `ink`(몸) · `wet`(액체) · `spark`(별)이고, 조절판의 「색」이
새벽빛과 미색 사이를 오갑니다. 톤을 하나로 묶어 두면 카메라가 본 옷 색이나 피부색이
그림에 섞이지 않습니다.

## 6. 액체를 영상으로 넣기

액체의 생김새를 숫자로 만드는 대신, 애프터이펙트나 파이널컷에서 만든 영상을 넣을 수 있습니다.
화면의 **액체 영상 열기**로 고르면 그 영상이 몸 안에서만, 수면 아래쪽에서만 보입니다.

영상은 화면 가득 채우는 것으로 만들면 됩니다. 몸 모양으로 오리는 일은 프로그램이 하니까
사람마다 다른 몸에 맞출 필요가 없습니다. 자세한 요령은 [web/clips/README.md](web/clips/README.md).

조절판의 「액체 영상 섞기」로 영상과 셰이더가 만든 액체 사이를 오갑니다. 0 이면 영상을
쓰지 않고, 1 이면 영상만 씁니다. 중간에 두면 영상의 흐름에 작품의 색이 입혀집니다.

## 7. 그림 모델로 덧칠하기

그림 모델이 화면을 끊김 없이 다시 칠합니다. [StreamDiffusion](https://github.com/cumulo-autumn/StreamDiffusion)
방식이라 한 장을 받자마자 다음 장을 보내고, 모델이 빠른 만큼 화면이 따라 바뀝니다. 단계마다
다른 말을 보내서 결계일 때와 차오를 때와 빠질 때가 다르게 칠해집니다. 보내는 말은
`web/settings.js` 의 `PROMPTS` 에 있습니다.

**되는 컴퓨터.** 애플 실리콘 맥(M1 이후)이나 NVIDIA 그래픽 칩이 있는 윈도우 · 리눅스입니다.
인텔 맥이나 그래픽 칩이 없는 컴퓨터에서는 한 장에 몇 초씩 걸려 쓰기 어렵습니다. 그때는
덧칠 없이 씁니다. 디스크는 4GB 남짓 더 듭니다.

**한 번 깔기.** 저장소 폴더에서 실행합니다. 덧칠에 쓰는 프로그램(PyTorch, diffusers)을
conda 환경 안에 깔고, 그림 모델(sd-turbo 약 2.5GB)까지 미리 받아 둡니다. 인터넷이 빠른 곳에서
해 두세요. 전시장에서는 받아 둔 것을 씁니다.

```bash
./install.sh --paint                # 맥 · 리눅스
.\install.ps1 --paint               # 윈도우
```

`pip install torch` 를 따로 하지 마세요. conda 환경 밖에 깔려서 덧칠 서버가 찾지 못합니다.
처음부터 다시 깔 때는 1절의 한 줄 끝에 `--paint` 를 붙이면 됩니다
(`curl … | bash -s -- --paint`).

**켜기.**

```bash
./start.sh --paint                  # 화면과 덧칠 서버를 한 줄로 같이 켠다
./start.sh --light --paint          # 가벼운 노트북이면 이렇게. 그림을 줄이고 한 걸음으로 칠한다
./start.sh --paint stub             # 모델 없이 덧칠 길만 시험한다
.\start.ps1 --paint                 # 윈도우
```

`--paint` 로 깔았으면 맥의 `start.command` 더블클릭도 덧칠까지 같이 켭니다.

**켜면 일어나는 일.** 터미널에 `그림 모델을 올립니다` 가 뜨고, 그림 모델을 그래픽 칩에 올리는
데 수십 초가 걸립니다. 그동안 화면은 덧칠 없이 돌고, 오른쪽 「지금 단계」 아래에 「덧칠 서버를
기다립니다」가 보입니다. `그림 덧칠 서버를 켰습니다` 가 뜨면 몇 초 안에 덧칠이 얹히고, 그
자리에 「덧칠 초당 ○장 · 왕복 ○ms · 모델 ○ms」가 찍힙니다. 초당 10장이 넘으면 넉넉합니다.

**조절판 세 줄**

| 조절판 | 무엇을 |
|---|---|
| 덧칠 | 칠한 그림을 얼마나 보일지. 0 이면 끈다 |
| 덧칠 부드럽게 | 받은 그림을 앞 그림과 섞는 정도. 올리면 떨림이 줄고, 움직임을 늦게 따라온다 |
| 덧칠 세기 | 모델이 얼마나 바꿀지. 0.5 를 넘기면 몸 위에 없는 윤곽을 지어내고, 0.8 쯤부터는 다른 그림이 된다 |

**왜 끊기지 않고 떨리지 않나.** 보통의 img2img 를 매 프레임 돌리면 느리고, 같은 자세여도
그림이 매번 달라져 물이 끓는 것처럼 보입니다. StreamDiffusion 은 노이즈를 한 번 정해 두고
계속 써서 같은 몸이면 같은 그림이 나오게 하고, 두 걸음을 한 번에 돌려 빠르게 합니다.
관객이 가만히 앉아 있으면 비슷한 장면이라 계산을 건너뜁니다. 그래픽 칩이 쉬니 조용한 방에서
노트북 팬도 덜 웁니다. 원래 패키지는 맥에서 멈춰서, 같은 방식을 `stream.py` 에 옮겨 적었습니다.

**모델에는 글을 보내지 않습니다.** 보내는 화면은 글과 덧칠을 뺀 맨그림입니다. 글을 보내면
모델이 뜻 없는 글자로 바꿔 그리고, 덧칠까지 보내면 제 그림을 다시 칠해 점점 번져 나갑니다.
글은 덧칠 위에 그대로 얹힙니다.

**느리면** 이렇게 맞춥니다.

| 어디 | 무엇을 |
|---|---|
| `./start.sh --light --paint` | 그림을 320 으로 줄이고 한 걸음으로 칠한다. 먼저 이것부터 |
| `settings.js` 의 `PAINT_SIZE` | 448 에서 384 나 320 으로 내린다. 그림이 작을수록 빠르다 |
| 조절판 「덧칠 부드럽게」 | 초당 장 수가 낮아도 올려 두면 덜 끊겨 보인다 |

다른 기기에서 열어 보면(테일스케일 등) 그림이 오가는 시간만큼 더 느립니다. 전시에서는 화면과
덧칠 서버가 같은 노트북에 있어서 그 시간이 없습니다. 속도는 그 노트북에서 재세요.

관객이 찍힌 그림은 이 컴퓨터 안에서만 돕니다. 덧칠 요청은 브라우저가 보고 있는 주소로 가고,
`serve.py` 가 같은 컴퓨터의 덧칠 서버로 넘깁니다. 바깥으로 나가지 않습니다.

## 8. 터치디자이너로 옮기기

전시를 터치디자이너로 돌릴 계획이면 브라우저 쪽은 값을 찾는 자리로 쓰고, 네트워크는 따로
짭니다. 같은 그림이 나오게 하는 셰이더와 노드 순서를 적어 두었습니다.

- [touchdesigner/liquidbody.glsl](touchdesigner/liquidbody.glsl) — GLSL TOP 에 그대로 붙여 넣는 픽셀 셰이더
- [touchdesigner/네트워크-만드는-법.md](touchdesigner/네트워크-만드는-법.md) — 몸을 떼어내는 길(맥에서 쓸 수 있는 셋), 파라미터 이름, 액체를 움직이는 CHOP

맥에서 사람을 떼어내는 일은 터치디자이너 안에서 됩니다.
[MediaPipe TouchDesigner](https://github.com/torinmb/mediapipe-touchdesigner),
[AppleVisionMask](https://github.com/aaronmylespereira/AppleVisionMask-TouchDesigner),
[appletd](https://github.com/ojrgb/appletd) 중 하나를 쓰면 됩니다. 어느 것을 쓰든 다음 단계는 같습니다.

## 9. 안 될 때

| 이런 일이 생기면 | 이렇게 합니다 |
|---|---|
| 카메라가 안 열린다 | 브라우저가 권한을 물었는지 봅니다. 맥은 시스템 설정에서 크롬에 카메라를 켭니다 |
| 다른 기기에서 카메라가 안 열린다 | 브라우저는 localhost 가 아니면 https 에서만 카메라를 엽니다. `--https` 로 켜고, 경고가 뜨면 「고급」으로 지나갑니다 |
| 몸을 못 잡는다 | 온몸이 화면에 들어오게 앉고, 뒤 배경과 옷의 밝기 차이를 둡니다 |
| 덩어리가 떨린다 | `settings.js` 의 `MASK_SMOOTH` 를 낮춥니다. 0.2 쯤이면 느리지만 차분합니다 |
| 느리다 | 주소 뒤에 `?in=256` 을 붙이고, 조절판의 「번짐」을 조금 내립니다 |
| 액체가 몸 밖으로 샌다 | 번짐이 너무 크면 마스크 밖까지 퍼집니다. 「번짐」을 내리거나 「결의 크기」를 올립니다 |
| 화면이 검다 | WebGL2 가 없는 기계입니다. 크롬으로 열어 봅니다 |
| 덧칠이 떨린다 | 「덧칠 부드럽게」를 올리고 「덧칠 세기」를 내립니다 |
| 덧칠이 안 된다 | `--paint` 를 붙여 켰는지, 조절판의 「덧칠」이 0 이 아닌지 봅니다. 켜고 나서 수십 초는 모델을 올리는 중입니다 |
| 터미널에 「torch 와 diffusers 가 이 환경에 없습니다」 | `./install.sh --paint` 를 한 번 실행합니다. `pip install` 을 따로 했다면 conda 환경 밖에 깔린 것입니다 |
| 덧칠이 초당 몇 장밖에 안 된다 | `./start.sh --light --paint` 로 켭니다. 그래도 느리면 그래픽 칩을 못 쓰는 컴퓨터일 수 있습니다. 터미널의 `(cuda` 나 `(mps` 를 봅니다. `(cpu` 면 덧칠 없이 씁니다 |
| 덧칠 서버가 cpu 로 켜진다 | 켤 때 그래픽 칩을 못 잡은 것입니다. 메모리가 모자란 때 생깁니다. 다른 프로그램을 끄고 다시 켭니다 |

## 10. 더 들어가기

```text
serve.py            web/ 를 띄우고, --offline 녹화를 받아 파일로 적는다
fetch_model.py      몸을 찾는 모델을 받는다
paint.py            화면을 받아 그림 모델로 다시 칠해 돌려준다 (선택)
stream.py           StreamDiffusion 방식으로 끊김 없이 칠한다. paint.py 가 쓴다
web/
├── settings.js     만지는 숫자
├── sense.js        카메라에서 몸을 한 덩어리로 떼어낸다 (MediaPipe)
├── water.js        액체가 차고 빠지는 시간의 규칙
├── text.js         질문과 답을 한 장의 글로 그린다
├── clip.js         작가가 만든 액체 영상을 몸 안에 넣는다
├── paint.js        맨그림을 보내고, 단계마다 다른 말로 칠한 그림을 받아 섞는다
├── look.js         그 모두를 수채화로 그리는 셰이더
├── gl.js           셰이더를 올리고 돌리는 뒷일
└── app.js          위의 것들을 한 프레임마다 잇는다
touchdesigner/      같은 그림을 터치디자이너에서 만드는 법
```

카메라 영상은 이 브라우저 안에서만 돕니다. 서버로도 파일로도 보내지 않습니다. 적은 글도
같습니다. 왜 이렇게 만들었는지는 [docs/notes.md](docs/notes.md). AI 도구로 고칠 때의 규칙은
[AGENTS.md](AGENTS.md).

## 쓰는 것과 라이선스

[MediaPipe](https://ai.google.dev/edge/mediapipe) (Apache-2.0)를 씁니다. 라이브러리는 저장소에
들어 있고 모델은 설치할 때 받습니다. 그림은 브라우저의 WebGL2 로 그려서 따로 받는
라이브러리가 없습니다. 전체 목록은 [NOTICE.md](NOTICE.md).

코드는 [OpenCircuit License v1.0](LICENSE)을 따릅니다. 오픈소스가 아니라 소스를 공개하되
쓰임을 제한합니다.

- **됩니다**: 받아서 쓰고 고치기. 이것으로 만든 **작품**은 전시하고 팔아도 허가가 필요 없습니다.
- **문의해 주세요**: 강좌나 워크숍의 교재로 쓰는 것, 코드 자체를 파는 것. <jh.bae@kaist.ac.kr>

---

<details>
<summary>English</summary>

Sit in front of a webcam and your body appears as a soft watercolor mass. Clear liquid enters at
the head, fills the body on its way down, then drains out at the feet. Text floating on the
liquid is washed away as the front passes it.

```bash
curl -fsSL https://raw.githubusercontent.com/joonhyungbae/webgl-liquidbody/main/install.sh | bash
cd webgl-liquidbody && ./start.sh --sim
```

MediaPipe Selfie Segmenter gives one soft mask of the person; a WebGL2 fragment shader turns it
into a watercolor body with noise-displaced blur and pigment gathering at the edges. Two files
are yours to rewrite: `web/look.js` (how the body looks) and `web/water.js` (when the liquid
rises and drains). The camera image never leaves the browser.

Source-available, not open source: personal and artistic use is free and the works you make are
entirely yours; teaching with it or selling it needs permission ([LICENSE](LICENSE)).

</details>

<sub>《2026 오픈서킷 부산: 아트앤테크 프랙티스》에서 만든 작품 베이스라인입니다. 다른 도구는
[opencircuit](https://github.com/joonhyungbae/opencircuit)에 모여 있습니다.</sub>
