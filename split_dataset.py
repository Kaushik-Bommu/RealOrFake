"""Reproducible stratified file split for the reconstructed training workflow.

Expects: raw/ai/* and raw/real/* (only local images, no dataset included).
Writes: dataset/{train,val,test}/{ai,real}/*; originals remain unchanged.
"""
import argparse
import random
import shutil
from pathlib import Path

EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def split_dataset(source: Path, output: Path, seed: int = 42) -> dict:
    source, output = source.resolve(), output.resolve()
    if output == source or source in output.parents or output in source.parents:
        raise ValueError("Input and output must be separate, non-nested directories")
    if output.exists() and any(output.iterdir()):
        raise FileExistsError(f"Output directory is not empty: {output}")
    manifest = {}
    rng = random.Random(seed)
    for label in ("ai", "real"):
        folder = source / label
        if not folder.is_dir():
            raise FileNotFoundError(f"Missing class folder: {folder}")
        images = sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in EXTENSIONS)
        if len(images) < 7:
            raise ValueError(f"Need at least seven images in {folder}")
        rng.shuffle(images)
        n = len(images)
        train_end = int(n * 0.70)
        val_end = train_end + int(n * 0.15)
        sections = {"train": images[:train_end], "val": images[train_end:val_end], "test": images[val_end:]}
        for split, files in sections.items():
            destination = output / split / label
            destination.mkdir(parents=True, exist_ok=True)
            for img in files:
                shutil.copy2(img, destination / img.name)
            manifest[f"{split}/{label}"] = len(files)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("dataset"))
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    print(split_dataset(args.input, args.output, args.seed))
