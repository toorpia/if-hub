#!/usr/bin/env python3
"""
PI Batch Ingester Ubuntu検証テスト
"""

import sys
import os
import tempfile
from pathlib import Path

# PI Batch Ingesterモジュールをインポート
sys.path.insert(0, ".")

# Mainセクションを除外してクラス定義部分のみを実行
with open("pi-batch-ingester.py", "r", encoding="utf-8") as f:
    content = f.read()

# main関数とif __name__ == '__main__'部分を除外
class_content = content.split('def main():')[0]
exec(class_content)

def test_yaml_parser():
    """YAMLパーサーのテスト"""
    print("🔧 YAMLパーサーテスト")
    
    try:
        # ダミーのPIConfig
        ingester = PIBatchIngester("equipment.yaml", "127.0.0.1", 3011)
        print(f"   設備名: {ingester.equipment_name}")
        print(f"   タグ数: {len(ingester.get_source_tags())}")
        print(f"   タグ一覧: {ingester.get_source_tags()}")
        print("   ✅ YAML解析成功!")
        return True
    except Exception as e:
        print(f"   ❌ エラー: {e}")
        return False

def test_datetime_parsing():
    """日時解析テスト"""
    print("🔧 日時解析テスト")
    
    try:
        ingester = PIBatchIngester("equipment.yaml", "127.0.0.1", 3011)
        
        test_dates = [
            "2025-01-01",
            "2025-01-01 12:30:00",
            "2025-01-01T12:30:00",
            "2025-01-01 12:30",
        ]
        
        for date_str in test_dates:
            parsed = ingester.parse_datetime(date_str)
            formatted = ingester.format_date_for_pi(parsed)
            print(f"   入力: {date_str} -> 解析: {parsed} -> PI形式: {formatted}")
        
        print("   ✅ 日時解析テスト完了!")
        return True
    except Exception as e:
        print(f"   ❌ 日時解析エラー: {e}")
        return False

def test_csv_operations():
    """CSV操作テスト"""
    print("🔧 CSV操作テスト")
    
    try:
        ingester = PIBatchIngester("equipment.yaml", "127.0.0.1", 3011)
        
        # テストCSVデータ
        test_data = "Timestamp,POW:711034.PV,POW:7T105B1.PV\n2025-01-01 12:00:00,60.5,120.3\n"
        
        # 一時ファイルに保存
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            temp_path = f.name
            
        ingester.save_csv(test_data, temp_path)
        
        # ファイル読み込み確認
        with open(temp_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        print(f"   書き込み/読み込み成功! ファイルサイズ: {Path(temp_path).stat().st_size} bytes")
        print(f"   内容プレビュー: {content[:50]}...")
        
        # クリーンアップ
        os.unlink(temp_path)
        print("   ✅ CSV操作テスト完了!")
        return True
    except Exception as e:
        print(f"   ❌ CSV操作エラー: {e}")
        return False

def test_configuration_validation():
    """設定検証テスト"""
    print("🔧 設定検証テスト")
    
    try:
        # 正常な設定でのテスト
        ingester = PIBatchIngester("equipment.yaml", "127.0.0.1", 3011)
        
        # PI設定の確認
        pi_config = ingester.pi_config
        expected_keys = ['host', 'port', 'timeout', 'max_retries', 'retry_interval']
        
        for key in expected_keys:
            if key not in pi_config:
                raise ValueError(f"Missing PI config key: {key}")
        
        print(f"   PI設定: {pi_config}")
        print("   ✅ 設定検証テスト完了!")
        return True
    except Exception as e:
        print(f"   ❌ 設定検証エラー: {e}")
        return False

def main():
    """メインテスト実行"""
    print("=================================================================")
    print("🐍 PI Batch Ingester Python クラステスト")
    print("=================================================================")
    
    tests = [
        test_yaml_parser,
        test_datetime_parsing,
        test_csv_operations,
        test_configuration_validation,
    ]
    
    passed = 0
    total = len(tests)
    
    for test_func in tests:
        print()
        if test_func():
            passed += 1
        else:
            print("   テスト失敗!")
    
    print()
    print("=================================================================")
    print("🎯 Pythonクラステスト結果")
    print("=================================================================")
    print(f"✅ 成功: {passed}")
    print(f"🔢 総数: {total}")
    
    if passed == total:
        print("🎉 全Pythonクラステスト合格!")
        return True
    else:
        failed = total - passed
        print(f"❌ {failed} 個のテストが失敗しました。")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
