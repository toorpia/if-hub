#!/bin/bash

# IF-Hub + PI-Ingester 初期設定スクリプト
# 顧客環境での設定ファイル作成を支援します

set -e

echo "============================================================"
echo "🏭 IF-Hub + PI-Ingester 初期設定スクリプト"
echo "============================================================"

# 設定ファイルのコピー
echo "📄 設定ファイルを作成しています..."

# 共通設定ファイルのコピー
if [ ! -f "configs/common.yaml" ]; then
    if [ -f "configs/common.yaml.example" ]; then
        cp configs/common.yaml.example configs/common.yaml
        echo "✅ configs/common.yaml を作成しました"
    else
        echo "❌ configs/common.yaml.example が見つかりません"
        exit 1
    fi
else
    echo "ℹ️  configs/common.yaml は既に存在します"
fi

# PI-API-Serverの設定
echo ""
echo "🔧 PI-API-Server接続設定"
echo "現在の設定を確認します..."

# 現在の設定値を表示
current_host=$(grep "host:" configs/common.yaml | awk '{print $2}' | tr -d '"')
current_port=$(grep "port:" configs/common.yaml | awk '{print $2}')

echo "現在のPI-API-Server設定:"
echo "  ホスト: $current_host"
echo "  ポート: $current_port"

echo ""
read -p "PI-API-Serverのホストを変更しますか？ (y/N): " change_host

if [[ $change_host =~ ^[Yy]$ ]]; then
    read -p "新しいホスト（IPアドレス）を入力してください: " new_host
    sed -i "s/host: \".*\"/host: \"$new_host\"/" configs/common.yaml
    echo "✅ ホストを $new_host に変更しました"
fi

read -p "PI-API-Serverのポートを変更しますか？ (y/N): " change_port

if [[ $change_port =~ ^[Yy]$ ]]; then
    read -p "新しいポート番号を入力してください: " new_port
    sed -i "s/port: .*/port: $new_port/" configs/common.yaml
    echo "✅ ポートを $new_port に変更しました"
fi

# 設備設定の作成
echo ""
echo "🏭 設備設定"
read -p "新しい設備設定を作成しますか？ (y/N): " create_equipment

if [[ $create_equipment =~ ^[Yy]$ ]]; then
    read -p "設備名を入力してください（例: Plant01）: " equipment_name
    
    # 設備ディレクトリの作成
    equipment_dir="configs/equipments/$equipment_name"
    mkdir -p "$equipment_dir"
    
    # 設定ファイルのコピー（固定ファイル名: config.yaml）
    config_file="$equipment_dir/config.yaml"
    cp configs/equipments/example/config.yaml.example "$config_file"
    
    echo "✅ 設備設定を作成しました: $config_file"
    echo "ℹ️  設定ファイルを編集してPI Tagを設定してください:"
    echo "   vi $config_file"
    echo "ℹ️  出力ファイルは自動的に $equipment_name.csv として保存されます"
fi

# 必要なディレクトリの作成
echo ""
echo "📁 必要なディレクトリを作成しています..."

directories=("logs" "static_equipment_data" "db")
for dir in "${directories[@]}"; do
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        chmod 755 "$dir"
        echo "✅ $dir ディレクトリを作成しました"
    else
        echo "ℹ️  $dir ディレクトリは既に存在します"
    fi
done

# 権限設定
echo ""
echo "🔒 権限を設定しています..."
chmod 644 configs/common.yaml
find configs/equipments -name "*.yaml" -exec chmod 644 {} \;
echo "✅ 設定ファイルの権限を設定しました"

# 設定の確認
echo ""
echo "🔍 設定確認"
echo "============================================================"
echo "共通設定ファイル: configs/common.yaml"
echo "設備設定ディレクトリ: configs/equipments/"
ls -la configs/equipments/

echo ""
echo "✅ 初期設定が完了しました！"
echo ""
echo "📋 次の手順:"
echo "1. 設備設定ファイルでPI Tagを設定"
echo "2. ./setup.sh でサービス起動"
echo "3. docker logs if-hub-pi-ingester でログ確認"
echo ""
echo "🔧 設定ファイルの編集:"
echo "   共通設定: vi configs/common.yaml"
echo "   設備設定: vi configs/equipments/{設備名}/config.yaml"
echo ""
echo "📊 動作確認:"
echo "   docker ps | grep if-hub"
echo "   ls -la static_equipment_data/"
echo "============================================================"
