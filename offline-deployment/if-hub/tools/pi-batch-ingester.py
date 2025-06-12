#!/usr/bin/env python3
"""
PI Batch Ingester - 独立したバッチ処理ツール

PI SystemからのプロセスデータをCSV形式で取得するバッチ処理ツールです。
IF-Hub PI-Ingesterサービスとは独立して動作し、指定した期間のデータを一括取得できます。

使用例:
    python pi-batch-ingester.py --config ../configs/equipments/7th-untan/config.yaml --start "2025-01-01" --end "2025-01-31"
"""

import os
import sys
import csv
import json
import re
import time
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.parse import urlencode
from urllib.error import URLError, HTTPError
from typing import Dict, Any, Optional, List


class PIBatchIngester:
    """PI System バッチデータ取得クラス"""
    
    def __init__(self, equipment_config_path: str, pi_host: str, pi_port: int, 
                 timeout: int = 30000, max_retries: int = 3, retry_interval: int = 5000):
        """
        初期化
        
        Args:
            equipment_config_path: 設備設定ファイルのパス
            pi_host: PI-API-Serverのホスト
            pi_port: PI-API-Serverのポート
            timeout: タイムアウト（ミリ秒）
            max_retries: 最大リトライ回数
            retry_interval: リトライ間隔（ミリ秒）
        """
        self.equipment_config_path = Path(equipment_config_path)
        self.equipment_config = self._load_equipment_config()
        self.pi_config = {
            'host': pi_host,
            'port': pi_port,
            'timeout': timeout,
            'max_retries': max_retries,
            'retry_interval': retry_interval
        }
        self.equipment_name = self._extract_equipment_name()
        
    def _parse_simple_yaml(self, content: str) -> Dict[str, Any]:
        """簡単なYAMLパーサー（標準ライブラリのみ使用）"""
        result = {}
        lines = content.split('\n')
        stack = [result]
        indent_stack = [-1]
        
        for line in lines:
            line = line.rstrip()
            if not line or line.strip().startswith('#'):
                continue
                
            # インデントレベルを計算
            indent = len(line) - len(line.lstrip())
            stripped = line.strip()
            
            # インデントレベルに基づいてスタックを調整
            while len(indent_stack) > 1 and indent <= indent_stack[-1]:
                stack.pop()
                indent_stack.pop()
            
            current_dict = stack[-1]
            
            if ':' in stripped and not stripped.startswith('- '):
                # キー: 値のペア
                key, value = stripped.split(':', 1)
                key = key.strip()
                value = value.strip()
                
                # コメントを削除（#以降を除去）
                if '#' in value:
                    value = value.split('#')[0].strip()
                
                # 値の型変換
                if value == 'true':
                    value = True
                elif value == 'false':
                    value = False
                elif value.startswith('"') and value.endswith('"'):
                    value = value[1:-1]
                elif value and value.lstrip('-').isdigit():
                    value = int(value)
                elif value and '.' in value:
                    # 浮動小数点数のチェックを改善
                    try:
                        value = float(value)
                    except ValueError:
                        pass  # 文字列として保持
                elif not value or value == '':
                    # 空の値の場合、ネストした辞書を作成
                    value = {}
                    stack.append(value)
                    indent_stack.append(indent)
                
                current_dict[key] = value
                
            elif stripped.startswith('- '):
                # リスト項目
                item = stripped[2:].strip()
                if item.startswith('"') and item.endswith('"'):
                    item = item[1:-1]
                
                # 直前のキーがリストでない場合、リストに変換
                if stack and len(stack) >= 2:
                    parent_dict = stack[-2]
                    parent_keys = list(parent_dict.keys())
                    if parent_keys:
                        parent_key = parent_keys[-1]
                        if not isinstance(parent_dict[parent_key], list):
                            parent_dict[parent_key] = []
                        parent_dict[parent_key].append(item)
        
        return result
    
    def _load_equipment_config(self) -> Dict[str, Any]:
        """設備設定ファイルを読み込み"""
        try:
            with open(self.equipment_config_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            config = self._parse_simple_yaml(content)
            
            # PI連携が有効かチェック
            if not config.get('pi_integration', {}).get('enabled', False):
                raise ValueError(f"PI integration is disabled in {self.equipment_config_path}")
                
            return config
        except FileNotFoundError:
            raise FileNotFoundError(f"Equipment config file not found: {self.equipment_config_path}")
        except Exception as e:
            raise ValueError(f"Invalid YAML in equipment config: {e}")
    
    def _extract_equipment_name(self) -> str:
        """設備名を設定ファイルパスから抽出"""
        # 設備設定ファイル名から設備名を抽出（拡張子を除く）
        return self.equipment_config_path.stem
    
    def format_date_for_pi(self, date: datetime) -> str:
        """日時をPI-API形式（yyyyMMddHHmmss）にフォーマット"""
        return date.strftime("%Y%m%d%H%M%S")
    
    def parse_datetime(self, date_str: str) -> datetime:
        """日時文字列をdatetimeオブジェクトに変換"""
        # 複数の形式をサポート
        formats = [
            "%Y-%m-%d",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%Y-%m-%dT%H:%M",
        ]
        
        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt)
            except ValueError:
                continue
        
        raise ValueError(f"Invalid datetime format: {date_str}")
    
    def get_source_tags(self) -> List[str]:
        """設備設定からPIタグリストを取得"""
        source_tags = self.equipment_config.get('basemap', {}).get('source_tags', [])
        if not source_tags:
            raise ValueError("No source_tags found in equipment config")
        return source_tags
    
    def fetch_data(self, start_date: datetime, end_date: datetime) -> str:
        """PI-APIからデータを取得"""
        # PI-API設定
        base_url = f"http://{self.pi_config['host']}:{self.pi_config['port']}"
        timeout = self.pi_config['timeout'] / 1000  # ミリ秒を秒に変換
        max_retries = self.pi_config['max_retries']
        retry_interval = self.pi_config['retry_interval'] / 1000  # ミリ秒を秒に変換
        
        # リクエストパラメータ
        source_tags = self.get_source_tags()
        params = {
            'TagNames': ','.join(source_tags),
            'StartDate': self.format_date_for_pi(start_date),
            'EndDate': self.format_date_for_pi(end_date)
        }
        
        print(f"🔄 PI-API Request:")
        print(f"   URL: {base_url}/PIData")
        print(f"   TagNames: {params['TagNames']}")
        print(f"   StartDate: {params['StartDate']}")
        print(f"   EndDate: {params['EndDate']}")
        
        # リトライ処理
        for attempt in range(1, max_retries + 1):
            try:
                print(f"   Attempt {attempt}/{max_retries}...")
                
                # TagNamesのカンマはエンコードせず、その他のパラメータのみエンコード
                tag_names = params['TagNames']
                other_params = {k: v for k, v in params.items() if k != 'TagNames'}
                other_encoded = urlencode(other_params)
                url_with_params = f"{base_url}/PIData/?TagNames={tag_names}&{other_encoded}"
                
                # リクエストを作成
                req = Request(url_with_params)
                req.add_header('Accept', 'text/csv')
                
                # HTTP リクエストを送信
                with urlopen(req, timeout=timeout) as response:
                    response_data = response.read().decode('utf-8')
                    
                    lines = response_data.strip().split('\n')
                    data_rows = len(lines) - 1 if lines and lines[0].startswith('Timestamp') else len(lines)
                    print(f"✅ PI-API fetch successful: {data_rows} data rows")
                    return response_data
                    
            except (URLError, HTTPError) as e:
                error_msg = str(e)
                if hasattr(e, 'code'):
                    error_msg = f"HTTP {e.code}: {error_msg}"
                print(f"❌ Attempt {attempt} failed: {error_msg}")
                
                if attempt == max_retries:
                    raise Exception(f"Failed after {max_retries} attempts: {error_msg}")
                
                if attempt < max_retries:
                    print(f"⏳ Retrying in {retry_interval}s...")
                    time.sleep(retry_interval)
            except Exception as e:
                error_msg = str(e)
                print(f"❌ Attempt {attempt} failed: {error_msg}")
                
                if attempt == max_retries:
                    raise Exception(f"Failed after {max_retries} attempts: {error_msg}")
                
                if attempt < max_retries:
                    print(f"⏳ Retrying in {retry_interval}s...")
                    time.sleep(retry_interval)
    
    def save_csv(self, data: str, output_path: str) -> None:
        """CSVデータをファイルに保存"""
        output_file = Path(output_path)
        
        # 出力ディレクトリを作成
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        try:
            with open(output_file, 'w', encoding='utf-8', newline='') as f:
                f.write(data)
            
            lines = data.strip().split('\n')
            data_rows = len(lines) - 1 if lines and lines[0].startswith('Timestamp') else len(lines)
            
            print(f"💾 CSV saved: {output_file}")
            print(f"   Data rows: {data_rows}")
            print(f"   File size: {output_file.stat().st_size} bytes")
            
        except Exception as e:
            raise Exception(f"Failed to save CSV file: {e}")
    
    def run_batch(self, start_date: datetime, end_date: datetime, output_path: Optional[str] = None) -> None:
        """バッチ処理を実行"""
        # デフォルト出力パス
        if output_path is None:
            output_path = f"./{self.equipment_name}.csv"
        
        print(f"🏭 PI Batch Ingester")
        print(f"   Equipment: {self.equipment_name}")
        print(f"   Period: {start_date} to {end_date}")
        print(f"   Output: {output_path}")
        print(f"   Tags: {len(self.get_source_tags())} tags")
        print()
        
        # データ取得
        csv_data = self.fetch_data(start_date, end_date)
        
        # ファイル保存
        self.save_csv(csv_data, output_path)
        
        print()
        print("✅ Batch processing completed successfully!")


