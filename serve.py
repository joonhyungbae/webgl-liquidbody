#!/usr/bin/env python3
"""
시작하는 자리. web/ 폴더를 작은 웹 서버로 띄우고 브라우저를 연다.

감지도 그림도 브라우저 안에서 끝난다. 이 파일이 하는 일은 셋이다.
  web/ 의 파일을 내준다 (브라우저가 옛 파일을 들고 있지 않게 no-store 를 붙인다)
  --offline 녹화를 받아 out 파일로 적는다
  무엇으로 켤지(--sim, --video, --display)를 주소에 붙여 브라우저를 연다

  python3 serve.py                 카메라로 켠다
  python3 serve.py --sim           카메라 없이 가짜 사람으로
  python3 serve.py --display       조절판 없이 화면만 (전시용)
  python3 serve.py --offline 20    20초를 out.mp4(또는 out.webm)로 적고 끝낸다
  python3 serve.py --host 0.0.0.0  다른 기기에서 본다 (카메라는 이 컴퓨터에서만 열린다)
  python3 serve.py --port 7001     포트를 바꾼다. 쓰이고 있으면 다음 빈 번호를 찾는다

파이썬에 들어 있는 것만 쓴다. 따로 설치할 것이 없다.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import platform
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

HERE = Path(__file__).parent
WEB = HERE / "web"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".tflite": "application/octet-stream",
    }
    on_saved = None   # --offline 일 때 파일을 받으면 부른다

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self) -> None:
        url = urlparse(self.path)
        # --offline 녹화만 받는다. 이 컴퓨터에서 온 것만.
        if url.path != "/save" or self.client_address[0] not in ("127.0.0.1", "::1"):
            self.send_error(404)
            return
        ext = parse_qs(url.query).get("ext", ["webm"])[0]
        ext = ext if ext in ("mp4", "webm") else "webm"
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        out = HERE / f"out.{ext}"
        out.write_bytes(body)
        self.send_response(200)
        self.end_headers()
        print(f"{out.name} 에 적었습니다 ({len(body) / 1e6:.1f}MB).")
        if Handler.on_saved:
            Handler.on_saved()

    def log_message(self, *args) -> None:  # 요청마다 줄이 쌓이면 오류가 묻힌다
        pass


def open_browser(url: str) -> None:
    # 맥이면 크롬을 먼저 찾는다. 사파리도 되지만 크롬에서 가장 많이 시험했다.
    if platform.system() == "Darwin":
        if subprocess.run(["open", "-a", "Google Chrome", url], capture_output=True).returncode == 0:
            return
    webbrowser.open(url)


def bind(host: str, port: int) -> http.server.ThreadingHTTPServer:
    """포트가 쓰이고 있으면 다음 번호를 찾는다. 같은 것을 두 번 켜도 겹치지 않는다."""
    handler = functools.partial(Handler, directory=str(WEB))
    for p in range(port, port + 20):
        try:
            return http.server.ThreadingHTTPServer((host, p), handler)
        except OSError:
            continue
    print(f"{port}~{port + 19} 번이 모두 쓰이고 있습니다. --port 로 다른 번호를 주세요.")
    raise SystemExit(1)


def main() -> None:
    sys.stdout.reconfigure(line_buffering=True)
    ap = argparse.ArgumentParser(description="몸을 지나는 물을 띄운다")
    ap.add_argument("--sim", action="store_true", help="카메라 없이 가짜 사람으로")
    ap.add_argument("--video", help="카메라 대신 쓸 영상. web/ 기준 경로")
    ap.add_argument("--display", action="store_true", help="조절판 없이 화면만")
    ap.add_argument("--offline", type=float, default=0, help="초 단위. 장비 없이 그만큼을 out.mp4 로 적는다")
    ap.add_argument("--host", default="127.0.0.1", help="다른 기기에서 보려면 0.0.0.0")
    ap.add_argument("--port", type=int, default=7000)
    ap.add_argument("--no-open", action="store_true", help="브라우저를 열지 않는다")
    ap.add_argument("--query", default="", help="주소 뒤에 그대로 붙일 것. 예: in=256&gpu")
    args = ap.parse_args()

    q = []
    if args.offline:
        q += ["sim", f"offline={args.offline:g}"]
    elif args.sim:
        q.append("sim")
    if args.video:
        q.append("video=" + quote(args.video))
    if args.display:
        q.append("display")
    if args.query:
        q.append(args.query)

    server = bind(args.host, args.port)
    port = server.server_address[1]
    url = f"http://127.0.0.1:{port}/" + ("?" + "&".join(q) if q else "")

    if not (WEB / "models" / "selfie_segmenter.tflite").exists() and not (args.sim or args.offline):
        print("몸을 찾는 모델이 없어 카메라를 쓸 수 없습니다. 가짜 사람으로 켭니다.")
        print("모델 받기:  python3 fetch_model.py")
        url = f"http://127.0.0.1:{port}/?sim"

    if args.offline:
        Handler.on_saved = lambda: threading.Thread(target=server.shutdown).start()
        print(f"{args.offline:g}초 동안의 화면을 녹화합니다. 브라우저가 열렸다가 끝나면 out 파일이 생깁니다.")
    else:
        print(f"열렸습니다: {url}")
        print("카메라는 브라우저가 권한을 물어봅니다. 허락하면 바로 몸이 잡힙니다.")
        print("끝내려면 Ctrl+C (창을 닫아도 됩니다)")
    if not args.no_open:
        threading.Timer(0.8, open_browser, [url]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n껐습니다.")


if __name__ == "__main__":
    main()
