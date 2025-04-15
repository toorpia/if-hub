# IF-HUB Fetcher

IF-HUBのデータ抽出・整形・条件フィルタリングを行うフロントエンド機構

## 概要

IF-HUB Fetcherは、設備単位・条件付きでのタグ/gtagデータ抽出機構を提供し、CSV形式でデータを保存します。特定の条件（例：特定のタグが指定値以上など）を満たす時間帯のみのデータを抽出することも可能です。

## 機能

- 通常のタグ/gtagの取得機能
- 条件付きデータ取得（`only_when`構文）
- 設定ファイルによる柔軟な制御
- 増分データ取得機能（`--latest`オプション）
- 大量データの自動ファイル分割（デフォルト: 10万行ごと）
- タイムスタンプベースのファイル命名

## インストール方法

```bash
# Fetcherディレクトリに移動
cd fetcher

# 依存パッケージのインストール
npm install

# TypeScriptのビルド
npm run build
```

## 使用方法

### 基本的な使用方法

```bash
# 設備のデータを取得
./run.sh --equipment Pump01

# 特定のタグのみ取得
./run.sh --equipment Pump01 --tags Pump01.Temperature,Pump01.Pressure

# 期間指定
./run.sh --equipment Pump01 --start "2023-01-01T00:00:00Z" --end "2023-01-31T23:59:59Z"

# 最新データのみ取得（前回の最終時刻以降）
./run.sh --equipment Pump01 --latest

# 条件付き取得（温度が50度より大きい場合のみ）
./run.sh --equipment Pump01 --only-when "Pump01.Temperature > 50"
```

### コマンドラインオプション

| オプション                | 説明                                               |
|--------------------------|---------------------------------------------------|
| `-e, --equipment <name>` | 設備名（必須、カンマ区切りで複数指定可能）          |
| `-t, --tags <names>`     | タグ名（カンマ区切りで複数指定可能）                |
| `-s, --start <time>`     | 開始時刻（ISO 8601形式）                          |
| `-n, --end <time>`       | 終了時刻（ISO 8601形式）                          |
| `-l, --latest`           | 最新データのみ取得                                |
| `-c, --config-file <path>` | 設定ファイルのパス                                |
| `-o, --only-when <expr>` | 条件式（例: "Tag1 > 50"）                         |
| `-m, --max-rows-per-file <num>` | 1ファイルあたりの最大行数                   |
| `-p, --page-size <num>`  | APIリクエストの1ページあたりのレコード数           |
| `-v, --verbose`          | 詳細ログを出力                                    |
| `-h, --help`             | ヘルプを表示                                      |
| `-V, --version`          | バージョンを表示                                  |

## 設定ファイル

設定ファイル（デフォルト: `./fetcher/config.yaml`）でデフォルト設定を行うことができます。設定ファイルの例：

```yaml
# 設備一覧
equipment:
  - name: Pump01
    # 取得対象のタグ一覧
    tags:
      - Pump01.Flow
      - Pump01.Temperature
    # 条件定義
    conditions:
      # only_when: 特定の条件を満たす時間帯のみデータを抽出
      only_when:
        - tag: Pump01.Temperature
          condition: "> 45"

# 出力設定
output:
  format: csv
  directory: "./data"
  max_rows_per_file: 100000

# IF-HUB API設定
if_hub_api:
  base_url: "http://localhost:3001"
  timeout: 30000
  max_records_per_request: 10000
  page_size: 1000
```

## 出力ファイル

データは指定した出力ディレクトリ（デフォルト: `./data`）の下に設備ごとのサブディレクトリに保存されます。ファイル名は含まれるデータの実際のタイムスタンプに基づいて自動的に生成されます。

```
data/
  ├── Pump01/
  │   ├── Pump01_20230101_000000-20230105_235959.csv
  │   └── Pump01_20230106_000000-20230110_120535.csv
  └── Tank01/
      └── Tank01_20230101_000000-20230110_235959.csv
```

## プログラム的な使用方法

Fetcherモジュールは、プログラムからも利用できます：

```typescript
import { loadConfig, fetchData } from './fetcher/src';

async function fetchEquipmentData() {
  // 設定の読み込み
  const config = await loadConfig('./path/to/config.yaml');
  
  // データの取得
  const result = await fetchData({
    config,
    equipment: 'Pump01',
    options: {
      start: '2023-01-01T00:00:00Z',
      end: '2023-01-31T23:59:59Z',
      latest: true
    }
  });
  
  if (result.success) {
    console.log(`取得成功: ${result.stats?.totalRecords} レコード`);
    console.log(`出力ファイル: ${result.outputFiles?.join(', ')}`);
  } else {
    console.error(`エラー: ${result.error?.message}`);
  }
}
```

## 開発者向け情報

### ディレクトリ構造

```
/fetcher/
├── src/                      # ソースコード
│   ├── types/                # 型定義
│   ├── io/                   # I/O処理
│   ├── formatters/           # 出力フォーマッタ
│   ├── config.ts             # 設定ファイル処理
│   ├── api-client.ts         # APIクライアント
│   ├── filter.ts             # フィルタリング
│   ├── tag-validator.ts      # タグ検証
│   ├── fetcher.ts            # コアロジック
│   └── index.ts              # エクスポート定義
├── cli/                      # CLIツール
│   ├── index.ts              # エントリーポイント
│   └── options-parser.ts     # オプション解析
├── config.yaml               # デフォルト設定
├── run.sh                    # 実行スクリプト
└── README.md                 # このファイル
```

### 設計原則

このモジュールは、以下の設計原則に基づいています：

1. **責務の明確な分離**: タグデータの補正処理はIF-HUB側で行い、Fetcherはデータ抽出・条件付きフィルタリングに集中
2. **Pure関数アプローチ**: コア処理は副作用を持たない関数として実装
3. **データの整合性保証**: タグの存在確認などの検証機能
4. **柔軟な出力制御**: ファイル分割など、大量データを扱うための機能
