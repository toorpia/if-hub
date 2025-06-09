# IF-Hub プロジェクト移行手順書

## 概要

本手順書は、現在稼働中のIF-Hubプロジェクトを、インターネット接続のない別サーバーに移行するための手順を示します。`docker export`コマンドを使用してコンテナをエクスポートし、移行先で`docker import`でイメージを復元します。

## システム構成

- **IF-Hub**: メインのデータ管理・可視化システム
- **PI-Ingester**: PI SystemからのプロセスデータをIF-Hubに取り込むサービス
  - **CSV自動変換**: PI-APIからの生データをIF-HUB形式に自動変換
  - **メタデータ抽出**: タグの表示名と単位を自動抽出してtranslations_ja.csvに保存
  - **重複チェック**: 既存メタデータとの重複を避けて効率的に更新

## 前提条件

- 移行元サーバー：現在IF-Hubが稼働中
- 移行先サーバー：Dockerがインストール済み、インターネット接続なし

## 移行手順

### 1. 移行元サーバーでの作業

#### 1.1 コンテナ状態の確認

```bash
# コンテナの状態を確認（実行中であることを確認）
docker ps | grep if-hub
```

#### 1.2 移行用docker-compose.ymlファイルの作成

```bash
# 移行先用のdocker-compose.ymlを作成
cat > docker-compose.import.yml << 'EOF'
services:
  if-hub:
    image: if-hub:imported  # docker importで作成したイメージ名
    container_name: if-hub
    user: "0:0"             # root権限で実行（権限問題回避）
    working_dir: /app       # docker importで失われた作業ディレクトリを明示的に指定
    command: npm start      # docker importではエントリポイントが失われるため必須
    ports:
      - "${EXTERNAL_PORT:-3001}:3000"  # 環境変数EXTERNAL_PORTがない場合は3001を使用
    volumes:
      - ./src:/app/src
      - ./static_equipment_data:/app/static_equipment_data
      - ./tag_metadata:/app/tag_metadata
      - ./gtags:/app/gtags        # gtag定義とカスタム実装
      - ./logs:/app/logs
      - ./db:/app/db  # データベースファイル用のボリューム
      - ./package.json:/app/package.json
    environment:
      - NODE_ENV=development
      - PORT=3000
      - EXTERNAL_PORT=${EXTERNAL_PORT:-3001}  # 環境変数をコンテナ内でも使用可能に
      - DB_PATH=/app/db/if_hub.db  # データベースファイルのパス
      - TZ=${TZ:-Asia/Tokyo}  # ホストから取得したタイムゾーン、未設定の場合は日本時間
    restart: unless-stopped

  pi-ingester:
    image: pi-ingester:imported  # docker importで作成したイメージ名
    container_name: if-hub-pi-ingester
    user: "0:0"                  # root権限で実行（権限問題回避）
    working_dir: /app            # docker importで失われた作業ディレクトリを明示的に指定
    command: node dist/index.js  # docker importではエントリポイントが失われるため必須
    volumes:
      - ./configs:/app/configs:ro           # 設定ファイル（読み取り専用）
      - ./logs:/app/logs                    # ログファイル
      - ./static_equipment_data:/app/static_equipment_data  # CSV出力先
      - ./tag_metadata:/app/tag_metadata    # タグメタデータ（translations ファイル）
    environment:
      - TZ=${TZ:-Asia/Tokyo}
      - NODE_ENV=production
    restart: unless-stopped
    depends_on:
      - if-hub
EOF
```

#### 1.3 コンテナのエクスポート

```bash
# IF-Hubコンテナをtarファイルにエクスポート
docker export if-hub > if-hub-container.tar

# PI-Ingesterコンテナをtarファイルにエクスポート
docker export if-hub-pi-ingester > pi-ingester-container.tar

# ファイルサイズの確認
ls -lh if-hub-container.tar pi-ingester-container.tar
```

#### 1.4 必要なファイルの準備

