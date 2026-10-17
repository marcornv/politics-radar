from fastapi.testclient import TestClient

from radar_ia.main import app


def test_recusa_host_de_outro_site():
    # DNS rebinding: a hostile domain resolving to 127.0.0.1 still sends its own name as Host.
    assert TestClient(app, base_url="http://evil.test:8787").get("/status").status_code == 400
    assert TestClient(app, base_url="http://127.0.0.1:8787").get("/status").status_code == 200
    assert TestClient(app, base_url="http://localhost:8787").get("/status").status_code == 200
