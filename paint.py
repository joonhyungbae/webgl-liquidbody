#!/usr/bin/env python3
"""
그림 덧칠 서버. 화면을 받아 그림 모델로 다시 칠해서 돌려준다.

브라우저는 한 장을 돌려받자마자 다음 장을 보낸다. 모델이 빠른 만큼 화면이 따라 바뀐다.
모델이 없거나 꺼져 있어도 작품은 그대로 돈다. 브라우저가 한 번 물어보고 그만둔다.

  python3 paint.py                     StreamDiffusion 방식으로 (stream.py). 기본
  python3 paint.py --backend stub      시험용. 모델 없이 색만 입혀 길이 뚫렸는지 본다
  python3 paint.py --steps 1           한 걸음으로. 더 빠르고 덜 칠한다. 가벼운 기계에서
  python3 paint.py --size 384          모델에 넣기 전에 이 가로로 줄인다
  python3 paint.py --similar 0.98      가만히 있을 때 건너뛰는 정도. 1 이면 건너뛰지 않는다
  python3 paint.py --port 7010         포트를 바꾼다

왜 StreamDiffusion 방식인가
  보통의 img2img 는 한 장마다 모델을 처음부터 다시 준비해서, 매 프레임 돌리면 느리고 떨린다.
  StreamDiffusion 은 노이즈를 고정하고 걸음을 한 줄로 세워, 같은 기계에서 몇 배 빠르게, 덜
  떨리게 칠한다. 자세한 것은 stream.py 맨 위에 있다.

모델 깔기
  pip install torch diffusers transformers accelerate
  처음 켤 때 모델을 받는다(sd-turbo 약 2.5GB, TAESD 약 10MB). 그다음부터는 받아 둔 것을 쓴다.
  돌아가는 자리는 알아서 고른다. NVIDIA 면 cuda, 맥이면 mps 다.
"""

from __future__ import annotations

import argparse
import http.server
import io
import json
import sys
import time
from urllib.parse import parse_qs, urlparse


def shrink(png: bytes, width: int) -> bytes:
    """모델에 넣기 전에 줄인다. 큰 그림은 모델을 몇 배로 느리게 만든다."""
    if not width:
        return png
    try:
        from PIL import Image
    except ImportError:
        return png
    img = Image.open(io.BytesIO(png))
    if img.width <= width:
        return png
    img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


class Stub:
    """모델 없이 길이 뚫렸는지만 본다. 받은 그림에 색을 입혀 돌려준다."""

    name = "시험용(stub)"

    def stats(self) -> dict:
        return {}

    def __init__(self, **_):
        try:
            from PIL import Image, ImageFilter  # noqa: F401
            self.ok = True
        except ImportError:
            self.ok = False
            print("Pillow 가 없어 받은 그림을 그대로 돌려줍니다. conda install pillow")

    def paint(self, png: bytes, prompt: str, strength: float) -> bytes:
        if not self.ok:
            return png
        from PIL import Image, ImageEnhance, ImageFilter

        img = Image.open(io.BytesIO(png)).convert("RGB")
        img = img.filter(ImageFilter.GaussianBlur(2 + 6 * strength))
        img = ImageEnhance.Color(img).enhance(1 + strength)
        out = io.BytesIO()
        img.save(out, format="PNG")
        return out.getvalue()


