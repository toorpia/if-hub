#!/bin/bash
# IF-Hub オフライン環境移行パッケージ作成ツール（統合版）
# ネットワーク非接続顧客環境への移行用 - 自動判定により最適化

set -e

echo "========================================================"
echo "🚀 IF-Hub オフライン環境移行パッケージ作成ツール"
echo "   自動判定による最適パッケージ生成"
echo "   ネットワーク非接続顧客環境への移行用"
echo "========================================================"
echo ""

# プロジェクトルートに移動
cd "$(dirname "$0")/../.."

# コンテナエクスポートが必要かを判定
need_container_export=false
package_type="application"

echo "🔍 コンテナイメージの更新確認を行っています..."

# コンテナの状態確認
if ! docker ps --filter "name=if-hub" --filter "status=running" | grep -q "if-hub"; then
    echo "❌ if-hubコンテナが実行されていません"
    echo "   docker compose -f docker/docker-compose.yml up -d で起動してください"
    exit 1
fi

if ! docker ps --filter "name=if-hub-pi-ingester" --filter "status=running" | grep -q "if-hub-pi-ingester"; then
    echo "❌ if-hub-pi-ingesterコンテナが実行されていません"
    echo "   docker compose -f docker/docker-compose.yml up -d で起動してください"
    exit 1
fi

# コンテナの作成日時を取得
if_hub_created=$(docker inspect if-hub --format='{{.Created}}' 2>/dev/null || echo "")
pi_ingester_created=$(docker inspect if-hub-pi-ingester --format='{{.Created}}' 2>/dev/null || echo "")

if [ -z "$if_hub_created" ] || [ -z "$pi_ingester_created" ]; then
    echo "❌ コンテナ情報の取得に失敗しました"
    exit 1
fi

# コンテナ作成日時をUnixタイムスタンプに変換
if_hub_timestamp=$(date -d "$if_hub_created" +%s 2>/dev/null || echo 0)
pi_ingester_timestamp=$(date -d "$pi_ingester_created" +%s 2>/dev/null || echo 0)

echo "  📅 IF-Hub コンテナ作成日時: $if_hub_created"
echo "  📅 PI-Ingester コンテナ作成日時: $pi_ingester_created"

# 既存のコンテナイメージファイルの確認
if_hub_tar="offline-deployment/if-hub/if-hub-container.tar"
pi_ingester_tar="offline-deployment/if-hub/pi-ingester-container.tar"

if [ -f "$if_hub_tar" ] && [ -f "$pi_ingester_tar" ]; then
    # tarファイルのタイムスタンプを取得
    if_hub_tar_timestamp=$(stat -c %Y "$if_hub_tar" 2>/dev/null || echo 0)
    pi_ingester_tar_timestamp=$(stat -c %Y "$pi_ingester_tar" 2>/dev/null || echo 0)
    
    echo "  📦 既存コンテナイメージファイル:"
    echo "     IF-Hub: $(date -d @$if_hub_tar_timestamp 2>/dev/null || echo '不明')"
    echo "     PI-Ingester: $(date -d @$pi_ingester_tar_timestamp 2>/dev/null || echo '不明')"
    
    # コンテナの方が新しいかチェック
    if [ $if_hub_timestamp -gt $if_hub_tar_timestamp ] || [ $pi_ingester_timestamp -gt $pi_ingester_tar_timestamp ]; then
        need_container_export=true
        package_type="container"
        echo "  ✅ コンテナが更新されています - コンテナイメージをエクスポートします"
    else
        echo "  ℹ️  コンテナに変更がありません - 軽量パッケージを作成します"
    fi
else
    need_container_export=true
    package_type="container"
    echo "  ⚠️  既存のコンテナイメージファイルがありません - 初回エクスポートします"
fi

echo ""

# 1. プロジェクトルートから最新ファイルをコピー（上書き）
echo "📦 プロジェクトファイルをコピーしています..."
cp -r src/ offline-deployment/if-hub/
cp package.json offline-deployment/if-hub/
cp -r configs/ offline-deployment/if-hub/
cp -r gtags/ offline-deployment/if-hub/
echo "✅ プロジェクトファイルのコピー完了"

