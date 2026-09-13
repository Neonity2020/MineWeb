#!/usr/bin/env python3
"""开发用静态服务器：禁用缓存，避免浏览器继续使用旧的 js 模块。

用法：python3 serve.py [端口]   （默认 8080）
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    handler = partial(NoCacheHandler, directory=".")
    with ThreadingHTTPServer(("", port), handler) as httpd:
        print(f"MineWeb dev server: http://localhost:{port}/  (no-cache)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
