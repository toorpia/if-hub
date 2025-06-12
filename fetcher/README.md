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
- 条件フィルタリング（特定タグの数値条件に基づくデータ抽出）
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

### 条件フィルタリング

条件フィルタリング機能を使用すると、特定のタグ値が条件を満たす時刻のデータのみを抽出できます。

#### フィルタ条件の記法

```bash
# 基本形：タグ名 演算子 値
--filter "Pump01|Temperature > 50"
--filter "Pump01.Temperature > 50"

# 設備名省略形式（--equipmentで指定した設備のタグ）
--filter "Temperature > 50"

# 複数条件：論理演算子（AND/OR）で結合
--filter "Pump01|Temperature > 50 AND Pump01|Flow <= 100"
--filter "Temperature >= 50 AND Pump01|Flow <= 100"
--filter "Tank01.Level >= 80 OR Tank01.Level <= 20"
```

#### 対応演算子

| 演算子 | 説明       | 例                        |
|--------|------------|---------------------------|
| `>`    | より大きい | `Temperature > 50`        |
| `>=`   | 以上       | `Level >= 80`             |
| `<`    | より小さい | `Flow < 100`              |
| `<=`   | 以下       | `Pressure <= 5.0`         |
| `==`   | 等しい     | `Status == 1`             |
| `!=`   | 等しくない | `ErrorCode != 0`          |

#### 論理演算子

| 演算子 | 説明                   | 例                                        |
|--------|------------------------|-------------------------------------------|
| `AND`  | すべての条件を満たす   | `Temperature > 50 AND Flow <= 100`       |
| `OR`   | いずれかの条件を満たす | `Level >= 80 OR Level <= 20`             |

#### フィルタリングの使用例

```bash
# 温度が50度以上の時刻のデータのみ取得
dist/bin/if-hub-fetcher --equipment Pump01 --start-date "202301010000" \
  --filter "Pump01.Temperature > 50"

# 複数条件：温度50度以上かつ流量100以下
dist/bin/if-hub-fetcher --equipment Pump01 --start-date "202301010000" \
  --filter "Pump01.Temperature > 50 AND Pump01.Flow <= 100"

# OR条件：レベルが高すぎるか低すぎる時
dist/bin/if-hub-fetcher --equipment Tank01 --start-date "202301010000" \
  --filter "Tank01.Level >= 80 OR Tank01.Level <= 20"
```

#### 注意事項

- フィルタ条件に使用するタグは、指定した設備に含まれている必要があります
- フィルタ条件に必要なタグが設備の設定に含まれていない場合、自動的に追加して取得されます
- 条件を満たさないタイムスタンプのデータは出力されません
- フィルタ処理は取得後に実行されるため、大量データの場合は時間がかかる場合があります

### コマンドラインオプション

| オプション                   | 説明                                               |
|----------------------------|---------------------------------------------------|
| `-e, --equipment <name>`   | 設備名（必須、カンマ区切りで複数指定可能）          |
| `-s, --start-date <time>`  | 開始時刻（必須、YYYYMMDDHHmm形式、ローカル時刻）   |
| `-n, --end-date <time>`    | 終了時刻（YYYYMMDDHHmm形式、ローカル時刻）         |
| `--filter <expression>`   | 条件フィルタリング（例: "Pump01.Temperature > 50 AND Pump01.Flow <= 100"） |
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
│   ├── filter/               # 条件フィルタリング
│   │   ├── types.ts          # フィルタリング用型定義
│   │   ├── parser.ts         # 条件式パーサー
│   │   ├── engine.ts         # フィルタリングエンジン
│   │   └── index.ts          # エクスポート
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