```bash
# 移行用ディレクトリの作成
mkdir -p if-hub-export

# 設定ファイルの移動
mv docker-compose.import.yml if-hub-export/docker-compose.yml
mv if-hub-container.tar if-hub-export/
mv pi-ingester-container.tar if-hub-export/

# データディレクトリのコピー
cp -r src if-hub-export/
cp -r static_equipment_data if-hub-export/
cp -r tag_metadata if-hub-export/
cp -r gtags if-hub-export/
cp -r logs if-hub-export/
cp -r db if-hub-export/init_db  # 初期DB用テンプレート（顧客の既存dbを保護）
cp -r configs if-hub-export/  # PI-Ingester設定ファイル
cp package.json if-hub-export/

# バッチツールと運用スクリプトのコピー
cp -r ingester/tools if-hub-export/  # PI-Ingesterバッチツール
chmod +x if-hub-export/scripts/*.sh

# 移行用スクリプトの作成
cat > if-hub-export/setup.sh << 'EOF'
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
echo "🐳 Dockerコンテナイメージをインポートしています..."
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
EOF

chmod +x if-hub-export/setup.sh

# 顧客先用PI-Ingester設定スクリプトのコピー
cp ingester/configure-pi.sh if-hub-export/configure-pi.sh
chmod +x if-hub-export/configure-pi.sh

# 全ファイルを圧縮
tar -czf if-hub-export.tar.gz if-hub-export/
```

### 2. 移行先サーバーでの作業

#### 2.1 ファイルの転送と展開

```bash
# USBドライブなどを使って if-hub-export.tar.gz を移行先サーバーに転送

# 移行先サーバーでファイルを展開
mkdir -p /path/to/if-hub
tar -xzf if-hub-export.tar.gz -C /path/to/
cd /path/to/if-hub-export
```

#### 2.2 PI-Ingester設定

```bash
# PI-Ingesterの設定を実行（対話式）
./configure-pi.sh
```

この設定スクリプトで以下を行います：
- PI-API-Serverのホスト・ポート設定
- 設備設定ファイルの作成
- PI-Tagリストの設定

#### 2.3 Dockerコンテナのインポートと起動

```bash
# セットアップスクリプトを実行
./setup.sh
```

#### 2.4 動作確認

```bash
# コンテナの起動状態を確認
docker ps | grep if-hub

# ログの確認
docker logs if-hub

# ブラウザで確認（ポート番号は環境に合わせて調整）
# http://[サーバーのIP]:3001
```

## 運用を考慮したサービス起動手順

### 初期データ取り込みの重要性

現実的な運用では、サービス起動前にまとまった過去データが存在することが多く、これらを初期データとして取り込んだ上で定期データ取り込みに移行することが重要です。

本システムでは以下の2段階アプローチを推奨します：

1. **初期データ一括取り込み**：バッチツールで過去データを取り込み
2. **定期データ取り込み**：PI-Ingesterサービスで継続的なデータ収集

### 推奨運用フロー

```
┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│ 1. 初期データ一括   │    │ 2. サービス起動      │    │ 3. 継続運用         │
│    取り込み         │──→ │   (PI-Ingester)     │──→ │   (自動Gap補充)     │
│ (pi-batch-ingester) │    │                      │    │                     │
└─────────────────────┘    └──────────────────────┘    └─────────────────────┘
```

### 初期データ取り込み手順

#### ステップ1: 取り込み期間の決定

初期データの取り込み期間を決定します：

```bash
# 例1: 過去30日分を取り込む場合
START_DATE=$(date -d '30 days ago' '+%Y-%m-%d')
END_DATE=$(date '+%Y-%m-%d')

# 例2: 特定期間を指定する場合
START_DATE="2025-01-01"
END_DATE="2025-01-31"

echo "初期データ期間: $START_DATE から $END_DATE"
```

#### ステップ2: バッチツールでの一括取り込み

PI-Ingesterに含まれるバッチツール `pi-batch-ingester.py` を使用します：

```bash
# 基本的な使用例
cd ingester
python tools/pi-batch-ingester.py \
  --config ../configs/equipments/7th-untan/config.yaml \
  --host 10.255.234.21 \
  --port 3011 \
  --start "2025-01-01" \
  --end "2025-01-31" \
  --output ../static_equipment_data/7th-untan.csv

# 過去30日分の自動取り込み
python tools/pi-batch-ingester.py \
  --config ../configs/equipments/7th-untan/config.yaml \
  --host 10.255.234.21 \
  --port 3011 \
  --start "$(date -d '30 days ago' '+%Y-%m-%d')" \
  --end "$(date '+%Y-%m-%d')" \
  --output ../static_equipment_data/7th-untan.csv
```

#### ステップ3: 初期データの確認

取り込みが完了したら、データを確認します：

```bash
# CSVファイルの確認
ls -la static_equipment_data/
head -5 static_equipment_data/7th-untan.csv
wc -l static_equipment_data/7th-untan.csv

# データ期間の確認（最初と最後の行）
head -2 static_equipment_data/7th-untan.csv
tail -1 static_equipment_data/7th-untan.csv
```

