# IF-HUB Fetcher

IF-HUBのデータ抽出・整形を行うフロントエンド機構

## 概要

IF-HUB Fetcherは、設備単位でのタグ/gtagデータ抽出機構を提供し、CSV形式でデータを保存します。指定した期間のプロセスデータを取得し、ローカル時間でCSVファイルに出力します。

## 動作確認

バイナリ作成後、簡単な動作確認を行うことができます：

```bash
# ヘルプ表示
dist/bin/if-hub-fetcher --help

# バージョン確認
dist/bin/if-hub-fetcher --version

# 基本的なデータ取得テスト
dist/bin/if-hub-fetcher --equipment Pump01 --start-date "202301010000" --verbose
```

## 機能

- 設備単位でのデータ抽出
- 期間指定でのデータ取得
- 複数設備の一括取得
- ローカル時間ベースのファイル命名とCSV出力
- リモートIF-Hubサーバーへの接続対応

## インストール方法

```bash
# Fetcherディレクトリに移動
cd fetcher

# 依存パッケージのインストール
npm install

# スタンドアロンバイナリの作成
npm run build:binary

# 実行権限を付与
chmod +x dist/bin/if-hub-fetcher
```

## 使用方法

### 基本的な使用方法

```bash
# 設備のデータを取得（最新データまで）
dist/bin/if-hub-fetcher --equipment Pump01 --start-date "202301010000"

# 期間指定
dist/bin/if-hub-fetcher --equipment Pump01 --start-date "202301010000" --end-date "202301312359"

# 複数設備の取得
dist/bin/if-hub-fetcher --equipment Pump01,Tank01 --start-date "202301010000" --end-date "202301011700"

# 出力先とポート指定
dist/bin/if-hub-fetcher --equipment Pump01 --start-date "202301010000" --port 3002 --output-dir /custom/path

# リモートIF-Hub指定
dist/bin/if-hub-fetcher --equipment Pump01 --start-date "202301010000" --host 192.168.1.100 --port 3001
```

### コマンドラインオプション

| オプション                   | 説明                                               |
|----------------------------|---------------------------------------------------|
| `-e, --equipment <name>`   | 設備名（必須、カンマ区切りで複数指定可能）          |
| `-s, --start-date <time>`  | 開始時刻（必須、YYYYMMDDHHmm形式、ローカル時刻）   |
| `-n, --end-date <time>`    | 終了時刻（YYYYMMDDHHmm形式、ローカル時刻）         |
| `--host <host>`            | IF-HubのホストIP/ドメイン（デフォルト: localhost） |
| `-p, --port <number>`      | IF-Hubのポート番号（デフォルト: 3001）            |
| `-o, --output-dir <path>`  | CSV出力先ディレクトリ（デフォルト: .）            |
| `-v, --verbose`            | 詳細ログを出力                                    |
| `-h, --help`               | ヘルプを表示                                      |
| `-V, --version`            | バージョンを表示                                  |



## 開発者向け情報

### ディレクトリ構造

```
/fetcher/
├── src/                      # ソースコード
│   ├── types/                # 型定義
│   ├── io/                   # I/O処理
│   ├── formatters/           # 出力フォーマッタ
│   ├── api-client.ts         # APIクライアント
│   ├── tag-validator.ts      # タグ検証
│   ├── fetcher.ts            # コアロジック
│   └── index.ts              # エクスポート定義
├── cli/                      # CLIツール
│   ├── index.ts              # エントリーポイント
│   └── options-parser.ts     # オプション解析
├── dist/bin/                 # ビルド成果物
│   └── if-hub-fetcher        # スタンドアロンバイナリ
└── README.md                 # このファイル
```