# 2. データディレクトリの保護とセットアップ
echo ""
echo "📁 データディレクトリを確認・保護しています..."

# init_db の保護（重要：初期データベーステンプレートとチェックサム）
if [ -d "offline-deployment/if-hub/init_db" ]; then
    echo "  ℹ️  init_db/ が既存です - 保護します（初期データベーステンプレート）"
else
    echo "  ⚠️  init_db/ がありません - テンプレートベースが必要です"
    exit 1
fi

# その他の必要ディレクトリ
mkdir -p offline-deployment/if-hub/static_equipment_data
mkdir -p offline-deployment/if-hub/tag_metadata
mkdir -p offline-deployment/if-hub/logs
mkdir -p offline-deployment/if-hub/db

echo "✅ データディレクトリの確認・保護完了"

# 3. ツールとスクリプトの収集
echo ""
echo "🔧 ツールとスクリプトを収集しています..."

# toolsディレクトリの確保
mkdir -p offline-deployment/if-hub/tools

# プロジェクト共通ツール（システム運用・監視）
echo "   プロジェクト共通ツールをコピー中..."
if [ -d "tools" ]; then
    cp tools/*.sh offline-deployment/if-hub/tools/ 2>/dev/null || true
    echo "   ✅ プロジェクト共通ツール配置完了"
else
    echo "   ⚠️  tools/ ディレクトリが見つかりません"
fi

# PI関連ツール
echo "   PI関連ツールをコピー中..."
if [ -d "ingester/tools" ]; then
    cp ingester/tools/*.py offline-deployment/if-hub/tools/ 2>/dev/null || true
    cp ingester/tools/*.sh offline-deployment/if-hub/tools/ 2>/dev/null || true
    cp ingester/tools/*.md offline-deployment/if-hub/tools/ 2>/dev/null || true
    echo "   ✅ PI関連ツール配置完了"
else
    echo "   ⚠️  ingester/tools/ ディレクトリが見つかりません"
fi

# Fetcherバイナリを生成
echo "   Fetcherバイナリを生成中..."
cd fetcher

# 依存関係インストール
echo "   npm依存関係をインストール中..."
if ! npm install; then
    echo "❌ npm installに失敗しました"
    exit 1
fi

# ビルド実行
echo "   バイナリをビルド中..."
if ! npm run build:binary; then
    echo "❌ Fetcherバイナリの生成に失敗しました"
    exit 1
fi

cd ..

# Fetcherバイナリをコピー
cp fetcher/dist/bin/if-hub-fetcher offline-deployment/if-hub/tools/
chmod +x offline-deployment/if-hub/tools/if-hub-fetcher
echo "   ✅ Fetcherバイナリ配置完了"

echo "✅ 全ツール・スクリプトの収集完了"

# 4. プラグインシステムの統合
echo ""
echo "🔌 プラグインシステムを確認・統合しています..."

# プラグインシステム存在確認
if [ -d "plugins" ] && [ -f "plugins/run_plugin.py" ]; then
    echo "   📦 プラグインシステムが検出されました"
    
    # プラグインディレクトリをコピー
    echo "   プラグインファイルをコピー中..."
    cp -r plugins/ offline-deployment/if-hub/
    
    # 仮想環境のチェック
    VENV_COUNT=0
    VENV_SIZE_TOTAL=0
    
    if [ -d "plugins/venvs" ]; then
        echo "   🔍 プラグイン仮想環境を確認中..."
        
        for venv_type in analyzers notifiers presenters; do
            if [ -d "plugins/venvs/$venv_type" ]; then
                for venv_dir in plugins/venvs/$venv_type/*/; do
                    if [ -d "$venv_dir" ] && [ -x "${venv_dir}bin/python" ]; then
                        venv_name=$(basename "$venv_dir")
                        venv_size=$(du -sm "$venv_dir" 2>/dev/null | cut -f1 || echo "0")
                        VENV_COUNT=$((VENV_COUNT + 1))
                        VENV_SIZE_TOTAL=$((VENV_SIZE_TOTAL + venv_size))
                        echo "     ✅ $venv_type/$venv_name (${venv_size}MB)"
                    fi
                done
            fi
        done
        
        if [ $VENV_COUNT -gt 0 ]; then
            echo "   📊 仮想環境統計: ${VENV_COUNT}個、合計${VENV_SIZE_TOTAL}MB"
            
            # 大容量の場合は警告
            if [ $VENV_SIZE_TOTAL -gt 300 ]; then
                echo "   ⚠️  仮想環境が大容量です (${VENV_SIZE_TOTAL}MB)"
                echo "      パッケージサイズが大幅に増加する可能性があります"
            fi
        else
            echo "   ℹ️  構築済み仮想環境が見つかりません"
            echo "      顧客環境でプラグイン使用前に仮想環境構築が必要です"
        fi
    fi
    
    # プラグインリスト生成
    if [ -f "offline-deployment/if-hub/plugins/run_plugin.py" ]; then
        echo "   📋 利用可能プラグイン一覧を生成中..."
        cd offline-deployment/if-hub
        
        # プラグインリスト生成
        if python3 plugins/run_plugin.py list > plugins_list.json 2>/dev/null; then
            echo "     ✅ plugins_list.json を生成しました"
        else
            echo "     ⚠️  プラグインリスト生成に失敗（非致命的）"
        fi
        
        cd - > /dev/null
    fi
    
    # プラグイン用セットアップスクリプト情報追加
    if [ -d "offline-deployment/if-hub/plugins/venv_management" ]; then
        echo "   🔧 プラグイン管理スクリプトを確認..."
        echo "     ✅ 仮想環境構築: plugins/venv_management/setup_venv_analyzer.sh"
        echo "     ✅ パッケージ作成: plugins/venv_management/package_venv.sh"
    fi
    
    echo "✅ プラグインシステム統合完了"
    
    # パッケージ内容にプラグイン情報を追加
    if [ $VENV_COUNT -gt 0 ]; then
        package_content="$package_content
   - プラグインシステム (${VENV_COUNT}個の仮想環境)"
    else
        package_content="$package_content
   - プラグインシステム (仮想環境要構築)"
    fi
    