#### ステップ4: サービス起動と定期取り込み

初期データ取り込み完了後、通常のサービスを起動：

```bash
# PI-Ingesterサービス起動
./setup.sh

# サービス状態確認
docker ps | grep if-hub
docker logs if-hub-pi-ingester
```

### 複数設備での初期データ取り込み

複数の設備設定がある場合の一括処理例：

```bash
#!/bin/bash
# 複数設備の初期データ取り込みスクリプト例

PI_HOST="10.255.234.21"
PI_PORT="3011"
START_DATE="2025-01-01"
END_DATE="2025-01-31"

for config_file in configs/equipments/*/config.yaml; do
  equipment_name=$(basename $(dirname $config_file))
  echo "処理中: $equipment_name"
  
  python ingester/tools/pi-batch-ingester.py \
    --config "$config_file" \
    --host "$PI_HOST" \
    --port "$PI_PORT" \
    --start "$START_DATE" \
    --end "$END_DATE" \
    --output "static_equipment_data/${equipment_name}.csv"
done

echo "全設備の初期データ取り込み完了"
```

## 顧客先作業フロー要約

### 前提条件
- `if-hub-export.tar.gz` を顧客先に転送済み
- Dockerがインストール済み

### 作業手順（顧客先）

```bash
# ステップ1: 環境準備
tar -xzf if-hub-export.tar.gz
cd if-hub-export

# ステップ2: PI-Ingester設定
./configure-pi.sh
# → PI-API-Serverのホスト・ポート設定
# → 設備設定の作成とPI-Tag設定

# ステップ3: 初期データ取り込み（推奨）
./scripts/initial-data-import.sh [PI_HOST] [PI_PORT] [START_DATE] [END_DATE]
# 例: ./scripts/initial-data-import.sh 10.255.234.21 3011 2025-01-01 2025-01-31

# ステップ4: データ品質確認
./scripts/data-quality-check.sh

# ステップ5: システム起動
./setup.sh

# ステップ6: 動作確認
./scripts/check-system.sh
```

**各ステップの詳細**：

- **ステップ3**: デフォルトで過去30日分のデータを全設備から取り込みます
- **ステップ4**: 取り込んだデータの行数、サイズ、時刻範囲を確認します
- **ステップ5**: Dockerコンテナのインポート・起動を自動実行します
- **ステップ6**: コンテナ状態、最新データ、PI-Ingester状態を確認します

### if-hub-export/ の構成

```
if-hub-export/
├── setup.sh                     # システム起動スクリプト
├── configure-pi.sh              # PI-Ingester設定スクリプト
├── docker-compose.yml           # 統合サービス定義
├── if-hub-container.tar         # IF-Hubコンテナイメージ
├── pi-ingester-container.tar    # PI-Ingesterコンテナイメージ
├── tools/                       # バッチツール
│   ├── pi-batch-ingester.py     # PI Systemバッチデータ取得ツール
│   ├── README.md                # バッチツール詳細使用方法
│   ├── equipment.yaml           # サンプル設定ファイル
│   └── requirements.txt         # 依存関係情報
├── scripts/                     # 運用スクリプト集
│   ├── initial-data-import.sh   # 複数設備一括初期データ取り込み
│   ├── bulk-data-import.sh      # 大量データ分割処理
│   ├── data-quality-check.sh    # データ品質確認
│   ├── monitor-system.sh        # システム監視
│   ├── check-system.sh          # 動作確認
│   └── setup-logrotate.sh       # ログローテーション設定
├── configs/                     # PI-Ingester設定ファイル
│   ├── common.yaml.example      # 共通設定テンプレート
│   └── equipments/example/      # 設備設定テンプレート
├── src/                         # IF-Hubソースコード
├── static_equipment_data/       # CSV出力先
├── tag_metadata/                # タグメタデータ
├── gtags/                       # gtag定義
├── logs/                        # ログディレクトリ
├── init_db/                     # 初期データベーステンプレート（新規環境用）
└── package.json                 # IF-Hub依存関係
```

**重要**: `init_db/`ディレクトリは新規環境専用のテンプレートです。既存の顧客環境に`db/`ディレクトリが存在する場合、setup.shスクリプトは既存データを保護し、`init_db/`は使用しません。

## PI-Ingester設定ガイド

### 設定ファイルの構成

PI-Ingesterは以下の設定ファイルを使用します：

