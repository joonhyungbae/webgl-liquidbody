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
  python3 paint.py --fetch             그림 모델만 받아 두고 끝낸다. install.sh --paint 가 쓴다

왜 StreamDiffusion 방식인가
  보통의 img2img 는 한 장마다 모델을 처음부터 다시 준비해서, 매 프레임 돌리면 느리고 떨린다.
  StreamDiffusion 은 노이즈를 고정하고 걸음을 한 줄로 세워, 같은 기계에서 몇 배 빠르게, 덜
  떨리게 칠한다. 자세한 것은 stream.py 맨 위에 있다.

모델 깔기
  ./install.sh --paint (윈도우는 .\install.ps1 --paint) 가 conda 환경에 torch 와 diffusers 를
  깔고 그림 모델(sd-turbo 약 2.5GB, TAESD 약 10MB)까지 받아 둔다. 그냥 pip install 을 하면
  conda 환경 밖에 깔려서 이 서버가 찾지 못한다.
  돌아가는 자리는 알아서 고른다. NVIDIA 면 cuda, 맥이면 mps 다.
"""

from __future__ import annotations

import argparse
import http.server
import io
import json
import queue
import sys
import threading
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
            print("torch 와 diffusers 가 이 환경에 없습니다. 저장소 폴더에서 한 번 깔아 주세요:")
            print("  ./install.sh --paint          (맥 · 리눅스)")
            print("  .\\install.ps1 --paint        (윈도우)")
            print("덧칠 없이 받은 그림을 그대로 돌려줍니다.")
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


class Worker:
    """모델 계산은 늘 같은 스레드 하나에서 한다.

    웹 서버는 요청마다 새 스레드를 만든다. 그 스레드에서 모델을 부르면 PyTorch 가 스레드마다
    그래픽 칩의 준비물(cuBLAS 핸들 등)을 새로 만들어, 35ms 걸릴 한 장이 120ms 넘게 걸린다
    (4090 에서 잰 값). 그래서 요청은 일감만 넘기고 이 스레드가 칠한 것을 받아 간다.

    칠하는 한 장 말고 기다리는 자리를 하나 둔다. 브라우저가 두 장을 겹쳐 보내면, 한 장이
    오가는 동안 다른 한 장을 칠하고 있어 왕복 시간이 숨는다.
    """

    def __init__(self, backend) -> None:
        self.backend = backend
        self.jobs: queue.Queue = queue.Queue(maxsize=1)
        threading.Thread(target=self.run, daemon=True).start()

    def run(self) -> None:
        while True:
            args, box, done = self.jobs.get()
            try:
                box.append(self.backend.paint(*args))
            except Exception as exc:     # 한 장이 실패해도 서버는 계속 돈다
                box.append(exc)
            done.set()

    def paint(self, png: bytes, prompt: str, strength: float) -> bytes:
        box: list = []
        done = threading.Event()
        self.jobs.put_nowait(((png, prompt, strength), box, done))   # 차 있으면 queue.Full
        done.wait()
        if isinstance(box[0], Exception):
            raise box[0]
        return box[0]


class Handler(http.server.BaseHTTPRequestHandler):
    backend = None
    size = 0          # 0 이 아니면 이 가로로 줄여서 모델에 넣는다
    worker = None
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
        q = parse_qs(url.query)
        prompt = q.get("prompt", [""])[0]
        strength = float(q.get("strength", ["0.4"])[0])
        png = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        t0 = time.time()
        try:
            out = Handler.worker.paint(shrink(png, Handler.size), prompt, strength)
        except queue.Full:
            # 칠하는 한 장과 기다리는 한 장이 이미 있으면 흘린다. 줄을 세우면 점점 늦어진다
            self._send(429, b"busy", "text/plain")
            return
        except Exception as exc:
            print(f"칠하지 못했습니다: {exc}")
            self._send(500, b"", "text/plain")
            return
        took = time.time() - t0
        n = Handler.stats["장"] + 1
        Handler.stats["장"] = n
        Handler.stats["평균초"] = round(Handler.stats["평균초"] + (took - Handler.stats["평균초"]) / n, 3)
        self._send(200, out, "image/jpeg" if out[:2] == b"\xff\xd8" else "image/png")

    def log_message(self, *args) -> None:
        pass


def fetch(model: str, vae: str) -> None:
    """그림 모델을 받아 두기만 한다. 전시장에서 처음 켤 때 몇 분씩 기다리지 않게."""
    try:
        from diffusers import AutoencoderTiny, StableDiffusionPipeline
    except ImportError:
        sys.exit("torch 와 diffusers 가 없습니다. ./install.sh --paint 로 깝니다.")
    print(f"그림 모델을 받습니다: {model} (약 2.5GB). 한 번만 받으면 됩니다.")
    path = StableDiffusionPipeline.download(model)
    print(f"받았습니다: {path}")
    print(f"작은 VAE 를 받습니다: {vae} (약 10MB)")
    AutoencoderTiny.from_pretrained(vae)
    print("다 받았습니다. ./start.sh --paint 로 켭니다.")


def main() -> None:
    sys.stdout.reconfigure(line_buffering=True)
    ap = argparse.ArgumentParser(description="화면을 받아 다시 칠해 돌려준다")
    ap.add_argument("--backend", default="stream", choices=["stream", "stub"])
    ap.add_argument("--model", default="stabilityai/sd-turbo", help="그림 모델 이름")
    ap.add_argument("--steps", type=int, default=2, help="1 이나 2. 2 가 더 칠하고 조금 느리다")
    ap.add_argument("--similar", type=float, default=0.98, help="가만히 있을 때 건너뛰는 정도. 1 이면 끈다")
    ap.add_argument("--size", type=int, default=0, help="모델에 넣기 전 가로 크기. 0 이면 받은 그대로")
    ap.add_argument("--port", type=int, default=7010)
    ap.add_argument("--fetch", action="store_true", help="그림 모델만 받아 두고 끝낸다")
    args = ap.parse_args()
    if args.fetch:
        fetch(args.model, "madebyollin/taesd")
        return

    Handler.size = args.size
    if args.backend == "stub":
        Handler.backend = Stub()
    else:
        Handler.backend = StreamBackend(model=args.model, steps=args.steps, similar=args.similar)
    Handler.worker = Worker(Handler.backend)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"그림 덧칠 서버를 켰습니다: 127.0.0.1:{args.port} ({Handler.backend.name})")
    print("브라우저 쪽에서 조절판의 「덧칠」을 올리면 칠하기 시작합니다. 끝내려면 Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n껐습니다.")


if __name__ == "__main__":
    main()
