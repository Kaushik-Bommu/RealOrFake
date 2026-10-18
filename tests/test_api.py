"""API contract tests using a fake session; do NOT test model accuracy."""
import io

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

import api


def png_data():
    image = Image.new("RGB", (64, 64), (10, 20, 30))
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


class FakeInput:
    name = "image"


class FakeSession:
    def get_inputs(self):
        return [FakeInput()]

    def run(self, outputs, feeds):
        tensor = feeds["image"]
        assert tensor.shape == (1, 3, 32, 32)
        assert tensor.dtype == np.float32
        return [np.array([[0.82]], dtype=np.float32)]


def test_health_missing_checkpoint(monkeypatch):
    monkeypatch.setattr(api, "get_session", lambda: (_ for _ in ()).throw(RuntimeError("no model")))
    response = TestClient(api.app).get("/health")
    assert response.status_code == 503
    assert response.json()["model_loaded"] is False


def test_predict_missing_checkpoint(monkeypatch):
    monkeypatch.setattr(api, "get_session", lambda: (_ for _ in ()).throw(RuntimeError("no model")))
    response = TestClient(api.app).post("/predict", files={"file": ("a.png", png_data(), "image/png")})
    assert response.status_code == 503


def test_valid_prediction_contract(monkeypatch):
    monkeypatch.setattr(api, "get_session", lambda: FakeSession())
    client = TestClient(api.app)
    assert client.get("/health").json()["model_loaded"] is True
    response = client.post("/predict", files={"file": ("a.png", png_data(), "image/png")})
    assert response.status_code == 200
    result = response.json()
    assert result["verdict_class"] == "real"
    assert result["confidence"] == 82
    assert result["ai_probability"] == 18
    assert len(result["insights"]) == 3
    assert result["filename"] == "a.png"
    assert result["inference_ms"] >= 0


def test_invalid_image_rejected(monkeypatch):
    monkeypatch.setattr(api, "get_session", lambda: FakeSession())
    client = TestClient(api.app)
    assert client.post("/predict", files={"file": ("not.jpg", b"broken", "image/jpeg")}).status_code == 400
    assert client.post("/predict", files={"file": ("notes.txt", b"hello", "text/plain")}).status_code == 400
    assert client.post("/predict", files={"file": ("empty.png", b"", "image/png")}).status_code == 400
    assert client.post("/predict", files={"file": ("huge.png", b"x" * (api.MAX_BYTES + 1), "image/png")}).status_code == 400


def test_thresholds():
    assert api.interpret_probability(0.5)["verdict_class"] == "uncertain"
    assert api.interpret_probability(0.39)["verdict_class"] == "ai"
    assert api.interpret_probability(0.60)["verdict_class"] == "real"
