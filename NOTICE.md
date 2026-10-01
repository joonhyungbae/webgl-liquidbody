# 제3자 구성요소

| 쓰는 것 | 어디 것 | 라이선스 | 어디에 |
|---|---|---|---|
| [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe) | Google | Apache-2.0 | `web/vendor/mediapipe/` |
| [Selfie Segmenter 모델](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter) | Google | Apache-2.0 | 설치할 때 `web/models/` 로 받는다 |
| WebGL2 · Canvas 2D | 브라우저 표준 | 브라우저에 포함 | |
| Python 표준 라이브러리 (`http.server`) | Python | PSF | |

모델은 저장소에 넣지 않고 `fetch_model.py` 가 받아 옵니다. 받는 곳은
`https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite` 입니다.

화면에 쓰는 글꼴은 쓰는 사람의 기계에 있는 것(system-ui)입니다. 내려받는 글꼴이 없습니다.