```
configs/
├── common.yaml                    # 共通設定（PI API接続情報等）
└── equipments/                    # 設備別設定
    └── {設備名}/
        └── {設定名}.yaml         # 設備固有の設定
```

### 共通設定ファイル（configs/common.yaml）

```yaml
pi_api:
  host: "10.255.234.21"           # 顧客のPI-API-Serverのホスト
  port: 3011                      # PI-API-Serverのポート
  timeout: 30000                  # タイムアウト（ミリ秒）
  max_retries: 3                  # 最大リトライ回数
  retry_interval: 5000            # リトライ間隔（ミリ秒）

logging:
  level: "info"                   # ログレベル（debug, info, warn, error）
  file: "/app/logs/ingester.log"  # ログファイルパス

data_acquisition:
  fetch_margin_seconds: 30        # データ遅延考慮秒数
  max_history_days: 30            # 初回取得時の最大遡り日数
```

### 設備設定ファイル例（configs/equipments/{設備名}/config.yaml）

```yaml
basemap:
  addplot:
    interval: "10m"               # データ取得間隔（1m, 5m, 10m, 1h等）
    lookback_period: "10D"        # 参照期間（1D, 7D, 30D等）

  source_tags:                    # 取得対象のPIタグ
    - "POW:711034.PV"
    - "POW:7T105B1.PV"
    - "TEMP:T101.PV"

pi_integration:
  enabled: true                   # PI連携有効化
  # output_filename は自動生成: {設備名}.csv
```

### 顧客環境での設定変更手順

#### 1. PI API接続設定の変更

```bash
# 顧客環境のPI-API-Server情報に合わせて編集
vi configs/common.yaml

# 例：IPアドレスとポートの変更
pi_api:
  host: "192.168.1.100"  # 顧客のPI-API-ServerのIP
  port: 3011
```

#### 2. 設備・タグ設定の追加

```bash
# 新しい設備設定を追加
mkdir -p configs/equipments/Plant01
vi configs/equipments/Plant01/realtime.yaml

# 設備固有のタグを設定
source_tags:
  - "PLANT01:TEMP.PV"
  - "PLANT01:PRESS.PV"
  - "PLANT01:FLOW.PV"
```

#### 3. データ取得間隔の調整

```bash
# 設備設定ファイルを編集
vi configs/equipments/{設備名}/{設定名}.yaml

# 取得間隔を変更（例：5分間隔に変更）
basemap:
  addplot:
    interval: "5m"
```

### PI-Ingester動作確認

#### 起動後の確認手順

```bash
# PI-Ingesterコンテナの状態確認
docker ps | grep pi-ingester

# ログの確認
docker logs if-hub-pi-ingester

# 出力ファイルの確認
ls -la static_equipment_data/

# メタデータファイルの確認
ls -la tag_metadata/
cat tag_metadata/translations_ja.csv

# 状態ファイルの確認
cat logs/ingester-state.json

# メタデータ抽出ログの確認
docker logs if-hub-pi-ingester | grep "metadata"
```

#### 正常動作の確認ポイント

1. **PI API接続成功**: ログに「PI-API fetch successful」が表示される
2. **CSVファイル出力**: `static_equipment_data/`にCSVファイルが作成される
3. **メタデータ抽出**: `tag_metadata/translations_ja.csv`にタグ情報が保存される
4. **CSV自動変換**: IF-HUB形式（ヘッダー行のみ、メタデータ行なし）で出力される
5. **状態管理**: `logs/ingester-state.json`が更新される
6. **スケジュール実行**: 設定間隔でデータ取得が実行される

## トラブルシューティング

### コンテナが起動しない場合

```bash
# 詳細なエラーログを確認
docker logs if-hub
docker logs if-hub-pi-ingester

# 手動でコンテナを起動して問題を特定
docker run --rm -it if-hub:imported /bin/sh
docker run --rm -it pi-ingester:imported /bin/sh
```

### ポートの競合がある場合

```bash
# docker-compose.ymlを編集し、ポート番号を変更
# "${EXTERNAL_PORT:-3001}:3000" の部分を変更
```

### ボリュームマウントに問題がある場合

```bash
# パーミッションを確認し修正
ls -la ./db ./logs
chmod -R 755 ./db ./logs
```

### PI-Ingester固有の問題

#### PI API接続エラー

