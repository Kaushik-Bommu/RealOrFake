"""SmallCNN architecture reconstructed from the project's academic report.

Input: RGB image tensor [N, 3, 32, 32], ImageNet-normalized.
Output: probability of the REAL class; ai=0, real=1.
This is a reference implementation, NOT the missing original training code.
"""
from torch import nn


class SmallCNN(nn.Module):
    def __init__(self):
        super().__init__()
        blocks = []
        in_channels = 3
        for out_channels in (32, 64, 128):
            blocks.extend([
                nn.Conv2d(in_channels, out_channels, 3, padding=1),
                nn.BatchNorm2d(out_channels),
                nn.ReLU(inplace=True),
                nn.Conv2d(out_channels, out_channels, 3, padding=1),
                nn.BatchNorm2d(out_channels),
                nn.ReLU(inplace=True),
                nn.MaxPool2d(2),
                nn.Dropout(0.25),
            ])
            in_channels = out_channels
        self.features = nn.Sequential(*blocks)
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(128 * 4 * 4, 256),
            nn.ReLU(inplace=True),
            nn.Dropout(0.5),
            nn.Linear(256, 1),
            nn.Sigmoid(),
        )

    def forward(self, x):
        return self.classifier(self.features(x))
