#!/usr/bin/env python3
# Copyright (c) 2025 toorPIA / toor Inc.
"""
タンク水位予測用のPythonスクリプト
"""
import argparse
import json
import sys
import datetime
import csv
from typing import Dict, List, Any, Optional

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
    prediction_minutes = int(params.get('prediction_minutes', 30))
    
    # デバッグ出力
    print(f"prediction_minutes: {prediction_minutes}", file=sys.stderr)
    print(f"入力タグデータ: {list(tag_data.keys())}", file=sys.stderr)

    # 入力タグデータの取得
    level_data = tag_data.get('Tank01.Level', [])
    
    # InFlowとOutFlowが存在しない場合のダミーデータを用意
    # IF-Hubの制約のため、これらが存在しなくても動作するようにする
    if 'Tank01.InFlow' not in tag_data or not tag_data['Tank01.InFlow']:
        # 単純化のため、InFlowは一定値0.5として扱う
        inflow_data = [{
            'timestamp': point['timestamp'],
            'value': 0.5  # ダミー値
        } for point in level_data]
    else:
        inflow_data = tag_data.get('Tank01.InFlow', [])
    
    if 'Tank01.OutFlow' not in tag_data or not tag_data['Tank01.OutFlow']:
        # 単純化のため、OutFlowは一定値0.3として扱う
        outflow_data = [{
            'timestamp': point['timestamp'],
            'value': 0.3  # ダミー値
        } for point in level_data]
    else:
        outflow_data = tag_data.get('Tank01.OutFlow', [])

    if not level_data:
        print("水位データがありません", file=sys.stderr)
        return []

    # 結果配列
    results = []

    # 各時点のデータを処理
    for i, level_point in enumerate(level_data):
        # タイムスタンプを取得
        timestamp = level_point['timestamp']
        current_level = level_point['value']

        # 対応するインフロー/アウトフローを探す
        inflow = next((p['value'] for p in inflow_data if p['timestamp'] == timestamp), 0.5)  # デフォルト値0.5
        outflow = next((p['value'] for p in outflow_data if p['timestamp'] == timestamp), 0.3)  # デフォルト値0.3

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

def process_stdin_data() -> Dict[str, List[Dict[str, Any]]]:
    """
    標準入力からCSV形式のデータを読み込みタグデータの辞書を返す
    
    Returns:
        タグデータの辞書（タグ名->データポイント配列）
    """
    tag_data = {}
    
    # 標準入力から行を読み込む
    lines = sys.stdin.readlines()
    
    if not lines:
        print("標準入力からデータを読み込めませんでした", file=sys.stderr)
        return {}
    
    # データ構造を解析
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # タイムスタンプと値をカンマで分割
        parts = line.split(',')
        
        if len(parts) < 2:
            print(f"無効な行形式: {line}", file=sys.stderr)
            continue
            
        timestamp = parts[0]
        
        # 先頭のタグデータは常にTank01.Level
        level_value = float(parts[1]) if parts[1] != 'null' else None
        
        # Level値が有効な場合のみ処理
        if level_value is not None:
            if 'Tank01.Level' not in tag_data:
                tag_data['Tank01.Level'] = []
                
            tag_data['Tank01.Level'].append({
                'timestamp': timestamp,
                'value': level_value
            })
            
        # 追加のタグがある場合（InFlow, OutFlow）
        if len(parts) > 2 and parts[2] != 'null':
            if 'Tank01.InFlow' not in tag_data:
                tag_data['Tank01.InFlow'] = []
                
            tag_data['Tank01.InFlow'].append({
                'timestamp': timestamp,
                'value': float(parts[2])
            })
            
        if len(parts) > 3 and parts[3] != 'null':
            if 'Tank01.OutFlow' not in tag_data:
                tag_data['Tank01.OutFlow'] = []
                
            tag_data['Tank01.OutFlow'].append({
                'timestamp': timestamp,
                'value': float(parts[3])
            })
    
    # タグの状態をデバッグ出力
    for tag_name, points in tag_data.items():
        print(f"{tag_name}: {len(points)}ポイント", file=sys.stderr)
        
    return tag_data

def main():
    """
    メイン関数
    """
    parser = argparse.ArgumentParser(description='タンク水位予測スクリプト')
    # 位置引数を許容するために最初の引数をオプションではなく位置引数として定義
    parser.add_argument('function_name', nargs='?', default='predict_future_level', 
                      help='実行する関数名 (デフォルト: predict_future_level)')
    parser.add_argument('--function', required=False, dest='function', 
                      help='実行する関数名 (--functionオプション形式)')
    parser.add_argument('--input', required=False, help='入力JSONファイルのパス (指定なしの場合は標準入力から読み込み)')
    parser.add_argument('--output', required=False, help='出力JSONファイルのパス (指定なしの場合は標準出力に書き出し)')
    parser.add_argument('--prediction_minutes', required=False, type=int, default=30, 
                      help='予測時間（分）(デフォルト: 30)')

    # 引数がなければ（IF-Hub環境での実行）、アクションを終了しないようにする
    if len(sys.argv) <= 1:
        print("IF-Hub環境で実行します: 標準入出力モード", file=sys.stderr)
        use_stdin_stdout = True
        function_name = 'predict_future_level'
        params = {'prediction_minutes': 30}
    else:
        args = parser.parse_args()
        use_stdin_stdout = args.input is None or args.output is None
        # 位置引数かオプション引数のどちらかから関数名を取得
        function_name = args.function if args.function else args.function_name
        params = {'prediction_minutes': args.prediction_minutes}

    # 入力データの読み込み
    if use_stdin_stdout:
        # 標準入力からデータを読み込む
        print("標準入力からデータを読み込みます...", file=sys.stderr)
        tag_data = process_stdin_data()
        if not tag_data:
            print("有効なタグデータがありません", file=sys.stderr)
            sys.exit(1)
    else:
        # 指定されたJSONファイルから読み込む
        try:
            with open(args.input, 'r', encoding='utf-8') as f:
                input_data = json.load(f)
                tag_data = input_data.get('tagData', {})
                params = input_data.get('params', params)
        except Exception as e:
            print(f"入力ファイルの読み込みエラー: {e}", file=sys.stderr)
            sys.exit(1)

    # 関数の実行
    try:
        if function_name == 'predict_future_level':
            result = predict_future_level(tag_data, params)
        else:
            print(f"未知の関数: {function_name}", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"関数実行エラー: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

    # 結果の書き込み
    if use_stdin_stdout:
        # 標準出力にCSVとして出力
        print("標準出力に結果を書き込みます...", file=sys.stderr)
        
        # CSVフォーマットで結果を出力（タイムスタンプ,値）
        for point in result:
            print(f"{point['timestamp']},{point['value']}")
    else:
        # 指定されたJSONファイルに書き込む
        try:
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"出力ファイルの書き込みエラー: {e}", file=sys.stderr)
            sys.exit(1)

if __name__ == "__main__":
    main()