```bash
# エラー例: "No response from server: ECONNREFUSED"
docker logs if-hub-pi-ingester

# 解決手順:
# 1. PI-API-Serverのホスト・ポート設定を確認
vi configs/common.yaml

# 2. ネットワーク接続テスト
ping [PI-API-ServerのIP]
telnet [PI-API-ServerのIP] 3011

# 3. PI-API-Serverの起動状態確認
# （顧客側で確認してもらう）
```

#### 設定ファイル読み込みエラー

```bash
# エラー例: "Failed to load equipment config"
# 設定ファイルの存在確認
ls -la configs/equipments/*/

# 設定ファイルの構文チェック
python3 -c "import yaml; yaml.safe_load(open('configs/common.yaml'))"

# 権限の確認・修正
chmod 644 configs/common.yaml
chmod -R 644 configs/equipments/
```

#### CSVファイル出力エラー

```bash
# エラー例: "Output directory is not writable"
# ディレクトリの権限確認
ls -la static_equipment_data/

# 権限修正
chmod 755 static_equipment_data/
chown -R 1001:1001 static_equipment_data/
```

#### メモリ不足エラー

```bash
# コンテナリソース使用量確認
docker stats if-hub-pi-ingester

# メモリ制限の調整
vi docker-compose.yml
# 以下を追加:
# services:
#   pi-ingester:
#     deploy:
#       resources:
#         limits:
#           memory: 512M
```

### 初期データ取り込みのベストプラクティス

#### 1. 大量データの分割処理

長期間のデータを取り込む場合は、専用スクリプトを使用して分割処理します：

```bash
# 大量データの分割取り込み（例：3ヶ月分）
./scripts/bulk-data-import.sh configs/equipments/7th-untan/config.yaml 10.255.234.21 3011 2025-01-01 3

# 使用方法の確認
./scripts/bulk-data-import.sh
```

#### 2. データ品質確認

取り込んだデータの品質確認は専用スクリプトで実行：

```bash
# 全CSVファイルの品質確認
./scripts/data-quality-check.sh
```

#### 3. 重複データについて

IF-Hub本体では重複datetimeは自動的に排除されるため、多少の重複は問題ありません。

### 運用監視とメンテナンス

#### 1. システム監視

```bash
# システム監視の実行
./scripts/monitor-system.sh

# 定期実行設定（cronに追加する場合）
echo "0 * * * * cd /path/to/if-hub-export && ./scripts/monitor-system.sh" | crontab -
```

#### 2. ログローテーション設定

```bash
# ログローテーション設定の作成
./scripts/setup-logrotate.sh

# システムlogrotateへの追加
sudo cp if-hub-logrotate /etc/logrotate.d/
```

### その他の注意点

1. **環境変数設定**: 移行先サーバーの環境変数を必要に応じて設定してください：
   ```bash
   # 例: ポートを変更する場合
   export EXTERNAL_PORT=3002
   ```

2. **データ整合性**: データの整合性を確保するため、移行元のコンテナを停止してからエクスポートすることも検討してください：
   ```bash
   docker stop if-hub if-hub-pi-ingester
   docker export if-hub > if-hub-container.tar
   docker export if-hub-pi-ingester > pi-ingester-container.tar
   docker start if-hub if-hub-pi-ingester
   ```

3. **バックアップ計画**: 定期的なバックアップ計画も検討してください。特に以下のディレクトリは重要です：
   - `db/`: IF-Hubのデータベース
   - `configs/`: PI-Ingesterの設定ファイル
   - `static_equipment_data/`: 取得したプロセスデータ
   - `logs/`: 実行ログと状態ファイル

4. **容量管理**: データの蓄積によるディスク容量の管理：
   ```bash
   # 古いCSVファイルのアーカイブ
   find static_equipment_data/ -name "*.csv" -mtime +90 -exec gzip {} \;
   
   # 古いログファイルの削除
   find logs/ -name "*.log" -mtime +30 -delete
   ```

5. **監視とメンテナンス**: 
   ```bash
   # 定期的な動作確認スクリプト例
   cat > check_system.sh << 'EOF'
   #!/bin/bash
   echo "=== IF-Hub + PI-Ingester 動作確認 ==="
   echo "コンテナ状態:"
   docker ps | grep if-hub
   echo ""
   echo "最新のデータファイル:"
   ls -lt static_equipment_data/ | head -5
   echo ""
   echo "PI-Ingester状態:"
   cat logs/ingester-state.json | grep -E "(lastSuccessTime|errorCount)"
   echo ""
   echo "ディスク使用量:"
   df -h .
   EOF
   chmod +x check_system.sh
   ```
