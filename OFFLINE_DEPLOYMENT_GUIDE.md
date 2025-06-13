# IF-Hub オフライン環境移行

IF-Hubシステムをネットワーク接続のない顧客環境に移行するためのツールです。

## 必要な環境

**開発環境（作業開始場所）:**
- Docker稼働中
- IF-Hubコンテナ起動済み

**顧客環境（移行先）:**
- Docker利用可能
- ネットワーク接続不要

## 作業手順

### ステップ1: パッケージ作成（開発環境）

```bash
./offline-deployment/deployment-tools/create-package.sh
```

**実行結果:**
- `offline-deployment/if-hub-container.tgz` または `offline-deployment/if-hub-application.tgz` が生成
- ファイルサイズにより自動判定（28MB〜250MB）

### ステップ2: ファイル転送

生成されたパッケージファイル（.tgz）を顧客環境に転送してください。

### ステップ3: 顧客環境でのセットアップ

#### 3-1. パッケージ展開

```bash
tar -xzf if-hub-*.tgz
cd if-hub
```

#### 3-2. PI接続設定

```bash
./configure-pi.sh
```

**対話で設定する項目:**
- PI-API-Serverのホスト（IPアドレス）
- PI-API-Serverのポート番号
- 設備設定（必要に応じて）

#### 3-3. システム起動

```bash
./setup.sh
```

**起動時の処理:**
- Dockerコンテナのインポート
- データベース初期化（新規環境の場合）
- サービス起動

#### 3-4. 動作確認

```bash
# コンテナ状態確認
docker ps | grep if-hub

# ブラウザアクセス
# http://localhost:3001
```

## 追加作業（必要に応じて）

### 初期データ取り込み

```bash
# 過去データの一括取り込み（例：30日分）
./tools/pi-batch-ingester.py \
  --config configs/equipments/{設備名}/config.yaml \
  --host {PI-API-ServerのIP} \
  --port {PI-API-Serverのポート} \
  --start "$(date -d '30 days ago' '+%Y-%m-%d')" \
  --end "$(date '+%Y-%m-%d')"
```

### システム監視

```bash
./tools/check-system.sh
```

## トラブルシューティング

### コンテナが起動しない

```bash
# ログ確認
docker logs if-hub
docker logs if-hub-pi-ingester

# 手動起動テスト
docker compose up
```

### PI接続エラー

```bash
# 設定再実行
./configure-pi.sh

# 接続テスト
ping {PI-API-ServerのIP}
```

### データが表示されない

```bash
# 状態確認
ls -la static_equipment_data/
cat logs/ingester-state.json

# サービス再起動
docker compose restart
```

## 詳細情報

### バッチツールの使用方法
[`tools/README.md`](offline-deployment/if-hub/tools/README.md) を参照

### 設定ファイルの編集
- **PI接続**: `configs/common.yaml`
- **設備設定**: `configs/equipments/{設備名}/config.yaml`

### 運用スクリプト
- `tools/check-system.sh` - 動作確認
- `tools/monitor-system.sh` - システム監視
- `tools/initial-data-import.sh` - 初期データ取り込み

## 完了確認

以下が確認できれば移行完了です：

1. **コンテナ起動**: `docker ps | grep if-hub` で2つのコンテナが Up
2. **WebUI表示**: ブラウザで http://localhost:3001 にアクセス可能  
3. **データ取得**: `static_equipment_data/` にCSVファイル生成

---

**サポート**: 問題が発生した場合は、エラーメッセージとともに開発チームまでご連絡ください。
