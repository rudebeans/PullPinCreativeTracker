#!/usr/bin/env python3
"""
Tiny no-cache static server for local testing (dev only).

Plain `python3 -m http.server` lets the browser cache JS/CSS, so edits don't
always show up on refresh. This server sends no-cache headers so every reload
fetches the latest files. Not needed in production — Vercel handles caching.

    python3 serve.py        # then open http://localhost:4321
"""
import http.server
import socketserver

PORT = 4321


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


class Server(socketserver.TCPServer):
    allow_reuse_address = True  # avoid "address already in use" on quick restarts


if __name__ == "__main__":
    with Server(("", PORT), NoCacheHandler) as httpd:
        print(f"Creative Tracker -> http://localhost:{PORT}  (no-cache dev server)")
        httpd.serve_forever()
