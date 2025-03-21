# IndustryFlow Hub API マニュアル

## 目次

- [IndustryFlow Hub API マニュアル](#industryflow-hub-api-マニュアル)
  - [目次](#目次)
  - [API概要](#api概要)
    - [ベースURL](#ベースurl)
    - [共通パラメータ](#共通パラメータ)
    - [エラーレスポンス](#エラーレスポンス)
  - [システム情報 API](#システム情報-api)
    - [システム情報の取得](#システム情報の取得)
    - [サーバーステータスの取得](#サーバーステータスの取得)
  - [タグデータ操作 API](#タグデータ操作-api)
    - [タグ一覧の取得](#タグ一覧の取得)
    - [ソースタグによるタグ検索](#ソースタグによるタグ検索)
    - [設備一覧の取得](#設備一覧の取得)
    - [特定タグのデータ取得](#特定タグのデータ取得)
    - [複数タグのバッチ取得](#複数タグのバッチ取得)
    - [最新値の取得](#最新値の取得)
  - [統合処理API](#統合処理api)
    - [gtagデータの取得](#gtagデータの取得)
    - [動的プロセス実行](#動的プロセス実行)
  - [データエクスポート API](#データエクスポート-api)
    - [設備のCSVデータエクスポート](#設備のcsvデータエクスポート)
  - [計算生成タグ（gtag）システム](#計算生成タグgtagシステム)
    - [概要](#概要)
    - [gtag定義の構造](#gtag定義の構造)
      - [計算タイプの例](#計算タイプの例)
      - [移動平均タイプの例](#移動平均タイプの例)
      - [Z-scoreタイプの例](#z-scoreタイプの例)
      - [カスタムタイプの例（Python実装）](#カスタムタイプの例python実装)

## API概要

IndustryFlow Hub (IF-HUB) は、製造設備の時系列データにアクセスするためのRESTful APIを提供しています。全てのAPIエンドポイントは、標準的なHTTPメソッドとJSONレスポンス形式を使用しています。

### ベースURL

```
http://{hostname}:{port}/api
```

デフォルト設定では:
- 開発環境: `http://localhost:3001/api`
- Docker環境: `http://localhost:3001/api`

### 共通パラメータ

多くのAPIエンドポイントで使用できる共通パラメータ:

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `display` | Boolean | タグの表示名を含めるかどうか | false |
| `lang` | String | 表示名の言語コード (例: "ja", "en") | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |
| `timeshift` | Boolean | 過去データを現在時刻にシフトするかどうか | false |

### エラーレスポンス

エラーが発生した場合、APIは適切なHTTPステータスコードとJSONエラーオブジェクトを返します:

```json
{
  "error": "エラーの種類",
  "message": "詳細なエラーメッセージ"
}
```

一般的なHTTPステータスコード:

- `200 OK` - リクエスト成功
- `400 Bad Request` - 不正なリクエスト
- `404 Not Found` - リソースが見つからない
- `500 Internal Server Error` - サーバー内部エラー

## システム情報 API

### システム情報の取得

```
GET /api/system/info
```

システムの基本情報を取得します。

**レスポンス例:**

```json
{
  "name": "IndustryFlow Hub",
  "version": "1.0.0",
  "tagCount": 48,
  "equipmentCount": 3,
  "environment": "development",
  "storage": "SQLite database"
}
```

### サーバーステータスの取得

```
GET /api/status
```

サーバーの現在の状態と統計情報を取得します。

**レスポンス例:**

```json
{
  "status": "ok",
  "timestamp": "2023-01-01T12:00:00.000Z",
  "environment": "development",
  "database": {
    "type": "SQLite",
    "tags": 48,
    "equipment": 3,
    "dataPoints": 12480
  }
}
```

## タグデータ操作 API

### タグ一覧の取得

```
GET /api/tags
```

システム内のタグ情報を取得します。設備パラメータを指定することで、特定の設備に関連するタグのみをフィルタリングできます。

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `equipment` | String | 特定の設備のタグのみを取得（カンマ区切りで複数指定可能） | なし（全設備） |
| `display` | Boolean | タグの表示名を含めるかどうか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |

**レスポンス例:**

```json
{
  "tags": [
    {
      "id": "Pump01.Temperature",
      "equipment": "Pump01",
      "name": "Temperature",
      "source_tag": "Temperature",
      "unit": "°C",
      "min": 50.2,
      "max": 79.8,
      "display_name": "Temperature"
    },
    ...
  ]
}
```

### ソースタグによるタグ検索

```
GET /api/tags/sourceTag/:sourceTag
```

元のCSVタグ名（ソースタグ）を使用してタグを検索します。このエンドポイントを利用すると、異なる設備間で同じソースタグ名を持つタグをまとめて取得できます。

**パスパラメータ:**

| パラメータ | 型 | 説明 |
|----------|------|-------------|
| `sourceTag` | String | 検索するソースタグ名（例: "Temperature"） |

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `equipment` | String | 特定の設備のタグのみに絞り込み | なし（全設備） |
| `display` | Boolean | タグの表示名を含めるかどうか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |

**レスポンス例:**

```json
{
  "sourceTag": "Temperature",
  "tags": [
    {
      "id": "Pump01.Temperature",
      "equipment": "Pump01",
      "name": "Temperature",
      "source_tag": "Temperature",
      "unit": "°C",
      "display_name": "ポンプ01.温度"
    },
    {
      "id": "Pump02.Temperature",
      "equipment": "Pump02",
      "name": "Temperature",
      "source_tag": "Temperature",
      "unit": "°C",
      "display_name": "ポンプ02.温度"
    }
  ]
}
```

### 設備一覧の取得

```
GET /api/equipment
```

システム内のすべての設備情報を取得します。`includeTags=true`パラメータを指定すると、各設備に関連するタグ情報も含まれます。

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `includeTags` | Boolean | 設備に関連するタグ情報を含めるかどうか | false |
| `display` | Boolean | タグの表示名を含めるかどうか（`includeTags=true`の場合に有効） | false |
| `lang` | String | 表示名の言語コード（`includeTags=true`の場合に有効） | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか（`includeTags=true`の場合に有効） | false |

**レスポンス例 (includeTags=false):**

```json
{
  "equipment": [
    {
      "id": "Pump01",
      "name": "Pump01",
      "tagCount": 4
    },
    ...
  ]
}
```

**レスポンス例 (includeTags=true):**

```json
{
  "equipment": [
    {
      "id": "Pump01",
      "name": "Pump01",
      "tagCount": 4,
      "tags": [
        {
          "id": "Pump01.Temperature",
          "equipment": "Pump01",
          "name": "Temperature",
          "source_tag": "Temperature",
          "unit": "°C",
          "min": 50.2,
          "max": 79.8
        },
        {
          "id": "Pump01.Pressure",
          "equipment": "Pump01",
          "name": "Pressure",
          "source_tag": "Pressure",
          "unit": "kPa",
          "min": 100.3,
          "max": 150.7
        },
        ...
      ]
    },
    ...
  ]
}
```

### 特定タグのデータ取得

```
GET /api/data/:tagId
```

指定したタグIDのデータを取得します。

**パスパラメータ:**

| パラメータ | 型 | 説明 |
|----------|------|-------------|
| `tagId` | String | 取得するタグのID (例: "Pump01.Temperature") |

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `start` | String | 開始日時 (ISO 8601形式) | なし (全期間) |
| `end` | String | 終了日時 (ISO 8601形式) | なし (全期間) |
| `timeshift` | Boolean | 過去データを現在時刻にシフトするか | false |
| `display` | Boolean | タグの表示名を含めるか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |

**レスポンス例:**

```json
{
  "tagId": "Pump01.Temperature",
  "metadata": {
    "id": "Pump01.Temperature",
    "equipment": "Pump01",
    "name": "Temperature",
    "source_tag": "Temperature",
    "unit": "°C",
    "min": 50.2,
    "max": 79.8,
    "display_name": "ポンプ01.温度"
  },
  "data": [
    {
      "timestamp": "2023-01-01T00:00:00.000Z",
      "value": 75.2
    },
    {
      "timestamp": "2023-01-01T00:10:00.000Z",
      "value": 76.1
    },
    ...
  ]
}
```

### 複数タグのバッチ取得

```
GET /api/batch
```

複数のタグデータを一度に取得します。

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `tags` | String | カンマ区切りのタグID (必須) | - |
| `start` | String | 開始日時 (ISO 8601形式) | なし (全期間) |
| `end` | String | 終了日時 (ISO 8601形式) | なし (全期間) |
| `timeshift` | Boolean | 過去データを現在時刻にシフトするか | false |
| `display` | Boolean | タグの表示名を含めるか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |

**リクエスト例:**

```
GET /api/batch?tags=Pump01.Temperature,Pump01.Pressure&timeshift=true&display=true
```

**レスポンス例:**

```json
{
  "Pump01.Temperature": {
    "metadata": {
      "id": "Pump01.Temperature",
      "equipment": "Pump01",
      "name": "Temperature",
      "source_tag": "Temperature",
      "unit": "°C",
      "min": 50.2,
      "max": 79.8,
      "display_name": "ポンプ01.温度"
    },
    "data": [
      {
        "timestamp": "2023-03-01T12:00:00.000Z",
        "value": 75.2
      },
      ...
    ]
  },
  "Pump01.Pressure": {
    "metadata": {
      "id": "Pump01.Pressure",
      "equipment": "Pump01",
      "name": "Pressure",
      "source_tag": "Pressure",
      "unit": "kPa",
      "min": 100.3,
      "max": 150.7,
      "display_name": "ポンプ01.圧力"
    },
    "data": [
      {
        "timestamp": "2023-03-01T12:00:00.000Z",
        "value": 120.5
      },
      ...
    ]
  }
}
```

### 最新値の取得

```
GET /api/current
```

複数タグの最新値を取得します。ポーリング機能の実装に最適です。

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `tags` | String | カンマ区切りのタグID (必須) | - |
| `display` | Boolean | タグの表示名を含めるか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |

**リクエスト例:**

```
GET /api/current?tags=Pump01.Temperature,Pump01.Pressure&display=true
```

**レスポンス例:**

```json
{
  "Pump01.Temperature": {
    "timestamp": "2023-03-01T12:30:00.000Z",
    "value": 76.3,
    "metadata": {
      "id": "Pump01.Temperature",
      "equipment": "Pump01",
      "name": "Temperature",
      "source_tag": "Temperature",
      "unit": "°C",
      "min": 50.2,
      "max": 79.8,
      "display_name": "ポンプ01.温度"
    }
  },
  "Pump01.Pressure": {
    "timestamp": "2023-03-01T12:30:00.000Z",
    "value": 122.7,
    "metadata": {
      "id": "Pump01.Pressure",
      "equipment": "Pump01",
      "name": "Pressure",
      "source_tag": "Pressure",
      "unit": "kPa",
      "min": 100.3,
      "max": 150.7,
      "display_name": "ポンプ01.圧力"
    }
  }
}
```

## 統合処理API

### gtagデータの取得

```
GET /api/gtags/:name
```

特定のgtag（生成タグ）のデータを計算し取得します。このエンドポイントは移動平均、Z-score、カスタム計算など、様々なタイプのgtagに対応しています。

**パスパラメータ:**

| パラメータ | 型 | 説明 |
|----------|------|-------------|
| `name` | String | 取得するgtagの名前 (例: "Pump01.TempMA") |

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `start` | String | 開始日時 (ISO 8601形式) | なし (全期間) |
| `end` | String | 終了日時 (ISO 8601形式) | なし (全期間) |
| `timeshift` | Boolean | 過去データを現在時刻にシフトするか | false |
| `display` | Boolean | タグの表示名を含めるか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |
| `params` | JSON文字列 | 追加パラメータ（JSON形式） | {} |

**リクエスト例:**

```
GET /api/gtags/Pump01.TempMA?timeshift=true&display=true
```

**レスポンス例:**

```json
{
  "name": "Pump01.TempMA",
  "type": "moving_average",
  "metadata": {
    "description": "ポンプ01温度の移動平均",
    "unit": "°C",
    "equipment": "Pump01"
  },
  "data": [
    {
      "timestamp": "2023-03-01T12:00:00.000Z",
      "value": 75.4,
      "original": 75.2
    },
    {
      "timestamp": "2023-03-01T12:10:00.000Z",
      "value": 75.8,
      "original": 76.1
    },
    ...
  ]
}
```

### 動的プロセス実行

```
GET /api/process/:target
```

既存のタグに対して動的に様々な処理を実行します。gtagのように事前定義なしで一時的な処理結果を取得できます。

**パスパラメータ:**

| パラメータ | 型 | 説明 |
|----------|------|-------------|
| `target` | String | 処理対象のタグ名/ID (例: "Pump01.Temperature") |

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `type` | String | 処理タイプ ("raw", "moving_average", "zscore", "deviation") | "raw" |
| `window` | Number | 窓サイズ（移動平均、Z-score、偏差の場合） | タイプに依存 |
| `start` | String | 開始日時 (ISO 8601形式) | なし (全期間) |
| `end` | String | 終了日時 (ISO 8601形式) | なし (全期間) |
| `timeshift` | Boolean | 過去データを現在時刻にシフトするか | false |
| `display` | Boolean | タグの表示名を含めるか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |

**リクエスト例:**

```
GET /api/process/Pump01.Temperature?type=moving_average&window=10&timeshift=true
```

**レスポンス例:**

```json
{
  "target": "Pump01.Temperature",
  "type": "moving_average",
  "metadata": {
    "id": "Pump01.Temperature",
    "equipment": "Pump01",
    "name": "Temperature",
    "source_tag": "Temperature",
    "unit": "°C",
    "min": 50.2,
    "max": 79.8
  },
  "data": [
    {
      "timestamp": "2023-03-01T12:00:00.000Z",
      "value": 75.4,
      "original": 75.2
    },
    {
      "timestamp": "2023-03-01T12:10:00.000Z",
      "value": 75.8,
      "original": 76.1
    },
    ...
  ]
}
```

## データエクスポート API

### 設備のCSVデータエクスポート

```
GET /api/export/equipment/:equipmentId/csv
```

特定の設備に関連する全タグのデータをCSV形式でエクスポートします。

**パスパラメータ:**

| パラメータ | 型 | 説明 |
|----------|------|-------------|
| `equipmentId` | String | エクスポートする設備のID |

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `start` | String | 開始日時 (ISO 8601形式) | なし (全期間) |
| `end` | String | 終了日時 (ISO 8601形式) | なし (最新データまで) |
| `includeGtags` | Boolean | 計算生成タグ(gtag)を含めるかどうか | true |
| `timeshift` | Boolean | 過去データを現在時刻にシフトするかどうか | false |
| `display` | Boolean | カラム名にタグの表示名を使用するかどうか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |

**レスポンスヘッダー:**

```
Content-Type: text/csv
Content-Disposition: attachment; filename={equipmentId}_data_{timestamp}.csv
```

**CSVフォーマット:**

- 1列目: `datetime` - データポイントのタイムスタンプ (ISO 8601形式)
- 2列目以降: 設備に関連する通常タグ（ID順にソート）
- 最後尾: 設備に関連するgtag（ID順にソート、`includeGtags=true`の場合のみ）

**カラム名の形式:**

- `display=false`の場合: タグID (例: `Pump01.Temperature`)
- `display=true`の場合: タグの表示名 (例: `ポンプ01.温度`)
- `display=true&showUnit=true`の場合: 単位付き表示名 (例: `ポンプ01.温度 (°C)`)

**リクエスト例:**

```
GET /api/export/equipment/Pump01/csv?start=2023-01-01T00:00:00Z&display=true&lang=ja&showUnit=true
```

**レスポンス例 (display=false):**

```csv
datetime,Pump01.Flow,Pump01.Pressure,Pump01.Temperature,Pump01.EfficiencyIndex
2023-01-01T00:00:00.000Z,15.3,120.5,75.2,12.7
2023-01-01T00:10:00.000Z,15.5,121.7,76.1,12.7
...
```

**レスポンス例 (display=true&showUnit=true, 日本語):**

```csv
datetime,ポンプ01.流量 (L/min),ポンプ01.圧力 (kPa),ポンプ01.温度 (°C),ポンプ01.効率指標 (%)
2023-01-01T00:00:00.000Z,15.3,120.5,75.2,12.7
2023-01-01T00:10:00.000Z,15.5,121.7,76.1,12.7
...
```

## 計算生成タグ（gtag）システム

仮想タグ（gtag）は、複数の実タグを組み合わせて計算処理を行うための拡張機能です。物理的に測定できない値や複雑な指標を計算するのに役立ちます。

### 概要

gtagには以下のタイプがあります：

1. **計算タイプ（calculation）**：数式を使用して値を計算します
2. **移動平均タイプ（moving_average）**：単一タグの移動平均を計算します
3. **Z-scoreタイプ（zscore）**：標準化スコアを計算します
4. **偏差タイプ（deviation）**：偏差値を計算します
5. **カスタムタイプ（custom）**：カスタム実装（Pythonスクリプトなど）を使用します
6. **rawタイプ（raw）**：元データをそのまま返します

### gtag定義の構造

#### 計算タイプの例

```json
{
  "name": "Pump01.Efficiency",
  "type": "calculation",
  "inputs": ["Pump01.Flow", "Pump01.Power"],
  "expression": "(inputs[0] / inputs[1])",
  "description": "ポンプ効率（流量/消費電力）",
  "unit": ""
}
```

#### 移動平均タイプの例

```json
{
  "name": "Pump01.TempMA",
  "type": "moving_average",
  "inputs": ["Pump01.Temperature"],
  "window": 5,
  "description": "ポンプ01温度の移動平均",
  "unit": "°C"
}
```

#### Z-scoreタイプの例

```json
{
  "name": "Tank01.LevelZscore",
  "type": "zscore",
  "inputs": ["Tank01.Level"],
  "window": 24,
  "description": "タンク01水位のZ-score（異常検知用）",
  "unit": ""
}
```

#### カスタムタイプの例（Python実装）

```json
{
  "name": "Tank01.PredictedLevel",
  "type": "custom",
  "inputs": ["Tank01.Level", "Tank01.InFlow", "Tank01.OutFlow"],
  "implementation": "bin/predict_level.py",