else
    echo "   ℹ️  プラグインシステムが見つかりません（スキップ）"
fi

# 5. パッケージタイプ別の処理
if [ "$need_container_export" = true ]; then
    # コンテナイメージをエクスポート
    echo ""
    echo "📤 コンテナイメージをエクスポートしています..."
    
    # IF-Hubコンテナをエクスポート
    echo "   IF-Hubコンテナをエクスポート中..."
    if docker export if-hub > offline-deployment/if-hub/if-hub-container.tar; then
        echo "   ✅ IF-Hubコンテナエクスポート完了"
    else
        echo "   ❌ IF-Hubコンテナエクスポートに失敗"
        exit 1
    fi
    
    # PI-Ingesterコンテナをエクスポート
    echo "   PI-Ingesterコンテナをエクスポート中..."
    if docker export if-hub-pi-ingester > offline-deployment/if-hub/pi-ingester-container.tar; then
        echo "   ✅ PI-Ingesterコンテナエクスポート完了"
    else
        echo "   ❌ PI-Ingesterコンテナエクスポートに失敗"
        exit 1
    fi
else
    # 軽量版setup.shを作成（コンテナインポート処理を除去）
    echo ""
    echo "🔧 軽量版setup.shを作成しています..."
    cat > offline-deployment/if-hub/setup-update.sh << 'SETUP_UPDATE_EOF'
#!/bin/bash
# IF-Hub アプリケーション更新スクリプト（軽量版）
# コンテナイメージの更新は行わず、アプリケーションファイルのみを更新

echo "=== IF-Hub アプリケーション更新スクリプト ==="
echo ""

