#!/usr/bin/env python3
"""Serveur de test local : sert le site et simule les deux fonctions Netlify."""
import http.server, json, os, socketserver

ROOT = "/root/projets/cap-encre/site-v3"
CODE = "CAP-DEMO-2026"
DATA = os.path.join(ROOT, "netlify/functions/_data/permis.json")
COMMUNES = os.path.join(ROOT, "netlify/functions/_data/communes.json")
STORE = "/root/.hermes/cache/scratch/pro-store.json"


def lire_store():
    if os.path.exists(STORE):
        with open(STORE, encoding="utf-8") as f:
            return json.load(f)
    return {"clients": [], "chantiers": [], "reglages": {}}


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/.netlify/functions/veille-data"):
            if (self.headers.get("x-veille-code") or "").strip().upper() != CODE:
                return self._json(401, {"erreur": "code invalide"})
            with open(DATA, encoding="utf-8") as f:
                permis = json.load(f)
            with open(COMMUNES, encoding="utf-8") as f:
                communes = json.load(f)
            return self._json(200, {"permis": permis, "communes": communes, "client": "Client de démonstration"})
        if self.path.startswith("/.netlify/functions/pro-data"):
            if (self.headers.get("x-veille-code") or "").strip().upper() != CODE:
                return self._json(401, {"erreur": "code invalide"})
            return self._json(200, {"client": "Client de démonstration", "data": lire_store()})
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/.netlify/functions/pro-data"):
            if (self.headers.get("x-veille-code") or "").strip().upper() != CODE:
                return self._json(401, {"erreur": "code invalide"})
            n = int(self.headers.get("content-length") or 0)
            corps = json.loads(self.rfile.read(n) or b"{}")
            with open(STORE, "w", encoding="utf-8") as f:
                json.dump(corps.get("data", {}), f, ensure_ascii=False)
            return self._json(200, {"ok": True})
        self.send_response(405)
        self.end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    with socketserver.TCPServer(("127.0.0.1", 8899), H) as httpd:
        print("serveur de test sur http://127.0.0.1:8899")
        httpd.serve_forever()
