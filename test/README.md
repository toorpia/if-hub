# PI-Ingester テスト環境

PI-Ingesterの動作を検証するためのテスト環境です。モックPI-APIサーバーと組み合わせて、実際のPI-APIサーバーなしでPI-Ingesterの動作を確認できます。

## 📁 ディレクトリ構成

```
test/
├── README.md                    # このファイル
├── run-test.sh                  # テスト実行スクリプト
├── docker-compose.test.yml      # テスト用Docker Compose
├── mock-pi-api/                 # モックPI-APIサーバー
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
├── configs/                     # テスト用設定
│   ├── common.yaml              # 共通設定
│   └── equipments/
│       └── 7th-untan/
│           └── short-term.yaml  # 設備設定
├── logs/                        # ログ出力先
├── output/                      # CSV出力先
```

## 🚀 クイックスタート

### 1. テストの実行

```bash
# テストディレクトリに移動
cd test

# 完全なテストを実行（3分間）
./run-test.sh

# または段階的に実行
./run-test.sh start    # テスト環境起動
./run-test.sh logs     # ログ監視
./run-test.sh check    # 結果確認
./run-test.sh stop     # 環境停止
```

### 2. 期待される動作

テストが正常に動作すると：

1. **モックPI-APIサーバー**が起動（ポート3011）
2. **PI-Ingester**が30秒間隔でデータを取得
3. **CSVファイル**（`7th-untan-test.csv`）が生成される
4. **状態ファイル**（`ingester-state.json`）が更新される

## 📊 モックPI-APIサーバー

### 特徴

- **ポート**: 3011
- **エンドポイント**: `/PIData`
- **タグ**: `POW:711034.PV`, `POW:7T105B1.PV`
- **データ生成**: 10分間隔のリアルなサンプルデータ

### データパターン

- **POW:711034.PV**: 50-80の範囲で正弦波的変動
- **POW:7T105B1.PV**: 100-150の範囲で余弦波的変動

### APIテスト

```bash
# ヘルスチェック
curl http://localhost:3011/health

# データ取得テスト
curl "http://localhost:3011/PIData?TagNames=POW:711034.PV,POW:7T105B1.PV&StartDate=20250604120000&EndDate=20250604130000"
```

## 🔧 設定詳細

### テスト用設定の特徴

- **取得間隔**: 30秒（本番は10分）
- **履歴期間**: 1時間（本番は10日）
- **タイムアウト**: 10秒（短縮）
- **リトライ**: 2回（削減）

### 設定ファイル

#### `configs/common.yaml`
```yaml
pi_api:
  host: "mock-pi-api"
  port: 3011
  timeout: 10000
logging:
  level: "debug"
data_acquisition:
  fetch_margin_seconds: 10
  max_history_days: 1
```

#### `configs/equipments/7th-untan/short-term.yaml`
```yaml
pi_integration:
  enabled: true
  output_filename: "7th-untan-test.csv"
basemap:
  addplot:
    interval: "30s"
    lookback_period: "1H"
  source_tags:
    - "POW:711034.PV"
    - "POW:7T105B1.PV"
```

## 📋 テスト結果の確認

### 1. CSV出力ファイル

```bash
# ファイルの存在確認
ls -la output/

# 内容確認
head -n 10 output/7th-untan-test.csv
```

### 2. 状態ファイル

```bash
# 最新の状態確認
cat logs/ingester-state.json | jq .
```

### 3. ログファイル

```bash
# 詳細ログの確認
tail -f logs/ingester-test.log
```

## 🔍 トラブルシューティング

### よくある問題と解決方法

#### コンテナが起動しない
```bash
# ポート使用状況の確認
lsof -i :3011

# 既存コンテナの強制削除
docker-compose -f docker-compose.test.yml down --remove-orphans
```

#### CSVファイルが生成されない
```bash
# PI-Ingesterのログを確認
docker logs pi-ingester-test

# モックAPIの応答確認
docker logs mock-pi-api-test
```

#### ネットワーク接続の問題
```bash
# コンテナ間の接続確認
docker exec pi-ingester-test ping mock-pi-api
```

## 🧪 高度なテスト

### カスタム期間での実行

```bash
# 設定を修正して長時間実行
# configs/equipments/7th-untan/short-term.yaml の interval を変更
```

### 異なる設備での実行

```bash
# 新しい設備設定を作成
mkdir -p configs/equipments/new-equipment
# 設定ファイルを作成...
```

### デバッグモード

```bash
# より詳細なログ出力
docker-compose -f docker-compose.test.yml logs -f pi-ingester-test
```

## 🔗 関連リンク

- [PI-Ingester メインドキュメント](../README.md)
- [設定ファイルリファレンス](../CONFIG.md)
- [Docker構築ガイド](../Dockerfile)
