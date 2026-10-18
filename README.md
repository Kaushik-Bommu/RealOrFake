# RealOrFake? — Image Authenticity Detection

A browser-based image authenticity classifier, developed as a group academic project at JNTUH. The frontend lets users upload or capture an image, submit it to a prediction API, and view a classification estimate and history.

> **Reconstruction and verification status**
>
> The original public repository contained the browser frontend but not the Python model/backend. The newly added `model/small_cnn.py`, `split_dataset.py`, `train.py`, and `api.py` are **new reference implementations reconstructed from the team's final report**, not recovered originals. The original dataset, checkpoint, trained ONNX file, training notebook, and experiment logs were not available when these files were added. **No trained model is included; classification does not work until a real model is trained or a verified checkpoint is supplied.** We make no independently verified claim about accuracy or latency. A missing model produces `/health` HTTP 503 and `/predict` HTTP 503 rather than fabricated results.

## Architecture

```text
Browser (Vite, HTML/JS)
   └── detector.js → POST /predict (image multipart upload)
         └── FastAPI (api.py) → validate/decode → RGB 32×32
               → ImageNet normalization → ONNX Runtime (CPU)
                    → P(real) → threshold verdict + clearly non-explanatory insights
```

**Research context:** The team's report describes a custom three-block SmallCNN trained using PyTorch on a balanced 32×32 real/AI image dataset, then exported to ONNX. The reconstructed code follows those documented choices. See [report-to-code mapping](docs/REPORT_ALIGNMENT.md) for assumptions, gaps, and disputed details.

## What is in the repo

| Path | Role |
|---|---|
| `index.html`, `detect.html`, `results.html`, `history.html` | Existing frontend workflow |
| `detector.js`, `main.js` | Browser/API bridge and page logic |
| `model/small_cnn.py` | Reconstructed PyTorch SmallCNN (new reference code) |
| `split_dataset.py` | Reproducible stratified train/validation/test split |
| `train.py` | Train, choose best validation checkpoint, evaluate held-out data, export ONNX |
| `api.py` | FastAPI health/prediction endpoints with upload validation and ONNX Runtime |
| `tests/` | API-contract, preprocessing, class-threshold, model-shape, and dataset-split tests |
| `Dockerfile` | Backend image (mount the trained ONNX model at runtime) |

## Requirements

- Python 3.11+ and Node.js compatible with Vite 8 (see `package.json`)
- A **legally usable, properly documented** image dataset with `ai/` and `real/` folders; not included
- CPU for inference; NVIDIA GPU is optional for training

### 1. Install backend dependencies

```bash
python -m venv .venv
# Linux/macOS: source .venv/bin/activate
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

For **training only**, install the PyTorch build appropriate for your CPU/CUDA environment from the official PyTorch instructions, then:

```bash
pip install -r requirements-train.txt
```

### 2. Prepare a dataset (your own appropriately licensed images)

```text
raw_dataset/
  ai/    # AI-generated examples
  real/  # genuine photographs
```

```bash
python split_dataset.py --input raw_dataset --output dataset --seed 42
```

This copies source files into class-balanced-by-split partitions (70% train, 15% validation, 15% test for each class). It does not download images, check dataset licensing, or prevent near-duplicates and generator leakage. For a valid study, document data origin, licensing, provenance and generator-disjoint/generalization evaluations.

### 3. Train a NEW model and export ONNX

```bash
python train.py --data dataset --epochs 20 --batch-size 32
```

The default reproduces reported settings: Adam, binary cross entropy, learning rate 0.001 with cosine annealing, 32×32 RGB, horizontal flips, padded crops, and ImageNet normalization. Training uses a GPU when available; add `--cpu` to force CPU. It writes ignored artifacts `model/best.pt`, `model/detector.onnx`, and `model/metrics.json`.

`model/metrics.json` contains results measured during **your new run**, including a confusion matrix and ONNX/PyTorch parity check. The original report's approximately 90% accuracy and under-50-ms inference claims have **not been reproduced here**.

**Important:** The training code uses `ai=0`, `real=1` and exports a single *probability of real*. Swapping labels or normalization silently corrupts verdicts. The newly trained model might perform poorly; evaluate before using it.

### 4. Start backend

```bash
uvicorn api:app --reload --port 8000
```

- `GET http://localhost:8000/health` → `200` only when a trained model loads, otherwise `503`.
- `POST http://localhost:8000/predict` → multipart field `file`, JPEG/PNG/WebP, maximum 10 MiB, JSON verdict and scores.
- Interactive API docs: `http://localhost:8000/docs`.

### 5. Start frontend

```bash
npm install
npm run dev
```

The browser adapter defaults to `http://localhost:8000`. For a hosted frontend, set the backend URL **before** `detector.js` is loaded on each page, for example:

```html
<script>window.REALORFAKE_API_URL = "https://YOUR-API-HOST";</script>
<script src="/detector.js"></script>
```

For a production backend, set `CORS_ORIGINS` to an explicit comma-separated list of frontend origins; do not use a wildcard for an unrestricted public deployment.

**Docker (backend):**

```bash
docker build -t realorfake-api .
docker run --rm -p 8000:8000 -v "$(pwd)/model:/app/model:ro" realorfake-api
```

On PowerShell, replace `$(pwd)` if necessary with `${PWD}` for the mount host path. The container responds `503` until `model/detector.onnx` exists.

## Tests

```bash
pip install pytest httpx
python -m pytest -q
```

API tests use a dummy inference session **for API contracts only**. They do not measure the actual model's accuracy. Train/evaluate with real held-out images and audit your data before publishing any performance figures.

## Responsible interpretation

- A classification probability is **not a proof of authenticity** and is not necessarily calibrated.
- The three informational cards in the API explain the decision and limitations; they do **not** claim that the model produced saliency maps, texture diagnoses or explanations.
- Image classification is vulnerable to resized/compressed images, unknown generators, distribution shift and adversarial manipulation. Never use this as the sole basis for consequential decisions.
- The original submission was a team project. Individual contributions and authorship of missing original code should not be inferred from this reconstruction.
