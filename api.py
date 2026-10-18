"""RealOrFake ONNX inference API reconstructed from the project report.

It deliberately REFUSES predictions until a real, trained model/detector.onnx
exists. No random model or fabricated predictions are provided.
"""
import io
import json
import os
import time
from functools import lru_cache
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError

ROOT = Path(__file__).resolve().parent
MODEL_PATH = Path(os.environ.get("MODEL_PATH", ROOT / "model" / "detector.onnx"))
MAPPING_PATH = ROOT / "model" / "class_mapping.json"
MAX_BYTES = 10 * 1024 * 1024
# Reject extreme decompression bombs even if their compressed upload is small.
Image.MAX_IMAGE_PIXELS = 20_000_000
MEAN = np.asarray([0.485, 0.456, 0.406], dtype=np.float32)[:, None, None]
STD = np.asarray([0.229, 0.224, 0.225], dtype=np.float32)[:, None, None]

app = FastAPI(title="RealOrFake Inference API", version="0.1.0")
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["*"], allow_credentials=False)


@lru_cache(maxsize=1)
def get_session():
    """Lazy-load ONNX once; raise when trained weights are unavailable."""
    if not MODEL_PATH.is_file():
        raise RuntimeError("Trained model missing: train your dataset and export model/detector.onnx")
    if not MAPPING_PATH.is_file():
        raise RuntimeError("Class mapping missing")
    mapping = json.loads(MAPPING_PATH.read_text(encoding="utf-8"))
    if mapping.get("0") != "ai" or mapping.get("1") != "real" or mapping.get("output_probability") != "real":
        raise RuntimeError("Class mapping does not match the expected real-probability output")
    import onnxruntime as ort
    session = ort.InferenceSession(str(MODEL_PATH), providers=["CPUExecutionProvider"])
    input_shape = session.get_inputs()[0].shape
    if len(input_shape) != 4 or input_shape[1:] != [3, 32, 32]:
        raise RuntimeError(f"Unexpected ONNX input shape: {input_shape}")
    return session


def preprocess_image(data: bytes) -> np.ndarray:
    """Exactly the normalization described in section 4.2 of the report."""
    try:
        with Image.open(io.BytesIO(data)) as im:
            if im.format not in {"JPEG", "PNG", "WEBP"}:
                raise HTTPException(400, "Only JPEG, PNG and WebP images are supported")
            if im.width * im.height > Image.MAX_IMAGE_PIXELS:
                raise HTTPException(400, "Image dimensions are too large")
            im = im.convert("RGB").resize((32, 32), resample=Image.Resampling.BILINEAR)
            rgb = np.asarray(im, dtype=np.float32) / 255.0
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise HTTPException(400, "Invalid or unsafe image file") from exc
    chw = np.transpose(rgb, (2, 0, 1))
    return ((chw - MEAN) / STD)[None, ...].astype(np.float32)


def interpret_probability(real_prob: float) -> dict:
    """Decision thresholds from report section 6.3, not calibrated guarantees."""
    if not np.isfinite(real_prob) or not 0 <= real_prob <= 1:
        raise ValueError("Model returned an invalid probability")
    ai_prob = 1.0 - real_prob
    if real_prob >= 0.6:
        verdict, cls, confidence = "Authentic Image", "real", real_prob
    elif ai_prob >= 0.6:
        verdict, cls, confidence = "AI Generated", "ai", ai_prob
    else:
        verdict, cls, confidence = "Uncertain", "uncertain", max(real_prob, ai_prob)
    # CNN probabilities are not feature explanations; don't invent texture/lighting observations.
    return {
        "verdict": verdict,
        "verdict_class": cls,
        "confidence": round(confidence * 100),
        "ai_probability": round(ai_prob * 100),
        "real_probability": round(real_prob * 100),
        "insights": [
            {"label": "Model prediction", "finding": f"The classifier estimates {ai_prob * 100:.1f}% AI-generated probability."},
            {"label": "Decision rule", "finding": "Verdicts use a 60% probability threshold; intermediate scores are uncertain."},
            {"label": "Limitations", "finding": "This is an automated estimate, not proof of authenticity. The output is not a visual explanation."},
        ],
    }


@app.get("/health")
def health():
    try:
        get_session()
    except Exception as exc:
        return JSONResponse(status_code=503, content={"status": "unready", "model_loaded": False, "reason": str(exc)})
    return {"status": "ready", "model_loaded": True}


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(400, "Upload a JPEG, PNG or WebP image")
    data = await file.read(MAX_BYTES + 1)
    if not data:
        raise HTTPException(400, "Empty image file")
    if len(data) > MAX_BYTES:
        raise HTTPException(400, "Image exceeds the 10 MB limit")
    tensor = preprocess_image(data)
    try:
        session = get_session()
    except Exception as exc:
        raise HTTPException(503, f"Inference unavailable: {exc}") from exc
    start = time.perf_counter()
    try:
        raw = session.run(None, {session.get_inputs()[0].name: tensor})
        probability = float(np.asarray(raw[0]).reshape(-1)[0])
        result = interpret_probability(probability)
    except (ValueError, IndexError, TypeError, RuntimeError) as exc:
        raise HTTPException(500, "Inference failed or returned invalid output") from exc
    result.update({
        "filename": Path(file.filename or "image").name,
        "filesize_kb": round(len(data) / 1024, 2),
        "inference_ms": round((time.perf_counter() - start) * 1000, 2),
    })
    return result
