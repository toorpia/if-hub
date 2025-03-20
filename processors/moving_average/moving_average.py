#!/usr/bin/env python3
# Copyright (c) 2025 toorPIA / toor Inc.
"""
移動平均計算プロセッサ

使用方法:
  python moving_average.py --input input.json --output output.json --window 5
"""

import argparse
import json
import sys
import pandas as pd
import numpy as np
from datetime import datetime

def parse_arguments():
    """コマンドライン引数の解析"""
    parser = argparse.ArgumentParser(description='時系列データの移動平均を計算')
    parser.add_argument('--input', type=str, required=True, help='入力JSONファイルパス')
    parser.add_argument('--output', type=str, required=True, help='出力JSONファイルパス')
    parser.add_argument('--window', type=int, default=5, help='移動平均の窓サイズ')
    return parser.parse_args()

def main():
    """メイン処理"""
    args = parse_arguments()
    
    try:
        # 入力ファイルを読み込む
        with open(args.input, 'r') as f:
            input_data = json.load(f)
        
        # データをパースする
        data = input_data.get('data', [])
        options = input_data.get('options', {})
        
        if not data:
            print("Error: No data provided", file=sys.stderr)
            sys.exit(1)
        
        # データフレームに変換
        df = pd.DataFrame(data)
        
        # タイムスタンプをdatetime型に変換
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        # 時系列ごとに並べ替え
        df = df.sort_values('timestamp')
        
        # 移動平均を計算
        window_size = args.window
        df['ma_value'] = df['value'].rolling(window=window_size, min_periods=1).mean().round(2)
        
        # 出力フォーマットに変換
        result = []
        for _, row in df.iterrows():
            result.append({
                'timestamp': row['timestamp'].isoformat(),
                'value': float(row['ma_value']),
                'original': float(row['value'])
            })
        
        # 結果をファイルに書き込む
        with open(args.output, 'w') as f:
            json.dump(result, f, indent=2)
        
        print(f"処理完了: {len(result)}ポイントの移動平均を計算しました")
        sys.exit(0)
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
