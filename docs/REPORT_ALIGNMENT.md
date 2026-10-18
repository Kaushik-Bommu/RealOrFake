# Technical reconstruction: traceability and limitations

Source: *RealOrFake? — AI-Powered Image Authenticity Detector*, team final report (36 pages). This document describes which specs are **reported**, which source files were **already present**, and which files are **new reconstructions**. The report itself is not copied into this public repository because it contains student identification information.

| Report section | Reported design | Implementation now in repo |
|---|---|---|
| §4.2 | Bilinear RGB resize to 32×32, pixel scaling /255, ImageNet mean/std, CHW tensor | `api.py:preprocess_image`, `train.py:transform` |
| §4.3 | 20 epochs, Adam, LR 0.001 + cosine schedule, BCELoss, 32 batch, 70/15/15 | `train.py`, `split_dataset.py` |
| §5 | Class folders `ai=0`, `real=1`, seed 42 | `split_dataset.py`, `train.py`, `model/class_mapping.json` |
| §6.2 | Three 2-conv blocks (32, 64, 128 channels); pooling/dropout; 2048→256→1 Sigmoid | `model/small_cnn.py` |
| §6.3 | Real probability 0.6+ → real, AI probability 0.6+ → AI, otherwise uncertain | `api.py:interpret_probability` |
| §6.4 | ONNX export, opset 11, CPU inference | `train.py:export_to_onnx`, `api.py` |
| §7.2 | FastAPI `/health` and `/predict`; image validation and prediction JSON | `api.py`, tests |
| §7.3–7.5 | Frontend and history | Pre-existing JavaScript/HTML (the adapter's URL configuration was updated) |

## What is missing

- The original Python training source or Colab notebook.
- The original dataset, its licensing/provenance, and deduplication information.
- The original model weights (`detector.onnx`/checkpoints), run logs, epoch history, and exact output calibration.
- Raw confusion matrices, per-image predictions, reproducible benchmarks, and inference hardware details.

**Therefore the report's asserted 90%+ accuracy, per-class precision/recall and sub-50-ms runtime are historical, unverified statements; they must not be presented as newly reproduced results.** The reconstruction is source code only until training and independent evaluation take place.

## Documentation inconsistencies and choices

1. §4.1 mentions two training phases; §4.3 documents **single-phase 20-epoch training**. The reconstruction follows the more detailed §4.3.
2. The report discusses frequency-domain forensic research in §2; §4.2 and §6 describe an RGB-only SmallCNN, **not an FFT feature branch**. No unsubstantiated FFT pipeline was added.
3. The report's frontend files/flow occasionally use different names than the current repository (`home.html` vs `index.html`; `localStorage` vs `sessionStorage`). The actual public frontend source is the authority for its current code, and was not wholesale rewritten.
4. The report describes API insight cards, but a simple CNN classifier has no faithful per-image visual explanations by itself. The API returns clearly labeled prediction/threshold/limitations information instead of fabricated texture or lighting findings.
5. §7.2 describes permissive CORS for development; the reconstruction defaults to local origins and supports explicit `CORS_ORIGINS` for deployment.
6. This implementation uses `ai=0`, `real=1` and probability of real, so the results are mapped consistently with §5.4 and §6.3. It does not assert that the missing trained ONNX artifact had that same output semantics.

## Before citing the project in an AI/ML application

- Train a new model using properly sourced images; retain run environment, git commit SHA, dataset manifest and seed.
- Report *your newly measured* held-out metrics and hardware-specific inference time, ideally with generalization by generator and image compression.
- Document exactly which pieces you personally implemented in the original group project versus which pieces were reconstructed later.
- Consider inference calibration and uncertainty, particularly for novel generators and manipulated inputs.
