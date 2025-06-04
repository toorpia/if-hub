# IF-Hub プロジェクト移行手順書

## 概要

本手順書は、現在稼働中のIF-Hubプロジェクトを、インターネット接続のない別サーバーに移行するための手順を示します。`docker export`コマンドを使用してコンテナをエクスポートし、移行先で`docker import`でイメージを復元します。

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
EOF
```

#### 1.3 コンテナのエクスポート

```bash
# コンテナをtarファイルにエクスポート
docker export if-hub > if-hub-container.tar

# ファイルサイズの確認
ls -lh if-hub-container.tar
```

#### 1.4 必要なファイルの準備

```bash
# 移行用ディレクトリの作成
mkdir -p if-hub-export

# 設定ファイルの移動
cp docker-compose.import.yml if-hub-export/docker-compose.yml
cp if-hub-container.tar if-hub-export/

# データディレクトリのコピー
cp -r src if-hub-export/
cp -r static_equipment_data if-hub-export/
cp -r tag_metadata if-hub-export/
cp -r gtags if-hub-export/
cp -r logs if-hub-export/
cp -r db if-hub-export/
cp package.json if-hub-export/

# 移行用スクリプトの作成
cat > if-hub-export/setup.sh << 'EOF'
#!/bin/bash
# IF-Hub セットアップスクリプト

echo "コンテナイメージをインポートしています..."
cat if-hub-container.tar | docker import - if-hub:imported

echo "コンテナを起動しています..."
docker-compose up -d

echo "セットアップが完了しました。以下のコマンドでステータスを確認できます："
echo "docker ps | grep if-hub"
EOF

chmod +x if-hub-export/setup.sh

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

#### 2.2 Dockerコンテナのインポートと起動

```bash
# セットアップスクリプトを実行
./setup.sh
```

#### 2.3 動作確認

```bash
# コンテナの起動状態を確認
docker ps | grep if-hub

# ログの確認
docker logs if-hub

# ブラウザで確認（ポート番号は環境に合わせて調整）
# http://[サーバーのIP]:3001
```

## トラブルシューティング

### コンテナが起動しない場合

```bash
# 詳細なエラーログを確認
docker logs if-hub

# 手動でコンテナを起動して問題を特定
docker run --rm -it if-hub:imported /bin/sh
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

### その他の注意点

1. 移行先サーバーの環境変数を必要に応じて設定してください：
   ```bash
   # 例: ポートを変更する場合
   export EXTERNAL_PORT=3002
   ```

2. データの整合性を確保するため、移行元のコンテナを停止してからエクスポートすることも検討してください：
   ```bash
   docker stop if-hub
   docker export if-hub > if-hub-container.tar
   docker start if-hub
   ```

3. 定期的なバックアップ計画も検討してください。特にDBディレクトリは重要です。
