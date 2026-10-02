"""Exercise real publication HTTP requests against a bot-identity guard."""
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cron.pages_compose import fetch_origin_json
from cron.production_smoke import _http_request


def test_publication_clients_identify_themselves_and_preserve_http_errors():
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            accepted = self.headers.get("User-Agent", "").startswith("ChroniclePublication/")
            self.send_response(200 if accepted and self.path != "/denied" else 403)
            self.end_headers()
            self.wfile.write(json.dumps({"data_version": "fixture"}).encode())

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f"http://127.0.0.1:{server.server_port}"
    try:
        assert fetch_origin_json(origin)["data_version"] == "fixture"
        assert _http_request(origin)[0] == 200
        assert _http_request(origin + "/denied")[0] == 403
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
