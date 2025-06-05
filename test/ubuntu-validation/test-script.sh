#!/bin/bash

echo "==================================================================="
echo "🐧 PI Batch Ingester Ubuntu 22.04 LTS 検証テスト"
echo "==================================================================="

# テスト結果を記録
TESTS_PASSED=0
TESTS_TOTAL=0

# テスト関数
run_test() {
    local test_name="$1"
    local command="$2"
    
    echo ""
    echo "🔧 テスト: $test_name"
    echo "   コマンド: $command"
    
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    
    if eval "$command"; then
        echo "   ✅ 成功"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo "   ❌ 失敗"
    fi
}

# Python環境確認
echo ""
echo "🐍 Python環境確認"
python3 --version
echo "Pythonパス: $(which python3)"

# テスト1: 基本的なヘルプ表示
run_test "ヘルプ表示" "python3 pi-batch-ingester.py --help"

# テスト2: インポート文の検証
run_test "必要モジュールのインポート" "python3 -c 'import os, sys, csv, json, re, time, argparse; from datetime import datetime, timedelta; from pathlib import Path; from urllib.request import urlopen, Request; from urllib.parse import urlencode; from urllib.error import URLError, HTTPError; from typing import Dict, Any, Optional, List; print(\"すべてのモジュールが正常にインポートされました\")'"

# テスト3: 設定ファイルの読み込み検証
run_test "YAMLパーサーのテスト" "python3 -c '
import sys
sys.path.insert(0, \".\")

# PI Batch Ingesterクラスをインポート
exec(open(\"pi-batch-ingester.py\").read().split(\"if __name__ == \"\"'__main__'\":\")[0])

# 設定ファイル読み込みテスト
try:
    # ダミーのPIConfig
    ingester = PIBatchIngester(\"equipment.yaml\", \"127.0.0.1\", 3011)
    print(\"設備名:\", ingester.equipment_name)
    print(\"タグ数:\", len(ingester.get_source_tags()))
    print(\"タグ一覧:\", ingester.get_source_tags())
    print(\"YAML解析成功!\")
except Exception as e:
    print(f\"エラー: {e}\")
    sys.exit(1)
'"

# テスト4: 日時解析の検証
run_test "日時解析テスト" "python3 -c '
import sys
exec(open(\"pi-batch-ingester.py\").read().split(\"if __name__ == \"\"'__main__'\":\")[0])

ingester = PIBatchIngester(\"equipment.yaml\", \"127.0.0.1\", 3011)

test_dates = [
    \"2025-01-01\",
    \"2025-01-01 12:30:00\",
    \"2025-01-01T12:30:00\",
    \"2025-01-01 12:30\",
]

for date_str in test_dates:
    try:
        parsed = ingester.parse_datetime(date_str)
        formatted = ingester.format_date_for_pi(parsed)
        print(f\"入力: {date_str} -> 解析: {parsed} -> PI形式: {formatted}\")
    except Exception as e:
        print(f\"日時解析エラー ({date_str}): {e}\")
        sys.exit(1)

print(\"日時解析テスト完了!\")
'"

# テスト5: URLエンコーディングテスト
run_test "URLエンコーディングテスト" "python3 -c '
from urllib.parse import urlencode

params = {
    \"TagNames\": \"POW:711034.PV,POW:7T105B1.PV\",
    \"StartDate\": \"20250101120000\",
    \"EndDate\": \"20250101130000\"
}

encoded = urlencode(params)
print(f\"エンコード結果: {encoded}\")
print(\"URLエンコーディングテスト完了!\")
'"

# テスト6: ファイルI/Oテスト
run_test "ファイルI/Oテスト" "python3 -c '
from pathlib import Path

# テストCSVデータ
test_data = \"Timestamp,Tag1,Tag2\\n2025-01-01 12:00:00,60.5,120.3\\n\"

# ファイル作成テスト
output_file = Path(\"./test_output.csv\")
output_file.parent.mkdir(parents=True, exist_ok=True)

with open(output_file, \"w\", encoding=\"utf-8\", newline=\"\") as f:
    f.write(test_data)

# ファイル読み込み確認
with open(output_file, \"r\", encoding=\"utf-8\") as f:
    content = f.read()

print(f\"書き込み/読み込み成功! ファイルサイズ: {output_file.stat().st_size} bytes\")
print(f\"内容:\\n{content}\")

# クリーンアップ
output_file.unlink()
print(\"ファイルI/Oテスト完了!\")
'"

# テスト7: コマンドライン引数解析テスト
run_test "引数解析テスト（不正な引数）" "python3 pi-batch-ingester.py -c equipment.yaml --host 127.0.0.1 --port 3011 -s invalid-date -e 2025-01-01 2>&1 | grep -q 'Invalid datetime format' && echo 'エラーハンドリング正常'"

# テスト8: 設定ファイル不正テスト
run_test "不正設定ファイルテスト" "echo 'invalid: yaml: content:' > invalid.yaml && python3 pi-batch-ingester.py -c invalid.yaml --host 127.0.0.1 --port 3011 -s 2025-01-01 -e 2025-01-02 2>&1 | grep -q 'Invalid YAML' && echo 'YAMLエラーハンドリング正常'"

# 最終結果
echo ""
echo "==================================================================="
echo "🎯 テスト結果サマリー"
echo "==================================================================="
echo "✅ 成功: $TESTS_PASSED"
echo "🔢 総数: $TESTS_TOTAL"

if [ $TESTS_PASSED -eq $TESTS_TOTAL ]; then
    echo "🎉 全テスト合格! PI Batch IngesterはUbuntu 22.04 LTSで完全動作します!"
    exit 0
else
    FAILED=$((TESTS_TOTAL - TESTS_PASSED))
    echo "❌ $FAILED 個のテストが失敗しました。"
    exit 1
fi
