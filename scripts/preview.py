#!/usr/bin/env python3
"""Serve only the built site, without stale browser caches, for local review."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from functools import partial
import argparse

class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4180)
    args = parser.parse_args()
    docs = Path(__file__).resolve().parent.parent / 'docs'
    print(f'Review Terminal: http://127.0.0.1:{args.port}/', flush=True)
    print(f'Review Atlas: http://127.0.0.1:{args.port}/storm-atlas/', flush=True)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(PreviewHandler, directory=str(docs)))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
