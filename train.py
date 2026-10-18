"""Train, evaluate and export a NEW SmallCNN from locally supplied images.

Reconstruction from the academic report, NOT recovered original source.
No dataset, trained weights, benchmark evidence or checkpoint is bundled.
Usage: python train.py --data dataset --epochs 20
"""
import argparse
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader
from torchvision import datasets, transforms

from model.small_cnn import SmallCNN

MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)
EXPECTED_CLASSES = ["ai", "real"]


def transform(training: bool):
    steps = [transforms.Resize((32, 32), interpolation=transforms.InterpolationMode.BILINEAR)]
    if training:
        steps.extend([transforms.RandomCrop(32, padding=4), transforms.RandomHorizontalFlip()])
    steps += [transforms.ToTensor(), transforms.Normalize(MEAN, STD)]
    return transforms.Compose(steps)


def make_loader(root: Path, split: str, batch_size: int, workers: int):
    dataset = datasets.ImageFolder(root / split, transform=transform(split == "train"))
    if dataset.classes != EXPECTED_CLASSES:
        raise ValueError(f"Expected folders {EXPECTED_CLASSES}, found {dataset.classes}")
    if len(dataset) == 0:
        raise ValueError(f"Empty {split} set")
    return DataLoader(dataset, batch_size=batch_size, shuffle=split == "train", num_workers=workers, pin_memory=torch.cuda.is_available())


def epoch_pass(net, loader, criterion, device, optimizer=None):
    training = optimizer is not None
    net.train(training)
    total, loss_sum, correct = 0, 0.0, 0
    with torch.set_grad_enabled(training):
        for x, y in loader:
            x = x.to(device)
            target = y.to(device).float().view(-1, 1)
            if training:
                optimizer.zero_grad(set_to_none=True)
            probability = net(x)
            loss = criterion(probability, target)
            if training:
                loss.backward()
                optimizer.step()
            n = len(y)
            loss_sum += float(loss.item()) * n
            correct += int(((probability >= 0.5) == (target >= 0.5)).sum().item())
            total += n
    return {"loss": round(loss_sum / total, 5), "accuracy": round(correct / total, 5), "examples": total}


def test_metrics(net, loader, device):
    net.eval()
    confusion = np.zeros((2, 2), dtype=np.int64)  # actual row, predicted column
    with torch.no_grad():
        for x, target in loader:
            out = net(x.to(device)).cpu().flatten().numpy()
            for a, p in zip(target.numpy(), out >= 0.5):
                confusion[int(a), int(p)] += 1
    metrics = {"confusion_matrix": confusion.tolist(), "class_order": EXPECTED_CLASSES}
    support = confusion.sum(axis=1)
    tp = np.diag(confusion)
    prec_den = confusion.sum(axis=0)
    class_f1 = []
    for i, label in enumerate(EXPECTED_CLASSES):
        precision = float(tp[i] / prec_den[i]) if prec_den[i] else 0.0
        recall = float(tp[i] / support[i]) if support[i] else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        metrics[label] = {"precision": round(precision, 5), "recall": round(recall, 5), "f1": round(f1, 5), "support": int(support[i])}
        class_f1.append(f1)
    metrics["accuracy"] = round(float(tp.sum() / confusion.sum()), 5)
    metrics["weighted_f1"] = round(float(np.average(class_f1, weights=support)), 5)
    return metrics


def export_to_onnx(net, file: Path):
    file.parent.mkdir(parents=True, exist_ok=True)
    net.eval().cpu()
    dummy = torch.zeros((1, 3, 32, 32), dtype=torch.float32)
    # The report specifies opset 11 and a single real-class probability output.
    torch.onnx.export(net, dummy, str(file), input_names=["image"], output_names=["real_probability"], opset_version=11, dynamo=False, do_constant_folding=True)
    import onnxruntime as ort
    session = ort.InferenceSession(str(file), providers=["CPUExecutionProvider"])
    with torch.no_grad():
        pytorch_output = net(dummy).numpy()
    onnx_output = session.run(None, {session.get_inputs()[0].name: dummy.numpy()})[0]
    max_difference = float(np.max(np.abs(pytorch_output - onnx_output)))
    if not np.allclose(pytorch_output, onnx_output, atol=1e-4, rtol=1e-4):
        raise RuntimeError(f"ONNX parity check failed (max absolute difference={max_difference})")
    return max_difference


def main(args):
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() and not args.cpu else "cpu")
    loaders = {key: make_loader(args.data, key, args.batch_size, args.workers) for key in ("train", "val", "test")}
    net = SmallCNN().to(device)
    criterion = nn.BCELoss()
    optimizer = torch.optim.Adam(net.parameters(), lr=args.lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    args.output.mkdir(parents=True, exist_ok=True)
    checkpoint_path = args.output / "best.pt"
    best_accuracy = -1.0
    history = []
    for i in range(args.epochs):
        start = time.perf_counter()
        train = epoch_pass(net, loaders["train"], criterion, device, optimizer)
        val = epoch_pass(net, loaders["val"], criterion, device)
        scheduler.step()
        history.append({"epoch": i + 1, "train": train, "validation": val})
        print(f"Epoch {i + 1}/{args.epochs} train_acc={train['accuracy']:.4f} val_acc={val['accuracy']:.4f} ({time.perf_counter()-start:.1f}s)", flush=True)
        if val["accuracy"] > best_accuracy:
            best_accuracy = val["accuracy"]
            torch.save(net.state_dict(), checkpoint_path)
    # No peeking at test during model selection; evaluate only the best checkpoint.
    net.load_state_dict(torch.load(checkpoint_path, map_location=device, weights_only=True))
    metrics = test_metrics(net, loaders["test"], device)
    parity_difference = export_to_onnx(net, args.output / "detector.onnx")
    outcome = {"dataset_counts": {k: len(v.dataset) for k, v in loaders.items()}, "seed": args.seed, "epochs": args.epochs, "batch_size": args.batch_size, "learning_rate": args.lr, "device": str(device), "best_validation_accuracy": best_accuracy, "test": metrics, "onnx_max_absolute_error": parity_difference, "history": history}
    (args.output / "metrics.json").write_text(json.dumps(outcome, indent=2), encoding="utf-8")
    print(json.dumps({"test": metrics, "onnx_max_absolute_error": parity_difference}, indent=2))
    print("Exported trained model to", args.output / "detector.onnx")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path("dataset"))
    parser.add_argument("--output", type=Path, default=Path("model"))
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--workers", type=int, default=0)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--cpu", action="store_true")
    opts = parser.parse_args()
    if opts.epochs < 1 or opts.batch_size < 1:
        parser.error("epochs and batch-size must be positive")
    main(opts)
