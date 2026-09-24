#!/usr/bin/env python3
"""Serve the web interface in docs/ for local development, telling the browser to revalidate.

    python3 scripts/webview_serve.py [port]      # default 18001, then http://localhost:18001/
"""
import functools
import http.server
import sys
from pathlib import Path

from webview_stamp import main as stamp

DOCS = Path(__file__).resolve().parent.parent / "docs"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    if stamp([]):
        sys.exit(1)
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 18001
    handler = functools.partial(NoCacheHandler, directory=str(DOCS))
    print(f"serving {DOCS} on http://localhost:{port}/")
    http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
