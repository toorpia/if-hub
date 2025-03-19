# DataStream Hub API マニュアル

## 目次

1. [API概要](#api概要)
2. [システム情報 API](#システム情報-api)
3. [タグデータ操作 API](#タグデータ操作-api)
4. [データ処理 API](#データ処理-api)
5. [仮想タグ（gtag）システム](#仮想タグgtag-システム)
6. [レスポンス形式](#レスポンス形式)
7. [表示名オプション](#表示名オプション)
8. [システム運用機能](#システム運用機能)
9. [実装例](#実装例)

## API概要

DataStream Hubは、製造設備の時系列データにアクセスするためのRESTful APIを提供しています。全てのAPIエンドポイントは、標準的なHTTPメソッドとJSONレスポンス形式を使用しています。

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
  "name": "DataStream Hub",
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

## データ処理 API

### 移動平均の計算

```
GET /api/process/ma/:tagId
```

指定したタグの移動平均を計算します。

**パスパラメータ:**

| パラメータ | 型 | 説明 |
|----------|------|-------------|
| `tagId` | String | 処理するタグのID |

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `window` | Number | 移動平均の窓サイズ（ポイント数） | 5 |
| `start` | String | 開始日時 (ISO 8601形式) | なし (全期間) |
| `end` | String | 終了日時 (ISO 8601形式) | なし (全期間) |
| `timeshift` | Boolean | 過去データを現在時刻にシフトするか | false |
| `display` | Boolean | タグの表示名を含めるか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |

**リクエスト例:**

```
GET /api/process/ma/Pump01.Temperature?window=10&display=true
```

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
  "processType": "moving_average",
  "windowSize": 10,
  "data": [
    {
      "timestamp": "2023-01-01T00:00:00.000Z",
      "value": 75.2,
      "original": 75.2
    },
    {
      "timestamp": "2023-01-01T00:10:00.000Z",
      "value": 75.65,
      "original": 76.1
    },
    ...
  ]
}
```

### Z-scoreの計算

```
GET /api/process/zscore/:tagId
```

指定したタグのZ-score（標準化スコア）を計算します。Z-scoreは、データポイントが平均からどれだけ標準偏差離れているかを示す値です。

**パスパラメータ:**

| パラメータ | 型 | 説明 |
|----------|------|-------------|
| `tagId` | String | 処理するタグのID |

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `window` | Number | 移動ウィンドウのサイズ（ポイント数）、指定なしの場合は全期間で計算 | null |
| `start` | String | 開始日時 (ISO 8601形式) | なし (全期間) |
| `end` | String | 終了日時 (ISO 8601形式) | なし (全期間) |
| `timeshift` | Boolean | 過去データを現在時刻にシフトするか | false |
| `display` | Boolean | タグの表示名を含めるか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |

**リクエスト例:**

```
GET /api/process/zscore/Pump01.Temperature?window=10&display=true
```

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
  "processType": "zscore",
  "windowSize": 10,
  "data": [
    {
      "timestamp": "2023-01-01T00:00:00.000Z",
      "value": 0.2,
      "original": 75.2,
      "mean": 74.5,
      "std": 3.5
    },
    {
      "timestamp": "2023-01-01T00:10:00.000Z",
      "value": 0.8,
      "original": 76.1,
      "mean": 74.8,
      "std": 3.6
    },
    ...
  ]
}
```

### 偏差の計算

```
GET /api/process/deviation/:tagId
```

指定したタグの偏差（平均からの差）を計算します。

**パスパラメータ:**

| パラメータ | 型 | 説明 |
|----------|------|-------------|
| `tagId` | String | 処理するタグのID |

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `window` | Number | 移動ウィンドウのサイズ（ポイント数）、指定なしの場合は全期間で計算 | null |
| `start` | String | 開始日時 (ISO 8601形式) | なし (全期間) |
| `end` | String | 終了日時 (ISO 8601形式) | なし (全期間) |
| `timeshift` | Boolean | 過去データを現在時刻にシフトするか | false |
| `display` | Boolean | タグの表示名を含めるか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |

**リクエスト例:**

```
GET /api/process/deviation/Pump01.Temperature?window=10&display=true
```

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
  "processType": "deviation",
  "windowSize": 10,
  "data": [
    {
      "timestamp": "2023-01-01T00:00:00.000Z",
      "value": 0.7,
      "original": 75.2,
      "mean": 74.5
    },
    {
      "timestamp": "2023-01-01T00:10:00.000Z",
      "value": 1.3,
      "original": 76.1,
      "mean": 74.8
    },
    ...
  ]
}
```

## 計算生成タグ（gtag）システム

仮想タグ（gtag）は、複数の実タグを組み合わせて計算処理を行うための拡張機能です。物理的に測定できない値や複雑な指標を計算するのに役立ちます。

### 概要

gtagには主に2つのタイプがあります：

1. **計算タイプ（calculation）**：数式を使用して値を計算します
2. **Pythonスクリプトタイプ（python）**：より複雑な計算にPythonスクリプトを使用します

### gtag定義の構造

#### 計算タイプの例：

```json
{
  "id": "Pump01.EfficiencyIndex",
  "name": "EfficiencyIndex",
  "description": "ポンプ01の効率指標（Flow/PowerConsumption × 100）",
  "equipment": "Pump01",
  "unit": "%",
  "type": "calculation",
  "expression": "(Pump01.Flow / Pump01.PowerConsumption) * 100",
  "sourceTags": ["Pump01.Flow", "Pump01.PowerConsumption"],
  "options": {
    "fillMissingData": "interpolate"
  }
}
```

#### Pythonスクリプトタイプの例：

```json
{
  "id": "Tank01.PredictedLevel",
  "name": "PredictedLevel",
  "description": "タンク01の30分後の水位予測",
  "equipment": "Tank01",
  "unit": "m",
  "type": "python",
  "script": "predict_level.py",
  "function": "predict_future_level",
  "parameters": {
    "prediction_minutes": 30
  },
  "sourceTags": ["Tank01.Level", "Tank01.InFlow", "Tank01.OutFlow"],
  "options": {
    "cacheTime": 300
  }
}
```

### gtagの使用方法

gtagは通常のタグと同様に扱うことができます。主なAPIエンドポイントは以下の通りです：

#### gtag一覧の取得

```
GET /api/gtags
```

**レスポンス例:**

```json
{
  "gtags": [
    {
      "id": "Pump01.EfficiencyIndex",
      "equipment": "Pump01",
      "name": "EfficiencyIndex",
      "description": "ポンプ01の効率指標（Flow/PowerConsumption × 100）",
      "unit": "%",
      "type": "calculation",
      "sourceTags": ["Pump01.Flow", "Pump01.PowerConsumption"],
      "createdAt": "2023-07-01T00:00:00.000Z",
      "updatedAt": "2023-07-01T00:00:00.000Z"
    },
    {
      "id": "Tank01.PredictedLevel",
      "equipment": "Tank01",
      "name": "PredictedLevel",
      "description": "タンク01の30分後の水位予測",
      "unit": "m",
      "type": "python",
      "sourceTags": ["Tank01.Level", "Tank01.InFlow", "Tank01.OutFlow"],
      "createdAt": "2023-07-01T00:00:00.000Z",
      "updatedAt": "2023-07-01T00:00:00.000Z"
    }
  ]
}
```

#### gtagデータの取得

gtagのデータは、通常のタグと同じAPIエンドポイントを使用して取得できます：

```
GET /api/data/Pump01.EfficiencyIndex
GET /api/batch?tags=Pump01.Flow,Pump01.EfficiencyIndex
```

#### タグ一覧と設備一覧でのgtag表示

タグ一覧API (`/api/tags`) と設備一覧API (`/api/equipment?includeTags=true`) は、デフォルトでgtagを含めます。gtagを除外するには、クエリパラメータ `includeGtags=false` を使用します。

```
GET /api/tags?includeGtags=false
GET /api/equipment?includeTags=true&includeGtags=false
```

### gtagの同期と更新

- gtagはJSON形式の定義ファイルとして `gtags/definitions/` ディレクトリに保存されます
- サーバー起動時に全てのgtag定義が読み込まれます
- サーバー実行中にgtag定義ファイルが更新された場合、5分以内に自動的に変更が検出され反映されます

## レスポンス形式

### 成功時レスポンス構造

APIの成功レスポンスはJSON形式で返されます。レスポンスの構造はエンドポイントによって異なりますが、一般的に以下の要素が含まれます：

- メタデータ（タグ情報、タイムスタンプなど）
- 実際のデータ配列

### エラー時レスポンス構造

エラーが発生した場合、JSONエラーオブジェクトとHTTPエラーステータスコードが返されます：

```json
{
  "error": "エラータイプ",
  "message": "詳細なエラーメッセージ"
}
```

一般的なエラーコード:

- `400 Bad Request` - 不正なパラメータまたはリクエスト
- `404 Not Found` - 指定されたタグまたはリソースが見つからない
- `500 Internal Server Error` - サーバー内部エラー

## 表示名オプション

DataStream HubはタグIDに対する表示名マッピングをサポートしています。これにより、生のタグID（例: `Pump01.Temperature`）を人間が読みやすい名前（例: `ポンプ01.温度`）に変換できます。

### display パラメータの使用方法

`display=true`をクエリパラメータとして追加すると、APIレスポンスにはタグメタデータ内に`display_name`フィールドが含まれます：

```
GET /api/data/Pump01.Temperature?display=true
```

### lang パラメータの使用方法

異なる言語の表示名を取得するには、`lang`パラメータを使用します：

```
GET /api/data/Pump01.Temperature?display=true&lang=en
```

サポートされている言語コード:
- `ja` - 日本語（デフォルト）
- `en` - 英語
- その他、必要に応じて追加可能

### showUnit パラメータの使用方法

`showUnit=true`をクエリパラメータとして追加すると、表示名に単位情報が含まれた形式で返されます：

```
GET /api/data/Pump01.Temperature?display=true&showUnit=true
```

表示例: `Temperature (°C)`

`showUnit=false`（またはパラメータ省略時）の場合は、単位情報が含まれない表示名が返されます：

```
GET /api/data/Pump01.Temperature?display=true&showUnit=false
```

表示例: `Temperature`

### 表示名の重複処理

同じ表示名が複数のタグに割り当てられている場合、APIは自動的に重複を検出し、2つ目以降のタグの表示名にサフィックスを追加します：

- 最初のタグ： `Temperature`
- 2つ目のタグ： `Temperature_1`
- 3つ目のタグ： `Temperature_2`

この処理はAPIレスポンス時に動的に行われ、元のデータベースの内容は変更されません。サフィックスの追加はタグIDの順序に基づいて一貫して適用されます。

## システム運用機能

### タグメタデータファイルの動的更新

DataStream Hubは、サーバーの実行中にタグメタデータファイルが更新された場合、自動的に変更を検出して反映します。

- タグメタデータファイルは `tag_metadata` ディレクトリ内の `translations_[言語コード].csv` という命名規則のCSVファイルです
- サーバー起動時に既存のタグメタデータファイルが読み込まれます
- サーバー実行中にタグメタデータファイルが更新された場合、5分以内に自動的に新しいメタデータ内容が反映されます
- 変更の検出はファイルのチェックサムに基づいて行われるため、実際に内容が変更された場合のみ再読み込みが実行されます

この機能により、サーバーの再起動なしでタグの表示名を更新できます。新しい設備や測定点が追加された場合や、表示名の修正が必要になった場合に便利です。

## 実装例

### Node.js クライアント実装例

```javascript
// datastream-hub-client.js
class DataStreamHubClient {
  constructor(baseUrl = 'http://localhost:3001/api') {
    this.baseUrl = baseUrl;
  }
  
  async getSystemInfo() {
    const response = await fetch(`${this.baseUrl}/system/info`);
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    return await response.json();
  }
  
  async getTags(options = {}) {
    const { display = false, lang = 'ja', showUnit = false } = options;
    const params = new URLSearchParams();
    if (display) params.append('display', 'true');
    if (lang) params.append('lang', lang);
    if (showUnit) params.append('showUnit', 'true');
    
    const url = `${this.baseUrl}/tags${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    return await response.json();
  }
  
  async getTagData(tagId, options = {}) {
    const { start, end, timeshift = false, display = false, lang = 'ja', showUnit = false } = options;
    
    const params = new URLSearchParams();
    if (start) params.append('start', new Date(start).toISOString());
    if (end) params.append('end', new Date(end).toISOString());
    if (timeshift) params.append('timeshift', 'true');
    if (display) params.append('display', 'true');
    if (lang) params.append('lang', lang);
    if (showUnit) params.append('showUnit', 'true');
    
    const url = `${this.baseUrl}/data/${tagId}${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Tag ${tagId} not found`);
      }
      throw new Error(`API error: ${response.statusText}`);
    }
    
    return await response.json();
  }
  
  async getCurrentValues(tagIds, options = {}) {
    const { display = false, lang = 'ja', showUnit = false } = options;
    
    const params = new URLSearchParams();
    params.append('tags', Array.isArray(tagIds) ? tagIds.join(',') : tagIds);
    if (display) params.append('display', 'true');
    if (lang) params.append('lang', lang);
    if (showUnit) params.append('showUnit', 'true');
    
    const url = `${this.baseUrl}/current?${params.toString()}`;
    const response = await fetch(url);
    
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    
    return await response.json();
  }
  
  async getMovingAverage(tagId, options = {}) {
    const { window = 5, start, end, timeshift = false, display = false, lang = 'ja', showUnit = false } = options;
    
    const params = new URLSearchParams();
    params.append('window', window.toString());
    if (start) params.append('start', new Date(start).toISOString());
    if (end) params.append('end', new Date(end).toISOString());
    if (timeshift) params.append('timeshift', 'true');
    if (display) params.append('display', 'true');
    if (lang) params.append('lang', lang);
    if (showUnit) params.append('showUnit', 'true');
    
    const url = `${this.baseUrl}/process/ma/${tagId}?${params.toString()}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Tag ${tagId} not found`);
      }
      throw new Error(`API error: ${response.statusText}`);
    }
    
    return await response.json();
  }
}

// Node.js環境とブラウザ環境の両方でエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataStreamHubClient;
} else {
  window.DataStreamHubClient = DataStreamHubClient;
}
```

### Python クライアント実装例

```python
# datastream_hub_client.py
import requests
from datetime import datetime
import json

class DataStreamHubClient:
    def __init__(self, base_url='http://localhost:3001/api'):
        self.base_url = base_url
        
    def get_system_info(self):
        response = requests.get(f"{self.base_url}/system/info")
        response.raise_for_status()
        return response.json()
    
    def get_tags(self, display=False, lang='ja', show_unit=False):
        params = {}
        if display:
            params['display'] = 'true'
        if lang:
            params['lang'] = lang
        if show_unit:
            params['showUnit'] = 'true'
            
        response = requests.get(f"{self.base_url}/tags", params=params)
        response.raise_for_status()
        return response.json()
    
    def get_tag_data(self, tag_id, start=None, end=None, timeshift=False, display=False, lang='ja', show_unit=False):
        params = {}
        if start:
            params['start'] = start.isoformat() if isinstance(start, datetime) else start
        if end:
            params['end'] = end.isoformat() if isinstance(end, datetime) else end
        if timeshift:
            params['timeshift'] = 'true'
        if display:
            params['display'] = 'true'
        if lang:
            params['lang'] = lang
        if show_unit:
            params['showUnit'] = 'true'
            
        response = requests.get(f"{self.base_url}/data/{tag_id}", params=params)
        response.raise_for_status()
        return response.json()
    
    def get_current_values(self, tag_ids, display=False, lang='ja', show_unit=False):
        if isinstance(tag_ids, list):
            tag_ids = ','.join(tag_ids)
            
        params = {
            'tags': tag_ids
        }
        if display:
            params['display'] = 'true'
        if lang:
            params['lang'] = lang
        if show_unit:
            params['showUnit'] = 'true'
            
        response = requests.get(f"{self.base_url}/current", params=params)
        response.raise_for_status()
        return response.json()
    
    def get_moving_average(self, tag_id, window=5, start=None, end=None, 
                          timeshift=False, display=False, lang='ja', show_unit=False):
        params = {
            'window': window
        }
        if start:
            params['start'] = start.isoformat() if isinstance(start, datetime) else start
        if end:
            params['end'] = end.isoformat() if isinstance(end, datetime) else end
        if timeshift:
            params['timeshift'] = 'true'
        if display:
            params['display'] = 'true'
        if lang:
            params['lang'] = lang
        if show_unit:
            params['showUnit'] = 'true'
            
        response = requests.get(f"{self.base_url}/process/ma/{tag_id}", params=params)
        response.raise_for_status()
        return response.json()
```

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

### curl を使った例

システム情報の取得:
```bash
curl http://localhost:3001/api/system/info
```

タグ一覧の取得（表示名付き）:
```bash
curl http://localhost:3001/api/tags?display=true&lang=ja
```

特定タグのデータ取得:
```bash
curl http://localhost:3001/api/data/Pump01.Temperature?start=2023-01-01T00:00:00Z&end=2023-01-02T00:00:00Z&display=true
```

複数タグの最新値を取得:
```bash
curl http://localhost:3001/api/current?tags=Pump01.Temperature,Pump01.Pressure&display=true
```

設備のCSVデータをエクスポート:
```bash
curl -o pump01_data.csv "http://localhost:3001/api/export/equipment/Pump01/csv?start=2023-01-01T00:00:00Z&display=true"
```

移動平均の計算:
```bash
curl http://localhost:3001/api/process/ma/Pump01.Temperature?window=10&timeshift=true
