#!/usr/bin/env python3
"""
toorPIA Backend Analyzer プラグインエントリーポイント
"""

import sys
import os
import argparse
from typing import Dict, Any

# プラグインディレクトリをPythonパスに追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))

from plugins.analyzers.toorpia_backend.toorpia_analyzer import ToorPIAAnalyzer

def run(config_path: str, **kwargs) -> Dict[str, Any]:
    """
    toorPIA Backend Analyzer実行
    
    Args:
        config_path: 設備設定ファイルパス
        **kwargs: 追加オプション
    
    Returns:
        実行結果
    """
    try:
        # 環境変数設定（kwargsから）
        if 'mode' in kwargs:
            os.environ['TOORPIA_MODE'] = kwargs['mode']
        
        # アナライザー実行
        analyzer = ToorPIAAnalyzer(config_path)
        result = analyzer.execute()
        
        return result
        
    except Exception as e:
        return {
            "status": "error",
            "timestamp": analyzer._get_timestamp() if 'analyzer' in locals() else None,
            "error": {
                "code": "PLUGIN_ERROR",
                "message": str(e)
            }
        }

def validate_config(config_path: str) -> bool:
    """
    設定ファイルバリデーションのみ実行
    
    Args:
        config_path: 設備設定ファイルパス
    
    Returns:
        バリデーション結果
    """
    try:
        analyzer = ToorPIAAnalyzer(config_path)
        return analyzer.validate_config()
    except Exception as e:
        print(f"Validation failed: {e}")
        return False

def get_status(config_path: str) -> Dict[str, Any]:
    """
    プラグインステータス取得
    
    Args:
        config_path: 設備設定ファイルパス
    
    Returns:
        ステータス情報
    """
    try:
        analyzer = ToorPIAAnalyzer(config_path)
        return analyzer.get_status()
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }

def main():
    """コマンドライン実行エントリーポイント"""
    parser = argparse.ArgumentParser(description='toorPIA Backend Analyzer')
    parser.add_argument('config_path', help='設備設定ファイルパス')
    parser.add_argument('--mode', choices=['basemap_update', 'addplot_update'], 
                       default='addplot_update', help='処理モード')
    parser.add_argument('--validate-only', action='store_true', 
                       help='設定ファイルバリデーションのみ実行')
    parser.add_argument('--status', action='store_true', 
                       help='ステータス取得のみ実行')
    
    args = parser.parse_args()
    
    if args.validate_only:
        # バリデーションのみ
        is_valid = validate_config(args.config_path)
        print(f"Config validation: {'PASSED' if is_valid else 'FAILED'}")
        sys.exit(0 if is_valid else 1)
    
    elif args.status:
        # ステータス取得のみ
        status = get_status(args.config_path)
        import json
        print(json.dumps(status, indent=2, ensure_ascii=False))
        sys.exit(0)
    
    else:
        # 通常実行
        result = run(args.config_path, mode=args.mode)
        
        import json
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
        # 終了コード設定
        sys.exit(0 if result.get('status') == 'success' else 1)

if __name__ == '__main__':
    main()
