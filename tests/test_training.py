import pytest
import torch
from PIL import Image

from model.small_cnn import SmallCNN
from split_dataset import split_dataset


def test_model_shape_and_probability():
    net = SmallCNN().eval()
    with torch.no_grad():
        result = net(torch.zeros(2, 3, 32, 32))
    assert result.shape == (2, 1)
    assert torch.all((result >= 0) & (result <= 1))


def test_stratified_split(tmp_path):
    source, dest = tmp_path / "raw", tmp_path / "output"
    for label in ("ai", "real"):
        (source / label).mkdir(parents=True)
        for i in range(20):
            Image.new("RGB", (8, 8), (i * 10, 0, 0)).save(source / label / f"img{i:02d}.png")
    sizes = split_dataset(source, dest)
    assert sizes == {"train/ai": 14, "val/ai": 3, "test/ai": 3, "train/real": 14, "val/real": 3, "test/real": 3}
    with pytest.raises(FileExistsError):
        split_dataset(source, dest)
