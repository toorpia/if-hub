# IF-Hub オフライン環境移行パッケージ作成ツール

このディレクトリには、IF-Hubシステムをネットワーク非接続の顧客環境に移行するためのパッケージ作成ツールが含まれています。

## 概要

- ツール名: `create-package.sh`

### 自動判定機能

このスクリプトは以下を自動判定してパッケージタイプを決定します：

1. **コンテナの更新状況を確認**
2. **既存のコンテナイメージファイルと比較**
3. **必要に応じて軽量/重量パッケージを生成**

| 判定結果 | パッケージ | サイズ | 含まれる内容 |
|----------|------------|--------|--------------|
| コンテナ更新あり | `if-hub-container.tgz` | 大（数GB） | アプリケーション + コンテナイメージ |
| コンテナ更新なし | `if-hub-application.tgz` | 中（100MB程度） | アプリケーションのみ |

## 使用方法

### パッケージの作成

```bash
# プロジェクトルートで実行
cd /path/to/if-hub-project
./offline-deployment/deployment-tools/create-package.sh
```

**自動生成されるファイル:**
- `offline-deployment/if-hub-container.tgz` (初回 or コンテナ更新時)
- `offline-deployment/if-hub-application.tgz` (軽量更新時)

## 前提条件

### create-package.sh の実行前に

1. **Dockerコンテナが起動していること**
   ```bash
   docker compose -f docker/docker-compose.yml up -d
   ```

2. **必要なコンテナが実行中であること**
   ```bash
   docker ps | grep if-hub
   # if-hub と if-hub-pi-ingester が実行中である必要があります
   ```

3. **Fetcherのビルド環境が整っていること**
   ```bash
   cd fetcher
   npm install
   ```

## 顧客環境での使用方法

### 初回セットアップ（パッケージのサイズは大きくなります）

```bash
# 1. パッケージを顧客環境に転送
scp if-hub-container.tgz user@customer-server:/path/to/destination/

# 2. 顧客環境で解凍
tar -xzf if-hub-container.tgz

# 3. セットアップ実行
cd if-hub
./configure-pi.sh    # PI-API-Server設定
./setup.sh           # システム起動
```

### アプリケーションのみ更新（パッケージにはコンテナイメージが含まれないためサイズが小さくなります）

```bash
# 1. パッケージを顧客環境に転送
scp if-hub-application.tgz user@customer-server:/path/to/destination/

# 2. 既存ディレクトリをバックアップ
mv if-hub if-hub-backup-$(date +%Y%m%d_%H%M%S)

# 3. 新しいパッケージを解凍
tar -xzf if-hub-application.tgz

# 4. データベースを復元（必要に応じて）
cp -r if-hub-backup-*/db if-hub/

# 5. アプリケーション更新実行
cd if-hub
./setup-update.sh    # アプリケーション更新
```

## トラブルシューティング

### create-package.sh でエラーが発生する場合

**エラー:** `if-hubコンテナが実行されていません`
```bash
# 解決方法
docker compose -f docker/docker-compose.yml up -d
docker ps | grep if-hub  # 起動確認
```

**エラー:** `Fetcherバイナリの生成に失敗しました`
```bash
# 解決方法
cd fetcher
npm install
npm run build:binary
```

**エラー:** `コンテナ情報の取得に失敗しました`
```bash
# 解決方法
docker ps | grep if-hub  # コンテナの存在確認
docker logs if-hub       # ログの確認
```

### 顧客環境でエラーが発生する場合

**エラー:** `docker: command not found`
```bash
# Dockerが未インストールの場合
# 顧客環境にDockerをインストールしてください
```

**エラー:** `コンテナの起動に失敗しました`
```bash
# ログを確認
docker logs if-hub
docker logs if-hub-pi-ingester
```

## ファイル構成

```
offline-deployment/
├── deployment-tools/
│   ├── create-package.sh               # 統合スクリプト（推奨）
│   └── README.md                       # このファイル
├── if-hub/                             # テンプレートディレクトリ
│   └── (移行用コンテンツが配置される)
├── if-hub-container.tgz                # 生成されるパッケージ(コンテナイメージ含む)
└── if-hub-application.tgz              # 生成されるパッケージ(アプリケーションのみ)
```

## 注意事項

1. **パッケージサイズ**
   - `if-hub-container.tgz`: 数GB（コンテナイメージ含む）
   - `if-hub-application.tgz`: 100MB程度（軽量版）

2. **データベースの保護**
   - 顧客環境の既存データベースは自動的に保護されます
   - バックアップが自動作成されます

3. **ネットワーク要件**
   - パッケージ作成は開発環境（ネットワーク接続あり）で行います
   - 顧客環境はネットワーク非接続でも動作します

4. **権限設定**
   - 実行前にスクリプトに実行権限を付与してください
   ```bash
   chmod +x offline-deployment/deployment-tools/*.sh
   ```

## サポート

問題が発生した場合は、以下の情報を添えてサポートまでご連絡ください：

1. エラーメッセージの全文
2. 実行環境（OS、Dockerバージョン等）
3. 実行したコマンドとその出力
4. `docker ps` および `docker images` の出力
5. コンテナとファイルのタイムスタンプ情報
