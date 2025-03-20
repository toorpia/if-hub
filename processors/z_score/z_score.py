#!/usr/bin/env python3
# Copyright (c) 2025 toorPIA / toor Inc.
import json
import argparse
import numpy as np
import pandas as pd
from datetime import datetime

def calculate_z_score(data, window_size=None):
    """
    時系列データのZ-scoreを計算
    
    Args:
        data: タイムスタンプと値のペアのリスト
        window_size: 移動ウィンドウのサイズ、Noneの場合は全期間で計算
        
    Returns:
        Z-scoreを含む処理結果のリスト
    """
    # データをPandasデータフレームに変換
    df = pd.DataFrame(data)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp')
    
    if window_size:
        # 移動ウィンドウでのZ-score計算
        df['mean'] = df['value'].rolling(window=window_size, min_periods=1).mean()
        df['std'] = df['value'].rolling(window=window_size, min_periods=1).std()
        # 標準偏差が0の場合はZ-scoreを0とする
        df['z_score'] = np.where(
            df['std'] > 0,
            (df['value'] - df['mean']) / df['std'],
            0
        )
    else:
        # 全期間でのZ-score計算
        mean = df['value'].mean()
        std = df['value'].std()
        df['mean'] = mean
        df['std'] = std
        # 標準偏差が0の場合はZ-scoreを0とする
        df['z_score'] = 0 if std == 0 else (df['value'] - mean) / std
    
    # 元のデータ形式に戻す
    result = []
    for _, row in df.iterrows():
        result.append({
            'timestamp': row['timestamp'].isoformat(),
            'value': row['z_score'],
            'original': float(row['value']),
            'mean': float(row['mean']),
            'std': float(row['std'])
        })
    
    return result

def calculate_deviation(data, window_size=None):
    """
    時系列データの偏差（平均からの差）を計算
    
    Args:
        data: タイムスタンプと値のペアのリスト
        window_size: 移動ウィンドウのサイズ、Noneの場合は全期間で計算
        
    Returns:
        偏差を含む処理結果のリスト
    """
    # データをPandasデータフレームに変換
    df = pd.DataFrame(data)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp')
    
    if window_size:
        # 移動ウィンドウでの偏差計算
        df['mean'] = df['value'].rolling(window=window_size, min_periods=1).mean()
        df['deviation'] = df['value'] - df['mean']
    else:
        # 全期間での偏差計算
        mean = df['value'].mean()
        df['mean'] = mean
        df['deviation'] = df['value'] - mean
    
    # 元のデータ形式に戻す
    result = []
    for _, row in df.iterrows():
        result.append({
            'timestamp': row['timestamp'].isoformat(),
            'value': float(row['deviation']),
            'original': float(row['value']),
            'mean': float(row['mean'])
        })
    
    return result

def main():
    parser = argparse.ArgumentParser(description='Calculate Z-scores or deviations for time series data')
    parser.add_argument('--input', required=True, help='Input JSON file path')
    parser.add_argument('--output', required=True, help='Output JSON file path')
    parser.add_argument('--window', type=int, default=None, help='Window size for rolling calculation')
    parser.add_argument('--type', choices=['zscore', 'deviation'], default='zscore', 
                       help='Calculation type: zscore or deviation')
    
    args = parser.parse_args()
    
    # 入力ファイルを読み込む
    with open(args.input, 'r') as f:
        input_data = json.load(f)
    
    data = input_data['data']
    options = input_data.get('options', {})
    window_size = args.window or options.get('windowSize')
    calc_type = args.type or options.get('type', 'zscore')
    
    # 計算タイプに応じて処理
    if calc_type == 'zscore':
        result = calculate_z_score(data, window_size)
        print(f"Z-scores calculated successfully with window size {window_size}")
    else:  # deviation
        result = calculate_deviation(data, window_size)
        print(f"Deviations calculated successfully with window size {window_size}")
    
    # 結果を出力ファイルに書き込む
    with open(args.output, 'w') as f:
        json.dump(result, f, indent=2)
    
    print(f"Output written to {args.output}")

if __name__ == "__main__":
    main()
