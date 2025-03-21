#!/usr/bin/env python3
import sys
from collections import deque
import argparse
import math

# コマンドライン引数
parser = argparse.ArgumentParser(description='Z-score計算')
parser.add_argument('--window', type=int, default=24, help='移動ウィンドウサイズ')
args = parser.parse_args()

# 移動ウィンドウ
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
        
        # 移動ウィンドウに追加
        window.append(value)
        
        # Z-score計算（十分なデータポイントがあるときのみ）
        if len(window) >= 2:  # 分散を計算するためには少なくとも2点必要
            mean = sum(window) / len(window)
            variance = sum((x - mean) ** 2 for x in window) / len(window)
            stddev = math.sqrt(variance) if variance > 0 else 1  # 0除算を防止
            zscore = (value - mean) / stddev
        else:
            zscore = 0  # データポイントが少ない場合は0とする
        
        # 結果を出力
        print(f"{timestamp},{zscore}")
        sys.stdout.flush()
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.stderr.flush()