def main():
    """
    PI Batch Ingester - PI Systemからのバッチデータ取得ツール
    
    指定した期間のプロセスデータをPI SystemからCSV形式で取得します。
    設備設定ファイルからタグ情報と接続設定を読み込み、独立したバッチ処理として実行されます。
    """
    # コマンドライン引数の解析
    parser = argparse.ArgumentParser(
        description='PI Batch Ingester - PI Systemからのバッチデータ取得ツール',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用例:
  python pi-batch-ingester.py -c equipment.yaml --host 10.255.234.21 --port 3011 -s "2025-01-01" -e "2025-01-31"
  python pi-batch-ingester.py -c equipment.yaml --host 10.255.234.21 --port 3011 -s "2025-01-01 08:00:00" -e "2025-01-01 17:00:00" -o "./backup/data.csv"

日時形式:
  - 2025-01-01 (日付のみ)
  - 2025-01-01 12:30:00 (日付と時刻)
  - 2025-01-01T12:30:00 (ISO形式)
        """
    )
    
    parser.add_argument('-c', '--config', required=True,
                       help='Equipment config file path (relative or absolute)')
    parser.add_argument('--host', required=True,
                       help='PI-API-Server hostname or IP address')
    parser.add_argument('--port', type=int, required=True,
                       help='PI-API-Server port number')
    parser.add_argument('-s', '--start', required=True,
                       help='Start datetime (e.g., "2025-01-01", "2025-01-01 12:00:00")')
    parser.add_argument('-e', '--end', required=True,
                       help='End datetime (e.g., "2025-01-31", "2025-01-31 23:59:59")')
    parser.add_argument('-o', '--output', default=None,
                       help='Output CSV file path (default: ./{equipment_name}.csv)')
    parser.add_argument('--timeout', type=int, default=30000,
                       help='Request timeout in milliseconds (default: 30000)')
    parser.add_argument('--retries', type=int, default=3,
                       help='Maximum number of retries (default: 3)')
    parser.add_argument('--retry-interval', type=int, default=5000,
                       help='Retry interval in milliseconds (default: 5000)')
    parser.add_argument('-v', '--verbose', action='store_true',
                       help='Enable verbose output')
    
    args = parser.parse_args()
    
    try:
        # PI Batch Ingesterを初期化
        ingester = PIBatchIngester(
            equipment_config_path=args.config,
            pi_host=args.host,
            pi_port=args.port,
            timeout=args.timeout,
            max_retries=args.retries,
            retry_interval=args.retry_interval
        )
        
        # 日時をパース
        start_date = ingester.parse_datetime(args.start)
        end_date = ingester.parse_datetime(args.end)
        
        # 日時の妥当性チェック
        if start_date >= end_date:
            raise ValueError("Start date must be before end date")
        
        # 期間の長さをチェック（安全のため）
        duration = end_date - start_date
        if duration.days > 365:
            print(f"⚠️  Large date range detected ({duration.days} days).")
            response = input("Continue? [y/N]: ").strip().lower()
            if response not in ['y', 'yes']:
                print("Operation cancelled.")
                sys.exit(0)
        
        # バッチ処理実行
        ingester.run_batch(start_date, end_date, args.output)
        
    except KeyboardInterrupt:
        print("\n❌ Operation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