class StreamBackend:
    """StreamDiffusion 방식. stream.py 를 부른다. 깔린 것이 없으면 시험용처럼 받은 그림을 돌려준다."""

    def __init__(self, model: str, steps: int, similar: float, **_):
        self.stream = None
        self.name = "StreamDiffusion 방식 (모델 없음)"
        try:
            from stream import Stream
        except ImportError:
            print("torch 와 diffusers 가 없습니다. 다음을 깔거나 --backend stub 으로 켭니다:")
            print("  pip install torch diffusers transformers accelerate")
            return
        print(f"그림 모델을 올립니다: {model}. 처음에는 몇 분 걸립니다.")
        self.stream = Stream(model=model, steps=steps, similar=similar)
        self.name = self.stream.name
        print("올렸습니다. 브라우저 쪽 조절판의 「덧칠」을 올리면 칠하기 시작합니다.")

    def stats(self) -> dict:
        s = self.stream
        if not s:
            return {}
        return {"한장초": round(s.took, 3), "칠한장": s.frames, "건너뜀": s.skips}

    def paint(self, png: bytes, prompt: str, strength: float) -> bytes:
        if self.stream is None:
            return png
        from PIL import Image

        img = Image.open(io.BytesIO(png)).convert("RGB")
        out = self.stream(img, prompt or "watercolor", strength)
        if out.size != img.size:
            out = out.resize(img.size, Image.BILINEAR)
        buf = io.BytesIO()
        out.save(buf, format="JPEG", quality=90)   # PNG 보다 몇 배 빨리 묶고 푼다
        return buf.getvalue()


class Handler(http.server.BaseHTTPRequestHandler):
    backend = None
    size = 0          # 0 이 아니면 이 가로로 줄여서 모델에 넣는다
    busy = False
    stats = {"장": 0, "평균초": 0.0}

    def _send(self, code: int, body: bytes, kind: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")   # 브라우저가 다른 포트에서 부른다
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/health":
            body = json.dumps({"backend": Handler.backend.name, **Handler.stats, **Handler.backend.stats()},
                              ensure_ascii=False).encode()
            self._send(200, body, "application/json; charset=utf-8")
            return
        self.send_error(404)

    def do_POST(self) -> None:
        url = urlparse(self.path)
        if url.path != "/paint":
            self.send_error(404)
            return
        # 한 장을 칠하는 동안 다음 장이 들어오면 흘린다. 줄을 세우면 점점 늦어진다.
        # 브라우저는 한 번에 한 장만 보내지만, 창을 두 개 열면 겹칠 수 있다
        if Handler.busy:
            self._send(429, b"busy", "text/plain")
            return
        q = parse_qs(url.query)
        prompt = q.get("prompt", [""])[0]
        strength = float(q.get("strength", ["0.4"])[0])
        png = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        Handler.busy = True
        t0 = time.time()
        try:
            out = Handler.backend.paint(shrink(png, Handler.size), prompt, strength)
        except Exception as exc:
            print(f"칠하지 못했습니다: {exc}")
            self._send(500, b"", "text/plain")
            return
        finally:
            Handler.busy = False
        took = time.time() - t0
        n = Handler.stats["장"] + 1
        Handler.stats["장"] = n
        Handler.stats["평균초"] = round(Handler.stats["평균초"] + (took - Handler.stats["평균초"]) / n, 3)
        self._send(200, out, "image/png")

    def log_message(self, *args) -> None:
        pass


def main() -> None:
    sys.stdout.reconfigure(line_buffering=True)
    ap = argparse.ArgumentParser(description="화면을 받아 다시 칠해 돌려준다")
    ap.add_argument("--backend", default="stream", choices=["stream", "stub"])
    ap.add_argument("--model", default="stabilityai/sd-turbo", help="그림 모델 이름")
    ap.add_argument("--steps", type=int, default=2, help="1 이나 2. 2 가 더 칠하고 조금 느리다")
    ap.add_argument("--similar", type=float, default=0.98, help="가만히 있을 때 건너뛰는 정도. 1 이면 끈다")
    ap.add_argument("--size", type=int, default=0, help="모델에 넣기 전 가로 크기. 0 이면 받은 그대로")
    ap.add_argument("--port", type=int, default=7010)
    args = ap.parse_args()

    Handler.size = args.size
    if args.backend == "stub":
        Handler.backend = Stub()
    else:
        Handler.backend = StreamBackend(model=args.model, steps=args.steps, similar=args.similar)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"그림 덧칠 서버를 켰습니다: 127.0.0.1:{args.port} ({Handler.backend.name})")
    print("브라우저 쪽에서 조절판의 「덧칠」을 올리면 칠하기 시작합니다. 끝내려면 Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n껐습니다.")


if __name__ == "__main__":
    main()
