#!/usr/bin/env python3
"""
몸을 찾는 모델을 받는다. 한 번만 하면 된다. 설치(install.sh)가 대신 해 준다.

  python3 fetch_model.py

MediaPipe 의 Selfie Segmenter (약 250KB)를 web/models/ 에 받는다. 관절이 아니라 몸 전체를
한 덩어리로 주는 모델이라, 수채화 덩어리로 바꾸기에 맞다.

이미 받은 파일은 건너뛴다. 받은 파일은 저장소에 올라가지 않는다(.gitignore).
MediaPipe 라이브러리는 저장소에 들어 있어(web/vendor/mediapipe) 따로 받지 않는다.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

WEB = Path(__file__).parent / "web"
URL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite"
DEST = WEB / "models" / "selfie_segmenter.tflite"


def get(url: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "liquidbody/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(tmp, "wb") as f:
            shutil.copyfileobj(r, f)
    except Exception as exc:
        # 맥의 python.org 파이썬은 인증서가 없어 https 를 못 여는 일이 있다. curl 로 다시 받는다.
        print(f"  파이썬으로 받지 못해 curl 로 다시 받습니다 ({exc})")
        if subprocess.run(["curl", "-fsSL", "-o", str(tmp), url]).returncode != 0:
            tmp.unlink(missing_ok=True)
            return False
    tmp.replace(dest)
    return True


def main() -> None:
    if DEST.exists():
        print(f"이미 있습니다: {DEST.relative_to(WEB.parent)}")
        return
    print("몸을 찾는 모델을 받습니다 (약 250KB)")
    if not get(URL, DEST):
        print("받지 못했습니다. 인터넷을 확인하고 다시 실행해 주세요.")
        print("가짜 사람(--sim)으로 쓰는 데는 지장이 없습니다.")
        raise SystemExit(1)
    print(f"받았습니다: {DEST.relative_to(WEB.parent)}")
    print("이제 ./start.sh 로 켜면 됩니다.")


if __name__ == "__main__":
    main()
