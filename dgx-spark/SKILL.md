---
name: dgx-spark
description: NVIDIA DGX Spark (ARM64 + CUDA 13.0) 環境での開発ガイド。PyTorch のインストール、ARM64 wheel の取得、GPU 関連の設定を行う。「DGX Spark」「CUDA」「PyTorch インストール」「ARM64 の GPU 環境」「Blackwell」などのリクエストで使用する。
---

# DGX Spark (ARM64 + CUDA 13.0)

このマシンは NVIDIA DGX Spark。

- アーキテクチャ: ARM64 (aarch64)
- CUDA: 13.0
- GPU: NVIDIA GB10 (sm_121, Blackwell)
- VRAM: 119.7 GB（CPU と共有のユニファイドメモリ）

## メモリ管理（最重要）

121GB のメモリは CPU と GPU で共有するユニファイドメモリで、使い切るとマシンごと落ちる。実際に flash-attn と gptqmodel を MAX_JOBS=10 で同時ソースビルドして DGX Spark がクラッシュした実績がある。

- CUDA 拡張のソースビルド（flash-attn、gptqmodel、exllamav2/v3 など）は `MAX_JOBS=2` から `MAX_JOBS=4`、`NVCC_THREADS=1` に制限する
- 重いビルドは 1 パッケージずつ順番に実行し、複数パッケージの同時ビルドをしない
- ビルドとモデルロード・GPU ベンチマークを並行して走らせない
- 長時間処理の開始前と途中で `free -h` を確認し、available が 30GB を切ったら並列度を下げるか処理を止める
- GPU メモリもユニファイドメモリから取られるため、大きなモデルのロード中は CPU 側の余裕も同時に減る前提で計画する

## PyTorch インストール

PyPI の stable torch 2.11.0 以降は ARM64 + CUDA 13（cu130）の wheel を同梱しており、`torch>=2.4` を PyPI からそのまま入れるだけで `torch.cuda.is_available()` が True になる（2026-07 に DGX Spark 実機で確認済み）。まず PyPI stable を試す。

stable で ARM64 + CUDA wheel が取れない場合のみ、PyTorch nightly から取得する。

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
