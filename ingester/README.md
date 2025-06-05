# IF-HUB PI Data Ingester

PI SystemからのプロセスデータをIF-HUBの静的設備データとして取り込むためのデータ取得モジュールです。

## 概要

PI-IngesterはPI System（OSIsoft PI）からプロセスデータを定期的に取得し、IF-HUBで利用可能なCSV形式で出力するサービスです。設備ごとの設定ファイルに基づいて、指定されたタグデータを自動的に収集・更新します。

## 特徴

- **自動スケジュール実行**: 設備ごとに設定された間隔でデータを自動取得
- **増分データ取得**: 前回取得時刻から継続してデータを取得（重複回避）
- **設定ファイルベース**: YAML形式の設定ファイルによる柔軟な設定
- **堅牢性**: リトライ機能、エラーハンドリング、状態管理
- **Docker対応**: コンテナ化による簡単なデプロイメント

## アーキテクチャ

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   PI System     │    │   PI-Ingester    │    │    IF-HUB       │
│                 │────┤                  │────┤                 │
│ Process Data    │    │ - Scheduler      │    │ Static Data     │
│ (Time Series)   │    │ - State Manager  │    │ (CSV Files)     │
└─────────────────┘    │ - CSV Output     │    └─────────────────┘
                       └──────────────────┘
```

### コンポーネント

- **ConfigLoader**: 設定ファイルの読み込み・管理
- **PIApiClient**: PI System APIとの通信
- **StateManager**: 取得状態の永続化・管理
- **CSVOutputService**: CSV形式でのデータ出力
- **DataIngestionScheduler**: スケジュール実行・調整

## インストール

### 前提条件

- Node.js 20以上
- PI API Server（PI Systemへのアクセス）
- Docker（コンテナ実行時）

### 依存関係のインストール

```bash
cd ingester
npm install
```

### ビルド

```bash
npm run build
```

## 設定

### 共通設定 (`configs/common.yaml`)

```yaml
pi_api:
  host: "127.0.0.1"     # PI-API-Serverのホスト
  port: 3011                # PI-API-Serverのポート
  timeout: 30000            # タイムアウト（ミリ秒）
  max_retries: 3            # 最大リトライ回数
  retry_interval: 5000      # リトライ間隔（ミリ秒）

logging:
  level: "info"
  file: "/app/logs/ingester.log"

data_acquisition:
  fetch_margin_seconds: 30  # データ遅延考慮秒数
  max_history_days: 30      # 初回取得時の最大遡り日数
```

### 設備設定 (`configs/equipments/{設備名}/{設定名}.yaml`)

```yaml
basemap:
  addplot:
    interval: "10m"         # データ取得間隔
    lookback_period: "10D"  # 参照期間

  source_tags:              # 取得対象のPIタグ
    - "POW:711034.PV"
    - "POW:7T105B1.PV"

pi_integration:
  enabled: true             # PI連携有効化
  output_filename: "7th-untan.csv"  # 出力ファイル名
```

## 使用方法

### 開発環境

```bash
# 設定ファイルを準備
mkdir -p configs/equipments/7th-untan
cp configs/common.yaml.example configs/common.yaml
cp configs/equipments/7th-untan/short-term.yaml.example configs/equipments/7th-untan/short-term.yaml

# 設定を編集
vi configs/common.yaml
vi configs/equipments/7th-untan/short-term.yaml

# 実行
npm run dev
```

### 本番環境（Docker）

```bash
# イメージをビルド
docker build -t if-hub-pi-ingester .

# コンテナを実行
docker run -d \
  --name pi-ingester \
  -v $(pwd)/configs:/app/configs:ro \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/static_equipment_data:/app/static_equipment_data \
  if-hub-pi-ingester
```

### Docker Compose（推奨）

```yaml
version: '3.8'
services:
  pi-ingester:
    build: ./ingester
    container_name: if-hub-pi-ingester
    restart: unless-stopped
    volumes:
      - ./configs:/app/configs:ro
      - ./logs:/app/logs
      - ./static_equipment_data:/app/static_equipment_data
    environment:
      - TZ=Asia/Tokyo
    depends_on:
      - if-hub
```

## ログとモニタリング

### ログレベル

- **info**: 正常な動作状況
- **warn**: 警告（一時的なエラーなど）
- **error**: エラー（リトライ可能）

### 状態ファイル

取得状態は`/app/logs/ingester-state.json`に保存されます：

```json
{
  "equipment": {
    "7th-untan/short-term": {
      "lastFetchTime": "2025-06-04T03:00:00.000Z",
      "lastSuccessTime": "2025-06-04T03:00:00.000Z",
      "errorCount": 0
    }
  },
  "lastUpdated": "2025-06-04T03:00:30.123Z"
}
```

### ヘルスチェック

Dockerコンテナには自動ヘルスチェックが設定されています：

```bash
# ヘルスチェック状況を確認
docker ps

# 詳細ログを確認
docker logs if-hub-pi-ingester
```

## トラブルシューティング

### よくある問題

#### 1. PI-API-Serverに接続できない

```
❌ Failed to fetch data: No response from server: ECONNREFUSED
```

**解決方法**:
- `configs/common.yaml`のホスト・ポート設定を確認
- PI-API-Serverが起動しているか確認
- ネットワーク接続を確認

#### 2. 設定ファイルが見つからない

```
❌ Failed to load equipment config from configs/equipments/...
```

**解決方法**:
- 設定ファイルのパスと名前を確認
- `pi_integration.enabled: true`が設定されているか確認

#### 3. 出力ディレクトリに書き込めない

```
❌ Output directory is not writable
```

**解決方法**:
- ディレクトリの権限を確認
- Dockerボリュームマウントを確認

### デバッグ手順

1. **設定の確認**
   ```bash
   # 設定ファイルの構文チェック
   cat configs/common.yaml | python -c "import yaml; import sys; yaml.safe_load(sys.stdin)"
   ```

2. **接続テスト**
   ```bash
   # PI-API-Serverへの接続テスト
   curl "http://10.255.234.21:3011/PIData?TagNames=TEST:TAG&StartDate=20250604000000&EndDate=20250604010000"
   ```

3. **ログの確認**
   ```bash
   # リアルタイムログ
   docker logs -f if-hub-pi-ingester
   
   # 状態ファイルの確認
   cat logs/ingester-state.json | jq .
   ```

## 開発

### プロジェクト構造

```
ingester/
├── src/
│   ├── types/           # TypeScript型定義
│   ├── services/        # サービスクラス
│   ├── scheduler.ts     # スケジューラー
│   └── index.ts         # エントリポイント
├── configs/             # 設定ファイル
├── Dockerfile          # Dockerイメージ定義
└── package.json        # NPM設定
```

### 依存関係

- **axios**: HTTP通信
- **js-yaml**: YAML設定ファイル読み込み
- **node-cron**: スケジュール実行

### ビルド・テスト

```bash
# ビルド
npm run build

# 実行
npm start

# 開発モード
npm run dev

# クリーンアップ
npm run clean
```

## ライセンス

このプロジェクトはIF-HUBプロジェクトの一部です。
