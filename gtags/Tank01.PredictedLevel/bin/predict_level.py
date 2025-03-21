#!/usr/bin/env python3
# Copyright (c) 2025 toorPIA / toor Inc.
"""
タンク水位予測用のPythonスクリプト
"""
import argparse
import json
import sys
import datetime
from typing import Dict, List, Any

def predict_future_level(tag_data: Dict[str, List[Dict[str, Any]]], params: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    タンク水位の未来予測を行う関数
    
    Args:
        tag_data: ソースタグのデータ
        params: 予測パラメータ
    
    Returns:
        予測結果の配列
    """
    # パラメータ取得
    prediction_minutes = params.get('prediction_minutes', 30)
    
    # 入力タグデータの取得
    level_data = tag_data.get('Tank01.Level', [])
    inflow_data = tag_data.get('Tank01.InFlow', [])
    outflow_data = tag_data.get('Tank01.OutFlow', [])
    
    if not level_data or not inflow_data or not outflow_data:
        return []
    
    # 結果配列
    results = []
    
    # 各時点のデータを処理
    for i, level_point in enumerate(level_data):
        # タイムスタンプを取得
        timestamp = level_point['timestamp']
        current_level = level_point['value']
        
        # 対応するインフロー/アウトフローを探す
        inflow = next((p['value'] for p in inflow_data if p['timestamp'] == timestamp), None)
        outflow = next((p['value'] for p in outflow_data if p['timestamp'] == timestamp), None)
        
        if inflow is None or outflow is None:
            continue
        
        # 単純な予測モデル：現在の水位 + (インフロー - アウトフロー) * 予測時間(分) / 60
        # 実際の実装ではより複雑な機械学習モデルを使用する
        net_flow_per_hour = (inflow - outflow)
        predicted_change = net_flow_per_hour * (prediction_minutes / 60)
        predicted_level = current_level + predicted_change
        
        # タイムスタンプを予測時間分進める
        dt = datetime.datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        future_dt = dt + datetime.timedelta(minutes=prediction_minutes)
        future_timestamp = future_dt.isoformat().replace('+00:00', 'Z')
        
        # 結果に追加
        results.append({
            'timestamp': future_timestamp,
            'value': round(predicted_level, 2)
        })
    
    return results

def main():
    """
    メイン関数
    """
    parser = argparse.ArgumentParser(description='タンク水位予測スクリプト')
    parser.add_argument('--function', required=True, help='実行する関数名')
    parser.add_argument('--input', required=True, help='入力JSONファイルのパス')
    parser.add_argument('--output', required=True, help='出力JSONファイルのパス')
    
    args = parser.parse_args()
    
    # 入力データの読み込み
    try:
        with open(args.input, 'r', encoding='utf-8') as f:
            input_data = json.load(f)
    except Exception as e:
        print(f"入力ファイルの読み込みエラー: {e}", file=sys.stderr)
        sys.exit(1)
    
    # 関数の実行
    tag_data = input_data.get('tagData', {})
    params = input_data.get('params', {})
    
    try:
        if args.function == 'predict_future_level':
            result = predict_future_level(tag_data, params)
        else:
            print(f"未知の関数: {args.function}", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"関数実行エラー: {e}", file=sys.stderr)
        sys.exit(1)
    
    # 結果の書き込み
    try:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"出力ファイルの書き込みエラー: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
