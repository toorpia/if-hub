#!/bin/bash
# IF-Hub + PI-Ingester セットアップスクリプト

echo "=== IF-Hub + PI-Ingester デプロイメントスクリプト ==="
echo ""

# 既存データベースの確認と保護
if [ -d "./db" ] && [ -f "./db/if_hub.db" ]; then
    echo "⚠️  既存のデータベースが検出されました"
    echo "   パス: ./db/if_hub.db"
    echo ""
    
    # データベースファイルのサイズを表示
    db_size=$(du -h ./db/if_hub.db 2>/dev/null | cut -f1)
    echo "   データベースサイズ: ${db_size:-"不明"}"
    
    # 最終更新日時を表示
    db_mtime=$(stat -c %y ./db/if_hub.db 2>/dev/null || stat -f %Sm ./db/if_hub.db 2>/dev/null)
    echo "   最終更新: ${db_mtime:-"不明"}"
    echo ""
    
    echo "🔒 既存のデータベースを保護します。新しいアプリケーションは既存データを使用します。"
    
    # 安全のためバックアップを作成
    backup_name="db_backup_$(date +%Y%m%d_%H%M%S)"
    echo "💾 安全のため、バックアップを作成しています: ${backup_name}/"
    cp -r ./db "./${backup_name}"
    echo "✅ バックアップ完了: ./${backup_name}/"
    echo ""
else
    echo "🆕 新規環境を検出しました。初期データベースを設定します。"
    
    if [ -d "./init_db" ]; then
        echo "📋 初期データベーステンプレートからデータベースを作成..."
        cp -r ./init_db ./db
        echo "✅ データベースを初期化しました（./init_db/ → ./db/）"
    else
        echo "📁 空のデータベースディレクトリを作成..."
        mkdir -p ./db
        echo "✅ 空のデータベースディレクトリを作成しました"
        echo "ℹ️  IF-Hubが初回起動時にデータベースを自動作成します"
    fi
    echo ""
fi

# 必要なディレクトリの確保
echo "📁 必要なディレクトリを確保しています..."
for dir in "logs" "static_equipment_data" "tag_metadata"; do
    if [ ! -d "./$dir" ]; then
        mkdir -p "./$dir"
        echo "  ✅ $dir/ ディレクトリを作成"
    else
        echo "  ℹ️  $dir/ ディレクトリは既に存在"
    fi
done
echo ""

# コンテナイメージのインポート
echo "�� Dockerコンテナイメージをインポートしています..."
echo "   IF-Hubコンテナイメージ..."
if cat if-hub-container.tar | docker import - if-hub:imported; then
    echo "   ✅ IF-Hubイメージのインポート完了"
else
    echo "   ❌ IF-Hubイメージのインポートに失敗"
    exit 1
fi

echo "   PI-Ingesterコンテナイメージ..."
if cat pi-ingester-container.tar | docker import - pi-ingester:imported; then
    echo "   ✅ PI-Ingesterイメージのインポート完了"
else
    echo "   ❌ PI-Ingesterイメージのインポートに失敗"
    exit 1
fi
echo ""

# 既存コンテナの確認と停止
echo "🔍 既存のコンテナを確認しています..."
existing_containers=$(docker ps -q --filter name=if-hub)
if [ ! -z "$existing_containers" ]; then
    echo "   既存のコンテナが実行中です。停止しています..."
    docker stop $existing_containers
    echo "   ✅ 既存コンテナを停止しました"
fi
echo ""

# コンテナの起動
echo "🚀 コンテナを起動しています..."
if docker compose up -d; then
    echo "✅ コンテナの起動に成功しました"
else
    echo "❌ コンテナの起動に失敗しました"
    echo "   ログを確認してください: docker logs if-hub"
    exit 1
fi
echo ""

# 起動確認
echo "⏳ コンテナの起動を待機しています..."
sleep 5

echo "📊 デプロイメント結果:"
echo "============================================================"
echo "コンテナ状態:"
docker ps --filter name=if-hub --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

# IF-Hubの簡易ヘルスチェック
echo "🔍 IF-Hubの状態確認:"
if docker logs if-hub 2>&1 | grep -q "Server running on"; then
    echo "   ✅ IF-Hub サーバーが正常に起動しました"
else
    echo "   ⚠️  IF-Hub サーバーの起動に問題がある可能性があります"
    echo "   詳細確認: docker logs if-hub"
fi

echo ""
echo "✅ セットアップが完了しました！"
echo ""
echo "📋 確認コマンド:"
echo "   コンテナ状態: docker ps | grep if-hub"
echo "   IF-Hubログ:   docker logs if-hub"
echo "   PI-Ingesterログ: docker logs if-hub-pi-ingester"
echo ""
echo "🌐 アクセス方法:"
echo "   IF-Hub UI: http://localhost:3001"
echo "   (ポート番号は環境設定に応じて調整してください)"
