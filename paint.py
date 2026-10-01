#!/usr/bin/env python3
"""
그림 덧칠 서버. 화면 한 장을 받아 그림 모델로 다시 칠해서 돌려준다.

브라우저가 몇 초에 한 번 지금 화면을 보내면, 여기서 모델이 칠한 그림을 돌려주고,
브라우저가 그것을 원래 화면 위에 천천히 겹친다. 모델이 없거나 느려도 작품은 그대로 돈다.
켜지 않으면 브라우저는 한 번 물어보고 그만둔다.

  python3 paint.py                     시험용(stub). 모델 없이 색만 입혀 길이 뚫렸는지 본다
  python3 paint.py --backend diffusion 진짜 모델로. 아래 「모델 붙이기」를 먼저 읽는다
  python3 paint.py --port 7010         포트를 바꾼다

왜 매 프레임이 아니라 몇 초에 한 번인가
  이 작품은 느리다. 초당 몇 장이면 충분하고, 돌려받은 그림을 천천히 겹치면 모델이 프레임마다
  다르게 그리는 떨림이 보이지 않는다. 매 프레임 칠하면 물이 끓는 것처럼 보인다.

모델 붙이기
  맥(애플 실리콘)에서 실시간으로 도는 img2img 는 2026 년 기준으로 돌아간다.
  https://github.com/patrickhartono/StreamDiffusion-Mac 또는 https://github.com/pvjosue/StreamDiffusion-OSX
  를 같은 conda 환경에 깔고, 아래 Diffusion.paint() 안의 자리표시자를 그 호출로 바꾸면 된다.
  입력은 PNG 바이트, 출력도 PNG 바이트다. 그 사이에서 무엇을 쓰든 나머지 코드는 그대로다.
"""

from __future__ import annotations

import argparse
import http.server
import io
import json
import sys
import time
from urllib.parse import parse_qs, urlparse


class Stub:
    """모델 없이 길이 뚫렸는지만 본다. 받은 그림에 색을 입혀 돌려준다."""

    name = "시험용(stub)"

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


class Diffusion:
    """진짜 그림 모델. 여기에 StreamDiffusion 같은 것을 붙인다."""

    name = "그림 모델"

    def __init__(self, model: str = "", steps: int = 1, **_):
        self.model = model
        self.steps = steps
        self.pipe = None
        # 여기에서 모델을 한 번만 올린다. 매번 올리면 첫 장이 몇 초씩 걸린다.
        #
        #   from streamdiffusion import StreamDiffusionWrapper
        #   self.pipe = StreamDiffusionWrapper(model_id_or_path=model, mode="img2img",
        #                                      t_index_list=[32], frame_buffer_size=1)
        #
        print("그림 모델 자리가 아직 비어 있습니다. paint.py 의 Diffusion.paint() 를 채우세요.")

    def paint(self, png: bytes, prompt: str, strength: float) -> bytes:
        if self.pipe is None:
            return png
        #   from PIL import Image
        #   img = Image.open(io.BytesIO(png)).convert("RGB")
        #   out = self.pipe(image=img, prompt=prompt, strength=strength)
        #   buf = io.BytesIO(); out.save(buf, format="PNG"); return buf.getvalue()
        return png


class Handler(http.server.BaseHTTPRequestHandler):
    backend = None
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
            body = json.dumps({"backend": Handler.backend.name, **Handler.stats}, ensure_ascii=False).encode()
            self._send(200, body, "application/json; charset=utf-8")
            return
        self.send_error(404)

    def do_POST(self) -> None:
        url = urlparse(self.path)
        if url.path != "/paint":
            self.send_error(404)
            return
        # 한 장을 칠하는 동안 다음 장이 들어오면 흘린다. 줄을 세우면 점점 늦어진다
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
            out = Handler.backend.paint(png, prompt, strength)
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
    ap.add_argument("--backend", default="stub", choices=["stub", "diffusion"])
    ap.add_argument("--model", default="stabilityai/sd-turbo", help="그림 모델 이름")
    ap.add_argument("--steps", type=int, default=1)
    ap.add_argument("--port", type=int, default=7010)
    args = ap.parse_args()

    Handler.backend = Stub() if args.backend == "stub" else Diffusion(model=args.model, steps=args.steps)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"그림 덧칠 서버를 켰습니다: 127.0.0.1:{args.port} ({Handler.backend.name})")
    print("브라우저 쪽에서 조절판의 「덧칠」을 올리면 칠하기 시작합니다. 끝내려면 Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n껐습니다.")


if __name__ == "__main__":
    main()
