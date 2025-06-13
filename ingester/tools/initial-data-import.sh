#!/bin/bash
# 複数設備の初期データ取り込みスクリプト

set -e

PI_HOST="${1:-10.255.234.21}"
PI_PORT="${2:-3011}"
START_DATE="${3:-$(date -d '30 days ago' '+%Y-%m-%d')}"
END_DATE="${4:-$(date '+%Y-%m-%d')}"

echo "=== 複数設備の初期データ取り込み ==="
echo "PI Host: $PI_HOST"
echo "PI Port: $PI_PORT"
echo "期間: $START_DATE から $END_DATE"
echo ""

if [ ! -d "configs/equipments" ]; then
    echo "❌ configs/equipments ディレクトリが見つかりません"
    exit 1
fi

# 設備設定ファイルを検索
equipment_count=0
for config_file in configs/equipments/*/config.yaml; do
    if [ -f "$config_file" ]; then
        equipment_name=$(basename $(dirname $config_file))
        echo "処理中: $equipment_name"
        
        python3 "$(dirname "$0")/pi-batch-ingester.py" \
            --config "$config_file" \
            --host "$PI_HOST" \
            --port "$PI_PORT" \
            --start "$START_DATE" \
            --end "$END_DATE" \
            --output "static_equipment_data/${equipment_name}.csv" \
            --metadata-dir "tag_metadata"
        
        # PI-Serverへの負荷軽減のため間隔をあける
        sleep 5
        equipment_count=$((equipment_count + 1))
    fi
done

if [ $equipment_count -eq 0 ]; then
    echo "❌ 有効な設備設定ファイルが見つかりません"
    exit 1
fi

echo ""
echo "✅ $equipment_count 設備の初期データ取り込み完了"
echo "出力ファイル:"
ls -la static_equipment_data/
