# Ubuntu 22.04 LTS ベースでPI Batch Ingesterの動作検証
FROM ubuntu:22.04

# タイムゾーンの設定（インタラクティブ入力を避ける）
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Asia/Tokyo

# 必要最小限のパッケージのみインストール
RUN apt-get update && apt-get install -y \
    python3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 作業ディレクトリを設定
WORKDIR /app

# PI Batch Ingesterスクリプトをコピー
COPY pi-batch-ingester.py .
COPY equipment.yaml .

# テスト用スクリプトをコピー
COPY test-script.sh .
COPY test_pi_batch_ingester.py .
RUN chmod +x test-script.sh test_pi_batch_ingester.py

# Pythonのバージョンとインストール済みモジュールを確認
RUN echo "=== Python Environment Check ===" && \
    python3 --version && \
    echo "=== Available modules ===" && \
    python3 -c "import sys; print('\\n'.join(sys.builtin_module_names))" && \
    echo "=== Standard library modules ===" && \
    python3 -c "import os, sys, csv, json, re, time, argparse, datetime, pathlib, urllib.request, urllib.parse, urllib.error, typing; print('All required modules imported successfully!')"

# デフォルトコマンド
CMD ["./test-script.sh"]
