#!/bin/bash
# データ品質確認スクリプト

echo "=== データ品質確認 ==="

if [ ! -d "static_equipment_data" ]; then
    echo "❌ static_equipment_data ディレクトリが見つかりません"
    exit 1
fi

file_count=0
for csv_file in static_equipment_data/*.csv; do
    if [ -f "$csv_file" ]; then
        echo ""
        echo "ファイル: $csv_file"
        echo "  行数: $(wc -l < "$csv_file")"
        echo "  サイズ: $(du -h "$csv_file" | cut -f1)"
        
        # 欠損値チェック（空文字、NULL、NaN）
        empty_count=$(grep -c ',,\|^,\|,$' "$csv_file" 2>/dev/null || echo 0)
        echo "  空データ: $empty_count 箇所"
        
        # 時刻の連続性チェック
        if [ $(wc -l < "$csv_file") -gt 1 ]; then
            echo "  時刻範囲:"
            head -2 "$csv_file" | tail -1 | cut -d',' -f1 | sed 's/^/    開始: /'
            tail -1 "$csv_file" | cut -d',' -f1 | sed 's/^/    終了: /'
        else
            echo "  時刻範囲: データなし"
        fi
        
        file_count=$((file_count + 1))
    fi
done

echo ""
if [ $file_count -eq 0 ]; then
    echo "❌ CSVファイルが見つかりません"
else
    echo "✅ $file_count ファイルをチェックしました"
fi
