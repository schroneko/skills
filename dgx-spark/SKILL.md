---
name: dgx-spark
description: NVIDIA DGX Spark (ARM64 + CUDA 13.0) 環境での開発ガイド。PyTorch のインストール、ARM64 wheel の取得、GPU 関連の設定を行う。「DGX Spark」「CUDA」「PyTorch インストール」「ARM64 の GPU 環境」「Blackwell」などのリクエストで使用する。
---

# DGX Spark (ARM64 + CUDA 13.0)

このマシンは NVIDIA DGX Spark。

- アーキテクチャ: ARM64 (aarch64)
- CUDA: 13.0
- GPU: NVIDIA GB10 (sm_121, Blackwell)
- VRAM: 119.7 GB

## PyTorch インストール

標準の PyTorch wheel は x86_64 のみ。ARM64 + CUDA 13.0 は PyTorch nightly から取得する。

pyproject.toml に torch と triton を両方明示し、uv.sources で nightly インデックスを指定する:

```toml
[project]
requires-python = ">=3.11,<3.12"
dependencies = [
    "torch==2.11.0.dev20260105",
    "triton",
]

[tool.uv.sources]
torch = { index = "pytorch-nightly-cu130" }
triton = { index = "pytorch-nightly-cu130" }

[[tool.uv.index]]
name = "pytorch-nightly-cu130"
url = "https://download.pytorch.org/whl/nightly/cu130"
explicit = true
```

ポイント:

- torch と triton の両方を dependencies に追加する (triton がないと uv.sources が適用されない)
- ARM64 wheel がある特定バージョンを指定する (最新版には ARM64 wheel がない場合がある)
- `explicit = true` で他のパッケージは PyPI から取得する

## ARM64 未対応パッケージ

以下のパッケージは ARM64 wheel がない:

- decord: opencv-python-headless で代替
