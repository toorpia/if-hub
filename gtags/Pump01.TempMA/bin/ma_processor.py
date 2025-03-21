#!/usr/bin/env python3
import sys
from collections import deque
import argparse

# コマンドライン引数
parser = argparse.ArgumentParser(description='移動平均の計算')
parser.add_argument('--window', type=int, default=5, help='移動平均の窓サイズ')
args = parser.parse_args()

# 移動平均のバッファ
window = deque(maxlen=args.window)

# 標準入力の各行を処理
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    
    try:
        # カンマ区切りの値を解析
        values = line.split(',')
        timestamp = values[0]  # タイムスタンプは常に最初のフィールド
        value = float(values[1])  # 最初のタグ値
        
        # 移動平均計算
        window.append(value)
        avg = sum(window) / len(window)
        
        # 結果を出力
        print(f"{timestamp},{avg}")
        sys.stdout.flush()
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.stderr.flush()