# 既存データベースの確認と保護
if [ -d "./db" ] && [ -f "./db/if_hub.db" ]; then
    echo "🔒 既存のデータベースを保護します。"
    
    # 安全のためバックアップを作成
    backup_name="db_backup_$(date +%Y%m%d_%H%M%S)"
    echo "💾 安全のため、バックアップを作成しています: ${backup_name}/"
    cp -r ./db "./${backup_name}"
    echo "✅ バックアップ完了: ./${backup_name}/"
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

# 既存コンテナの再起動
echo "🔄 コンテナを再起動しています..."
existing_containers=$(docker ps -q --filter name=if-hub)
if [ ! -z "$existing_containers" ]; then
    echo "   既存のコンテナを停止しています..."
    docker stop $existing_containers
    echo "   ✅ 既存コンテナを停止しました"
fi

if docker compose up -d; then
    echo "✅ コンテナの再起動に成功しました"
else
    echo "❌ コンテナの再起動に失敗しました"
    echo "   ログを確認してください: docker logs if-hub"
    exit 1
fi
echo ""

# 起動確認
echo "⏳ コンテナの起動を待機しています..."
sleep 5

echo "📊 アップデート結果:"
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
echo "✅ アプリケーション更新が完了しました！"
echo ""
echo "📋 確認コマンド:"
echo "   コンテナ状態: docker ps | grep if-hub"
echo "   IF-Hubログ:   docker logs if-hub"
echo "   PI-Ingesterログ: docker logs if-hub-pi-ingester"
echo ""
echo "🌐 アクセス方法:"
echo "   IF-Hub UI: http://localhost:3001"
echo "   (ポート番号は環境設定に応じて調整してください)"
SETUP_UPDATE_EOF

    chmod +x offline-deployment/if-hub/setup-update.sh
    echo "✅ 軽量版setup.sh作成完了"
fi

# 5. 最終パッケージを作成
echo ""
echo "📦 最終パッケージを作成しています..."
cd offline-deployment

if [ "$package_type" = "container" ]; then
    # コンテナイメージ含む（重いパッケージ）
    tar -czf if-hub-container.tgz if-hub/
    package_file="if-hub-container.tgz"
    package_content="- IF-Hub アプリケーション
   - PI-Ingester
   - Fetcherバイナリ
   - コンテナイメージ
   - 運用スクリプト一式"
    usage_script="./setup.sh"
else
    # コンテナイメージ除外（軽いパッケージ）
    tar -czf if-hub-application.tgz --exclude="*.tar" if-hub/
    package_file="if-hub-application.tgz"
    package_content="- IF-Hub アプリケーション（最新版）
   - PI-Ingester設定
   - Fetcherバイナリ（最新版）
   - 運用スクリプト一式
   ※ コンテナイメージは含まれません（軽量化）"
    usage_script="./setup-update.sh"
fi

cd ..

# パッケージサイズを表示
package_size=$(du -h offline-deployment/$package_file | cut -f1)
echo "✅ パッケージ作成完了: offline-deployment/$package_file ($package_size)"

echo ""
echo "🎉 パッケージの作成が完了しました！"
echo ""
echo "📋 作成されたファイル:"
echo "   offline-deployment/$package_file"
echo ""
echo "📊 パッケージ内容:"
echo "   $package_content"
echo ""
echo "🚚 顧客環境での使用方法:"
echo "   1. $package_file を顧客環境に転送"
echo "   2. tar -xzf $package_file"
echo "   3. cd if-hub"
if [ "$package_type" = "container" ]; then
echo "   4. ./configure-pi.sh (PI設定)"
echo "   5. $usage_script (システム起動)"
else
echo "   4. $usage_script (アプリケーション更新)"
echo ""
echo "⚠️  注意事項:"
echo "   - このパッケージは既存コンテナが起動している環境でのみ使用可能です"
echo "   - 初回セットアップには重いパッケージ（コンテナ含む）が必要です"
fi
echo "========================================================"
