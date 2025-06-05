# IndustryFlow Hub (IF-HUB) 開発者ガイド

## 目次

1. [アーキテクチャ概要](#アーキテクチャ概要)
2. [データベース設計](#データベース設計)
3. [コード詳細](#コード詳細)
4. [拡張方法](#拡張方法)
5. [テスト方法](#テスト方法)

## アーキテクチャ概要

IF-HUBは、以下のコンポーネントで構成されるモジュラー設計を採用しています：

### コンポーネント構成

```
+--------------------+     +--------------------+     +-----------------+
|                    |     |                    |     |                 |
|  クライアント       |<--->|  Express API サーバー |<--->|  SQLiteデータベース |
|                    |     |                    |     |                 |
+--------------------+     +--------------------+     +-----------------+
                              |          ^
                              v          |
                           +--------------------+    
                           |                    |    
                           |  外部プロセッサ      |    
                           |  フレームワーク      |    
                           |                    |    
                           +--------------------+    
```

### 主要モジュール

1. **APIサーバー** (`src/server.js`):
   - Express.jsフレームワークを使用したRESTful API
   - ルーティングとエンドポイント処理
   - エラーハンドリングとレスポンス形成

2. **データベース管理** (`src/db.js`):
   - SQLiteデータベース接続管理
   - テーブル定義とデータ検索

3. **CSVインポーター** (`src/utils/csv-importer.js`):
   - 静的PIデータファイルの読み込み
   - CSVパースとデータベース取り込み

4. **タグメタデータ管理**:
   - `src/utils/tag-metadata-importer.js` - タグメタデータCSVファイルインポート
   - `src/utils/tag-utils.js` - タグメタデータ取得ユーティリティ

5. **外部プロセッサフレームワーク** (`src/utils/external-processor.js`):
   - 子プロセス管理と通信
   - 外部処理プログラムの実行制御

### データフロー

1. **データ読み込み**:
   ```
   静的CSVファイル → CSVインポーター → SQLiteデータベース
   ```

2. **API呼び出し**:
   ```
   クライアント → APIサーバー → データベースクエリ → JSONレスポンス → クライアント
   ```

3. **データ処理**:
   ```
   APIリクエスト → データ取得 → 外部プロセッサに送信 → 処理結果受信 → JSONレスポンス
   ```

## データベース設計

IF-HUBは、SQLiteデータベースを使用して時系列データとメタデータを格納します。

### テーブル構造

#### tags テーブル
タグのメタデータを格納します。

```sql
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  equipment TEXT NOT NULL,
  source_tag TEXT NOT NULL,
  unit TEXT,
  min REAL,
  max REAL
)
```

| カラム | 型 | 説明 |
|-------|------|-----------|
| id | INTEGER | タグの一意識別子（自動採番される整数）|
| name | TEXT | タグの名前（例: `Pump01.Temperature`）|
| equipment | TEXT | 設備名（例: `Pump01`）|
| source_tag | TEXT | 元のCSVカラム名（例: `Temperature`）|
| unit | TEXT | 単位（例: `°C`）|
| min | REAL | データの最小値 |
| max | REAL | データの最大値 |

#### tag_data テーブル
時系列データポイントを格納します。

```sql
CREATE TABLE IF NOT EXISTS tag_data (
  tag_id INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  value REAL,
  PRIMARY KEY (tag_id, timestamp),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
)
```

| カラム | 型 | 説明 |
|-------|------|-----------|
| tag_id | INTEGER | タグID（tags.idへの外部キー）|
| timestamp | TEXT | 時刻（ISO 8601形式）|
| value | REAL | データ値 |

#### tag_translations テーブル
タグIDと表示名のマッピングを格納します。

```sql
CREATE TABLE IF NOT EXISTS tag_translations (
  tag_id INTEGER NOT NULL,
  language TEXT NOT NULL,
  display_name TEXT NOT NULL,
  unit TEXT,
  PRIMARY KEY (tag_id, language),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
)
```

| カラム | 型 | 説明 |
|-------|------|-----------|
| tag_id | INTEGER | タグID（tags.idへの外部キー）|
| language | TEXT | 言語コード（例: `ja`, `en`）|
| display_name | TEXT | 表示名（例: `ポンプ01.温度`）|
| unit | TEXT | 単位の表示名 |

### インデックス

効率的なクエリのために以下のインデックスが作成されています：

```sql
CREATE INDEX IF NOT EXISTS idx_tag_data_timestamp ON tag_data(timestamp)
CREATE INDEX IF NOT EXISTS idx_tags_equipment ON tags(equipment)
CREATE INDEX IF NOT EXISTS idx_tags_source_tag ON tags(source_tag)
CREATE INDEX IF NOT EXISTS idx_tag_translations_tag_id ON tag_translations(tag_id)
```

### クエリ最適化

大規模データセットでのパフォーマンスを最適化するためのヒント：

1. **時間範囲の絞り込み**:
   ```sql
   SELECT timestamp, value FROM tag_data 
   WHERE tag_id = ? AND timestamp >= ? AND timestamp <= ?
   ORDER BY timestamp
   ```

2. **データ量の制限**:
   ```sql
   -- 最新N件のデータのみを取得
   SELECT timestamp, value FROM tag_data 
   WHERE tag_id = ? 
   ORDER BY timestamp DESC 
   LIMIT 100
   ```

3. **トランザクションの活用**:
   ```javascript
   db.exec('BEGIN TRANSACTION');
   try {
     // 複数のデータ挿入/更新操作
     db.exec('COMMIT');
   } catch (error) {
     db.exec('ROLLBACK');
   }
   ```

## コード詳細

### サーバー起動フロー

`src/server.js`の`startServer()`関数が起動シーケンスを制御します：

```javascript
async function startServer() {
  try {
    // 1. CSVデータをデータベースにインポート
    await importCsvToDatabase();
    
    // 2. タグメタデータをインポート
    await importTagMetadata();
    
    // 3. サーバーを起動し、ポートでリッスン開始
    app.listen(PORT, () => {
      console.log(`IndustryFlow Hub (IF-HUB) Server running on port ${PORT}`);
      console.log(`Environment: ${config.environment}`);
      // ...その他のログ出力
    });
  } catch (error) {
    console.error('サーバー起動中にエラーが発生しました:', error);
    process.exit(1);
  }
}
```

### データ読み込みロジック

CSVからデータを読み込み、SQLiteデータベースに取り込むロジックの流れ：

1. `src/utils/csv-importer.js`が`static_equipment_data`ディレクトリからCSVファイルを検索
2. ファイル名からequipmentIDを抽出（例: `Pump01.csv` → `Pump01`）
3. CSVヘッダーからタグ名（source_tag）を抽出
4. 各タグのメタデータを`tags`テーブルに登録（tagsテーブルのsource_tagカラムにソースタグ名を保存）
5. 各データポイントを`tag_data`テーブルに登録

重要な最適化：
- チャンク処理によるメモリ効率の向上
- トランザクション使用によるインサート速度の向上
- インデックスによる検索速度の最適化

### タグIDとソースタグの関係

IF-HUBでは、タグには2つの識別子があります：

1. **タグID**: `{設備名}.{タグ名}`という形式のシステム内での一意識別子（例：`Pump01.Temperature`）
2. **ソースタグ（source_tag）**: CSVファイルの元のカラム名（例：`Temperature`）

この関係は以下のように実装されています：

```javascript
// CSVインポート時のタグ登録処理
const tagId = `${equipmentId}.${header}`;
const sourceTag = header;

stmtTag.run(
  tagId,
  equipmentId,
  header,          // name列
  sourceTag,       // source_tag列
  guessUnit(header),
  min,
  max
);
```

この実装により、同じソースタグ（例：`Temperature`）を持つ異なる設備の同種センサーを一括で管理できます。

### 大規模CSVファイル処理の最適化

IF-HUBは、大規模なCSVファイルを効率的に処理するための最適化が実装されています：

#### ストリーミング処理方式

大量のデータを扱う場合に重要な点は、全データを一度にメモリに読み込まないことです。CSVインポーターでは以下のような最適化が行われています：

```javascript
// ヘッダー行のみを先に取得
async function getHeaderRow(filePath) {
  return new Promise((resolve, reject) => {
    let headerRow = null;
    const stream = fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        headerRow = row;
        stream.destroy(); // 最初の行を取得したらストリームを終了
      })
      .on('end', () => {
        if (headerRow) {
          resolve(headerRow);
        } else {
          reject(new Error('CSVファイルにヘッダー行がありません'));
        }
      })
      .on('error', reject);
  });
}

// 各タグごとに個別にデータを処理
async function processTagData(filePath, tagId, header, timestampColumn, equipmentId) {
  // ...ストリーミング処理の実装...
}
```

#### バッチ処理とトランザクション管理

大量のデータ挿入を効率的に行うために、バッチ処理とトランザクション分割が実装されています：

```javascript
// 一定サイズごとにバッチ処理
const BATCH_SIZE = 500;

// バッチがたまったらDBに挿入
if (batch.length >= BATCH_SIZE) {
  for (const point of batch) {
    stmtData.run(point.tagId, point.timestamp, point.value);
  }
  batch = []; // バッチをクリア
  
  // 定期的にコミットして新しいトランザクションを開始（メモリ解放）
  db.exec('COMMIT');
  db.exec('BEGIN TRANSACTION');
}
```

#### 強制読み込みモード

システム起動時にCSVファイルを確実に読み込むために、チェックサム比較に依存しない強制読み込みモードが実装されています：

```javascript
// すべてのCSVファイルを強制的に処理
console.log('すべてのCSVファイルを強制的に読み込みます');

for (const file of files) {
  const fileInfo = {
    path: path.join(csvPath, file),
    name: file,
    equipmentId: path.basename(file, '.csv'),
    checksum: 'force-import-' + Date.now() // 強制読み込み用の一時的なチェックサム
  };
  
  console.log(`ファイル ${fileInfo.name} を処理中...`);
  await importSpecificCsvFile(fileInfo);
}
```

#### 環境に依存しないパス設定

Docker環境と非Docker環境の両方で適切に動作するよう、パス設定が最適化されています：

```javascript
// モックデータフォルダのパス設定
staticDataPath: process.env.STATIC_DATA_PATH || 
  (process.env.NODE_ENV === 'production' 
    ? '/app/static_equipment_data' 
    : path.join(process.cwd(), 'static_equipment_data')),
```

これらの最適化により、IF-HUBは大規模CSVファイルを効率的に処理し、メモリ使用量を抑えながら正確なデータ取り込みを実現しています。

### ファイル監視と動的データ更新

IF-HUBには、サーバー実行中にCSVファイルの変更を検出して自動的にデータを更新する機能があります：

#### ファイル監視システム（src/utils/file-watcher.js）

```javascript
// チェックサムベースのファイル変更検出
function detectChangedFiles() {
  // CSVファイルのリストを取得し、各ファイルのチェックサムを計算
  const files = fs.readdirSync(CSV_FOLDER)
    .filter(file => file.endsWith('.csv'))
    .map(file => {
      const filePath = path.join(CSV_FOLDER, file);
      return {
        path: filePath,
        name: file,
        equipmentId: path.basename(file, '.csv'),
        checksum: calculateChecksum(filePath)
      };
    });
  
  // 変更または新規のファイルを特定（チェックサムの比較）
  const changedFiles = files.filter(file => {
    const lastChecksum = fileChecksums.get(file.path);
    return lastChecksum === undefined || lastChecksum !== file.checksum;
  });
  
  // 処理済みファイル情報を更新
  files.forEach(file => {
    fileChecksums.set(file.path, file.checksum);
  });
  
  return changedFiles;
}
```

- SHA-256ハッシュを使用してファイルの内容に基づくチェックサムを計算
- チェックサム情報をJSONファイルに永続化し、サーバー再起動間でも保持
- ファイルの追加、削除、内容変更を正確に検出

#### 特定ファイルの処理（src/utils/csv-importer.js）

```javascript
async function importSpecificCsvFile(fileInfo) {
  // ...
  
  // 当該設備の既存タグを取得して比較
  const existingTags = db.prepare('SELECT name FROM tags WHERE equipment = ?').all(equipmentId)
    .map(tag => tag.name);
  
  const newTags = headers.filter(h => h !== timestampColumn);
  
  // タグ構成が変わっている場合、当該設備のデータを全削除
  const tagsChanged = !arraysEqual(existingTags.sort(), newTags.sort());
  
  if (tagsChanged) {
    // 設備に関連するタグIDを取得して削除
    // ...
  }
  
  // 各タグのデータを処理
  // ...
}
```

- タグ構成の変更を検出し、必要に応じて設備データを再構築
- 既存タグ構造との比較を行い、最適なインポート戦略を選択
- `INSERT OR REPLACE`を使用して、同じタイムスタンプのデータポイントを更新

#### 定期的な監視（src/server.js）

```javascript
// 1分おきにCSVフォルダを監視
setInterval(async () => {
  try {
    const changedFiles = detectChangedFiles();
    
    if (changedFiles.length > 0) {
      for (const fileInfo of changedFiles) {
        await importSpecificCsvFile(fileInfo);
      }
    }
  } catch (error) {
    console.error('CSV監視処理中にエラーが発生しました:', error);
  }
}, 60000); // 1分間隔
```

- サーバーの起動時に初期チェックを実行し、変更されたファイルのみをインポート
- その後、定期的にフォルダを監視して変更を自動検出
- エラーハンドリングにより、一部のファイルでエラーが発生しても監視プロセスが継続

### タグメタデータ管理

IF-HUBは、タグ表示名を管理するために柔軟なメタデータシステムを提供しています。

#### タグメタデータのインポート（src/utils/tag-metadata-importer.js）

```javascript
async function importTagMetadata() {
  // ...
  
  for (const row of rows) {
    const tagId = row.tag_id || row.tagId;
    const sourceTag = row.source_tag || row.sourceTag;
    const displayName = row.display_name || row.displayName;
    const unit = row.unit || '';
    
    if (tagId && displayName) {
      // 直接タグIDが指定されている場合、単一のレコードを追加
      stmt.run(tagId, language, displayName, unit);
      counter++;
    } 
    else if (sourceTag && displayName) {
      // source_tagから関連するタグIDを検索
      const relatedTags = db.prepare('SELECT id FROM tags WHERE source_tag = ?').all(sourceTag);
      
      // 見つかったすべてのタグIDに対して表示名を適用
      for (const tag of relatedTags) {
        stmt.run(tag.id, language, displayName, unit);
        counter++;
      }
    }
  }
}
```

この実装により、以下の2つの方法でタグメタデータを定義できます：

1. **タグID指定方式**:
   - `tag_id`（例：`Pump01.Temperature`）を直接指定
   - 特定の設備とタグの組み合わせに対してカスタム表示名を設定

2. **ソースタグ指定方式**:
   - `source_tag`（例：`Temperature`）を指定
   - 同じソースタグを持つすべてのタグに対して同一の表示名を一括で適用
   - 新しい設備が追加された場合でも、既存の翻訳が自動的に適用される

#### タグメタデータの取得（src/utils/tag-utils.js）

```javascript
function getTagMetadata(tagId, options = {}) {
  const { display = false, lang = 'ja' } = options;
  
  // タグメタデータを取得
  const metadata = db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId);
  
  // 表示名が不要な場合はそのまま返す
  if (!metadata || !display) {
    return metadata;
  }
  
  // 表示名を取得
  const translation = db.prepare(
    'SELECT display_name FROM tag_translations WHERE tag_id = ? AND language = ?'
  ).get(tagId, lang);
  
  // ...省略...
  
  return {
    ...metadata,
    display_name: translation ? translation.display_name : metadata.name
  };
}

// ソースタグでタグを検索する関数（新機能）
function findTagsBySourceTag(sourceTag, equipment = null) {
  let query = 'SELECT id, equipment, name, source_tag FROM tags WHERE source_tag = ?';
  const params = [sourceTag];
  
  if (equipment) {
    query += ' AND equipment = ?';
    params.push(equipment);
  }
  
  return db.prepare(query).all(...params);
}
```

### APIエンドポイント実装

APIエンドポイントの基本的な実装パターン：

```javascript
app.get('/api/endpoint', (req, res) => {
  try {
    // 1. リクエストパラメータを取得
    const { param1, param2 } = req.query;
    
    // 2. データベースからデータを取得
    const data = db.prepare('SELECT ... WHERE ...').all(...params);
    
    // 3. 必要な後処理を実行
    const processedData = someProcessing(data);
    
    // 4. レスポンスを返す
    res.json({
      metadata: { ... },
      data: processedData
    });
  } catch (error) {
    // 5. エラーハンドリング
    console.error('エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

#### ソースタグ検索エンドポイント（src/server.js）

```javascript
// ソースタグ名によるタグの検索
app.get('/api/tags/sourceTag/:sourceTag', (req, res) => {
  const { sourceTag } = req.params;
  const { equipment, display = 'false', lang = 'ja', showUnit = 'false' } = req.query;
  
  try {
    let query = 'SELECT * FROM tags WHERE source_tag = ?';
    const params = [sourceTag];
    
    // 設備IDでフィルタリング
    if (equipment) {
      query += ' AND equipment = ?';
      params.push(equipment);
    }
    
    const tags = db.prepare(query).all(...params);
    
    if (tags.length === 0) {
      return res.json({ 
        sourceTag, 
        tags: [] 
      });
    }
    
    // 表示名を追加
    if (display === 'true') {
      const tagIds = tags.map(tag => tag.id);
      const metadataMap = getTagsMetadata(tagIds, {
        display: true,
        lang,
        showUnit: showUnit === 'true'
      });
      
      const tagsWithDisplayNames = tags.map(tag => ({
        ...tag,
        display_name: metadataMap[tag.id]?.display_name || tag.name,
        unit: metadataMap[tag.id]?.unit || tag.unit
      }));
      
      return res.json({
        sourceTag,
        tags: tagsWithDisplayNames
      });
    }
    
    res.json({
      sourceTag,
      tags
    });
  } catch (error) {
    console.error('ソースタグによるタグ検索中にエラーが発生しました:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

## 拡張方法

### 新しいAPIエンドポイントの追加

`src/server.js`に新しいエンドポイントを追加する例：

```javascript
// 新しいエンドポイント: タグの統計情報を取得
app.get('/api/stats/:tagId', (req, res) => {
  const { tagId } = req.params;
  const { start, end } = req.query;
  
  try {
    // タグの存在確認
    const tagExists = db.prepare('SELECT COUNT(*) as count FROM tags WHERE id = ?').get(tagId).count > 0;
    
    if (!tagExists) {
      return res.status(404).json({ error: `Tag ${tagId} not found` });
    }
    
    // データポイント取得
    let query = 'SELECT value FROM tag_data WHERE tag_id = ?';
    const params = [tagId];
    
    // 時間範囲フィルタリング
    if (start) {
      query += ' AND timestamp >= ?';
      params.push(new Date(start).toISOString());
    }
    
    if (end) {
      query += ' AND timestamp <= ?';
      params.push(new Date(end).toISOString());
    }
    
    const data = db.prepare(query).all(...params).map(row => row.value);
    
    // 統計計算
    const stats = {
      count: data.length,
      min: Math.min(...data),
      max: Math.max(...data),
      avg: data.reduce((sum, val) => sum + val, 0) / data.length,
      median: calculateMedian(data)
    };
    
    res.json({ tagId, stats });
  } catch (error) {
    console.error('統計計算中にエラーが発生しました:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function calculateMedian(values) {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  
  return sorted[middle];
}
```

### データ処理機能の追加

新しい外部プロセッサを追加する手順:

1. **プロセッサスクリプト作成**:
   ```
   processors/new_processor/new_processor.py
   ```
   
   ```python
   #!/usr/bin/env python3
   import argparse
   import json
   import sys
   
   def parse_arguments():
       parser = argparse.ArgumentParser(description='新しいデータ処理')
       parser.add_argument('--input', type=str, required=True, help='入力JSONファイルパス')
       parser.add_argument('--output', type=str, required=True, help='出力JSONファイルパス')
       parser.add_argument('--param', type=float, required=True, help='処理パラメータ')
       return parser.parse_args()
   
   def main():
       args = parse_arguments()
       
       try:
           # 入力ファイルを読み込む
           with open(args.input, 'r') as f:
               input_data = json.load(f)
           
           # データを処理
           data = input_data.get('data', [])
           param = args.param
           
           result = []
           for point in data:
               # 何らかの処理
               processed_value = point['value'] * param
               
               result.append({
                   'timestamp': point['timestamp'],
                   'value': processed_value,
                   'original': point['value']
               })
           
           # 結果を出力
           with open(args.output, 'w') as f:
               json.dump(result, f, indent=2)
           
           print(f"処理完了: {len(result)}ポイントを処理しました")
           sys.exit(0)
       except Exception as e:
           print(f"Error: {str(e)}", file=sys.stderr)
           sys.exit(1)
   
   if __name__ == "__main__":
       main()
   ```

2. **外部プロセッサインターフェース拡張**:
   `src/utils/external-processor.js`に新しいメソッドを追加:

   ```javascript
   /**
    * 新しい処理を実行
    * @param {Array} data - 処理対象のデータ配列
    * @param {Object} options - 処理オプション
    * @returns {Promise<Array>} 処理結果のデータ配列
    */
   async newProcessing(data, options = {}) {
     const { param = 1.0 } = options;
     
     // 一時ファイルパスを生成
     const tempInputFile = path.join(os.tmpdir(), `data_${Date.now()}.json`);
     const tempOutputFile = path.join(os.tmpdir(), `result_${Date.now()}.json`);
     
     try {
       // 入力データをJSON形式で書き込む
       await fs.writeJson(tempInputFile, { data });
       
       // 外部プロセッサを実行
       await this.runProcess('new_processor', [
         '--input', tempInputFile,
         '--output', tempOutputFile,
         '--param', param.toString()
       ]);
       
       // 結果を読み込む
       const result = await fs.readJson(tempOutputFile);
       
       return result;
     } finally {
       // 一時ファイルを削除
       await fs.remove(tempInputFile).catch(() => {});
       await fs.remove(tempOutputFile).catch(() => {});
     }
   }
   ```

3. **APIエンドポイント追加**:
   `src/server.js`に新しいエンドポイントを追加:

   ```javascript
   app.get('/api/process/new/:tagId', async (req, res) => {
     const { tagId } = req.params;
     const { param = 1.0, start, end, display = 'false', lang = 'ja' } = req.query;
     
     try {
       // タグの存在確認
       const tagExists = db.prepare('SELECT COUNT(*) as count FROM tags WHERE id = ?').get(tagId).count > 0;
       
       if (!tagExists) {
         return res.status(404).json({ error: `Tag ${tagId} not found` });
       }
       
       // タグのメタデータを取得
       const metadata = getTagMetadata(tagId, {
         display: display === 'true',
         lang
       });
       
       // タグデータを取得
       let query = 'SELECT timestamp, value FROM tag_data WHERE tag_id = ?';
       const params = [tagId];
       
       if (start) {
         query += ' AND timestamp >= ?';
         params.push(new Date(start).toISOString());
       }
       
       if (end) {
         query += ' AND timestamp <= ?';
         params.push(new Date(end).toISOString());
       }
       
       query += ' ORDER BY timestamp';
       
       const tagData = db.prepare(query).all(...params);
       
       if (tagData.length === 0) {
         return res.json({
           tagId,
           metadata,
           processType: 'new_processing',
           param: parseFloat(param),
           data: []
         });
       }
       
       // 外部プロセッサで処理
       const processedData = await externalProcessor.newProcessing(tagData, {
         param: parseFloat(param)
       });
       
       res.json({
         tagId,
         metadata,
         processType: 'new_processing',
         param: parseFloat(param),
         data: processedData
       });
     } catch (error) {
       console.error('処理中にエラーが発生しました:', error);
       res.status(500).json({ 
         error: 'Internal server error', 
         message: error.message
       });
     }
   });
   ```

### ソースタグ検索機能の拡張

ソースタグに関連する追加機能の実装例：

```javascript
// ソースタグによるデータの一括取得
app.get('/api/data/sourceTag/:sourceTag', async (req, res) => {
  const { sourceTag } = req.params;
  const { 
    equipment, 
    start, 
    end, 
    timeshift = 'false',
    display = 'false', 
    lang = 'ja'
  } = req.query;
  
  try {
    // ソースタグを持つタグを検索
    let query = 'SELECT id FROM tags WHERE source_tag = ?';
    const params = [sourceTag];
    
    if (equipment) {
      query += ' AND equipment = ?';
      params.push(equipment);
    }
    
    const tags = db.prepare(query).all(...params);
    
    if (tags.length === 0) {
      return res.json({
        sourceTag,
        tags: [],
        data: {}
      });
    }
    
    const tagIds = tags.map(tag => tag.id);
    const result = {};
    
    // 各タグのデータを取得
    for (const tagId of tagIds) {
      // データ取得クエリ
      let dataQuery = 'SELECT timestamp, value FROM tag_data WHERE tag_id = ?';
      const dataParams = [tagId];
      
      if (start) {
        dataQuery += ' AND timestamp >= ?';
        dataParams.push(new Date(start).toISOString());
      }
      
      if (end) {
        dataQuery += ' AND timestamp <= ?';
        dataParams.push(new Date(end).toISOString());
      }
      
      dataQuery += ' ORDER BY timestamp';
      
      // タグデータを取得
      const tagData = db.prepare(dataQuery).all(...dataParams);
      
      // タイムシフトが必要な場合
      const processedData = timeshift === 'true' 
        ? getTimeShiftedData(tagData, true) 
        : tagData;
      
      // メタデータを取得
      const metadata = getTagMetadata(tagId, {
        display: display === 'true',
        lang
      });
      
      result[tagId] = {
        metadata,

### パフォーマンスチューニング

大規模データセットでのパフォーマンスを向上させるためのヒント：

1. **インデックスの追加**:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_tag_data_tag_id_timestamp ON tag_data(tag_id, timestamp);
   ```

2. **クエリの最適化**:
   - 必要なカラムのみを選択
   - 適切な WHERE 条件
   - LIMIT を使用してデータ量を制限

3. **並列処理の導入**:
   - Node.jsのworker_threadsを使用
   - 複数タグの処理を並列化

4. **キャッシング導入**:
   - 頻繁にアクセスされるデータをメモリキャッシュに保存
   - TTL（有効期限）を設定して定期的に更新

```javascript
// キャッシング例
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300 }); // 5分のTTL

app.get('/api/data/:tagId', (req, res) => {
  const { tagId } = req.params;
  const cacheKey = `data_${tagId}_${JSON.stringify(req.query)}`;
  
  // キャッシュをチェック
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return res.json(cachedData);
  }
  
  // 通常の処理...
  
  // 結果をキャッシュに保存
  cache.set(cacheKey, result);
  res.json(result);
});
```

## Fetcher/Ingester開発ガイド

### Fetcherアーキテクチャ

#### モジュール構成とディレクトリ構造

Fetcherは以下のモジュラー構成で設計されています：

```
/fetcher/
├── src/                      # ソースコード
│   ├── types/                # TypeScript型定義
│   │   ├── config.ts         # 設定ファイルの型定義
│   │   ├── data.ts           # データ構造の型定義
│   │   └── options.ts        # オプションの型定義
│   ├── io/                   # I/O処理
│   │   ├── file.ts           # ファイル操作
│   │   └── http.ts           # HTTP通信
│   ├── formatters/           # 出力フォーマッタ
│   │   └── csv.ts            # CSV出力処理
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
└── README.md                 # ドキュメント
```

#### TypeScript実装の設計原則

Fetcherは以下の設計原則に基づいて実装されています：

**1. 責務の明確な分離**
```typescript
// 各モジュールが単一の責務を持つ
export interface APIClient {
  fetchTagData(tagId: string, options: FetchOptions): Promise<TagData>;
  fetchBatchData(tags: string[], options: FetchOptions): Promise<BatchData>;
}

export interface DataFilter {
  applyCondition(data: DataPoint[], condition: FilterCondition): DataPoint[];
}

export interface OutputFormatter {
  formatToCSV(data: DataPoint[], metadata: TagMetadata[]): string;
}
```

**2. Pure関数アプローチ**
```typescript
// 副作用を持たない純粋関数として実装
export function filterDataByCondition(
  data: DataPoint[], 
  condition: string
): DataPoint[] {
  // 元のデータを変更せず、新しい配列を返す
  return data.filter(point => evaluateCondition(point, condition));
}

export function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '').slice(0, 15);
}
```

**3. 型安全性の確保**
```typescript
// 厳密な型定義による実行時エラーの防止
export interface FetchOptions {
  start?: string;
  end?: string;
  latest?: boolean;
  onlyWhen?: string;
  maxRowsPerFile?: number;
  pageSize?: number;
}

export interface FetchResult {
  success: boolean;
  stats?: {
    totalRecords: number;
    filteredRecords: number;
    outputFiles: string[];
  };
  error?: Error;
}
```

#### APIクライアント、フィルタリング、CSV出力の仕組み

**APIクライアント実装：**
```typescript
// src/api-client.ts
export class IFHubAPIClient implements APIClient {
  private baseUrl: string;
  private timeout: number;

  async fetchTagData(tagId: string, options: FetchOptions): Promise<TagData> {
    const url = this.buildUrl(`/api/data/${tagId}`, options);
    
    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        validateStatus: (status) => status < 500
      });
      
      if (response.status === 404) {
        throw new TagNotFoundError(`Tag ${tagId} not found`);
      }
      
      return this.parseTagData(response.data);
    } catch (error) {
      throw new APIError(`Failed to fetch data for ${tagId}`, error);
    }
  }

  async fetchBatchData(tags: string[], options: FetchOptions): Promise<BatchData> {
    const chunkedTags = this.chunkArray(tags, options.pageSize || 10);
    const results: BatchData = {};
    
    for (const chunk of chunkedTags) {
      const chunkData = await this.fetchTagChunk(chunk, options);
      Object.assign(results, chunkData);
    }
    
    return results;
  }
}
```

**フィルタリング実装：**
```typescript
// src/filter.ts
export class DataFilter {
  applyCondition(data: DataPoint[], condition: string): DataPoint[] {
    const conditionEvaluator = this.parseCondition(condition);
    
    return data.filter(point => {
      try {
        return conditionEvaluator.evaluate(point);
      } catch (error) {
        console.warn(`Condition evaluation failed for point at ${point.timestamp}:`, error);
        return false;
      }
    });
  }

  private parseCondition(condition: string): ConditionEvaluator {
    // 条件式をパースして評価可能な形に変換
    const parsed = this.conditionParser.parse(condition);
    return new ConditionEvaluator(parsed);
  }
}

export class ConditionEvaluator {
  constructor(private expression: ParsedExpression) {}

  evaluate(context: Record<string, any>): boolean {
    return this.evaluateExpression(this.expression, context);
  }

  private evaluateExpression(expr: ParsedExpression, context: Record<string, any>): boolean {
    switch (expr.type) {
      case 'comparison':
        return this.evaluateComparison(expr, context);
      case 'logical':
        return this.evaluateLogical(expr, context);
      default:
        throw new Error(`Unknown expression type: ${expr.type}`);
    }
  }
}
```

**CSV出力実装：**
```typescript
// src/formatters/csv.ts
export class CSVFormatter implements OutputFormatter {
  formatToCSV(data: DataPoint[], metadata: TagMetadata[]): string {
    const headers = this.buildHeaders(metadata);
    const rows = this.buildRows(data, metadata);
    
    return [headers, ...rows].join('\n');
  }

  private buildHeaders(metadata: TagMetadata[]): string {
    const columns = ['datetime', ...metadata.map(meta => meta.displayName || meta.id)];
    return this.escapeCsvRow(columns);
  }

  private buildRows(data: DataPoint[], metadata: TagMetadata[]): string[] {
    const groupedData = this.groupByTimestamp(data);
    
    return Object.entries(groupedData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([timestamp, points]) => {
        const row = [timestamp];
        
        metadata.forEach(meta => {
          const point = points.find(p => p.tagId === meta.id);
          row.push(point ? String(point.value) : '');
        });
        
        return this.escapeCsvRow(row);
      });
  }

  private escapeCsvRow(values: string[]): string {
    return values
      .map(value => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      })
      .join(',');
  }
}
```

#### 拡張方法（新しい条件式、出力フォーマット）

**新しい条件式の追加：**
```typescript
// src/filter.ts に新しい演算子を追加
export class ConditionParser {
  private operators = {
    '>': (a: number, b: number) => a > b,
    '<': (a: number, b: number) => a < b,
    '>=': (a: number, b: number) => a >= b,
    '<=': (a: number, b: number) => a <= b,
    '==': (a: any, b: any) => a == b,
    '!=': (a: any, b: any) => a != b,
    // 新しい演算子を追加
    'between': (a: number, min: number, max: number) => a >= min && a <= max,
    'in': (a: any, values: any[]) => values.includes(a),
    'regex': (a: string, pattern: string) => new RegExp(pattern).test(a)
  };

  parse(condition: string): ParsedExpression {
    // 新しい構文をサポート
    // 例: "Temperature between 50 and 80"
    // 例: "Status in ['running', 'idle']"
    // 例: "Message regex '^ERROR.*'"
    
    if (condition.includes(' between ')) {
      return this.parseBetweenCondition(condition);
    }
    
    if (condition.includes(' in ')) {
      return this.parseInCondition(condition);
    }
    
    if (condition.includes(' regex ')) {
      return this.parseRegexCondition(condition);
    }
    
    return this.parseStandardCondition(condition);
  }
}
```

**新しい出力フォーマットの追加：**
```typescript
// src/formatters/json.ts
export class JSONFormatter implements OutputFormatter {
  formatToJSON(data: DataPoint[], metadata: TagMetadata[]): string {
    const formatted = {
      metadata: {
        tags: metadata,
        exportTime: new Date().toISOString(),
        recordCount: data.length
      },
      data: this.groupByTimestamp(data)
    };
    
    return JSON.stringify(formatted, null, 2);
  }
}

// src/formatters/parquet.ts
export class ParquetFormatter implements OutputFormatter {
  async formatToParquet(data: DataPoint[], metadata: TagMetadata[]): Promise<Buffer> {
    const schema = this.buildParquetSchema(metadata);
    const records = this.convertToRecords(data, metadata);
    
    return await this.writeParquetFile(schema, records);
  }
}

// src/formatters/factory.ts
export class FormatterFactory {
  static create(format: string): OutputFormatter {
    switch (format.toLowerCase()) {
      case 'csv':
        return new CSVFormatter();
      case 'json':
        return new JSONFormatter();
      case 'parquet':
        return new ParquetFormatter();
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
}
```

### Ingesterアーキテクチャ

#### Node.js/TypeScriptベースの実装

Ingesterは以下の構造で実装されています：

```
ingester/
├── src/
│   ├── types/           # TypeScript型定義
│   │   ├── config.ts    # 設定の型定義
│   │   └── state.ts     # 状態管理の型定義
│   ├── services/        # サービスクラス
│   │   ├── config-loader.ts     # 設定ファイル読み込み
│   │   ├── csv-output.ts        # CSV出力サービス
│   │   ├── pi-api-client.ts     # PI-API通信
│   │   ├── state-manager.ts     # 状態管理
│   │   └── tag-metadata.ts      # メタデータ処理
│   ├── scheduler.ts     # スケジューラー
│   └── index.ts         # エントリポイント
├── Dockerfile          # Dockerイメージ定義
└── package.json        # NPM設定
```

#### PI-API連携の仕組み

**PI-APIクライアント実装：**
```typescript
// src/services/pi-api-client.ts
export class PIApiClient {
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;

  async fetchTimeSeriesData(
    tagNames: string[], 
    startDate: Date, 
    endDate: Date
  ): Promise<PITimeSeriesData> {
    const formattedStart = this.formatPIDate(startDate);
    const formattedEnd = this.formatPIDate(endDate);
    
    const url = `${this.baseUrl}/PIData?TagNames=${tagNames.join(',')}&StartDate=${formattedStart}&EndDate=${formattedEnd}`;
    
    return await this.executeWithRetry(async () => {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'Accept': 'application/json'
        }
      });
      
      return this.parsePIResponse(response.data);
    });
  }

  async fetchTagMetadata(tagNames: string[]): Promise<PITagMetadata[]> {
    const url = `${this.baseUrl}/TagAttributes?TagNames=${tagNames.join(',')}`;
    
    const response = await this.executeWithRetry(async () => {
      return await axios.get(url, { timeout: this.timeout });
    });
    
    return this.parseMetadataResponse(response.data);
  }

  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await this.sleep(delay);
          console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        }
      }
    }
    
    throw new PIApiError(`Failed after ${this.maxRetries} attempts`, lastError);
  }
}
```

#### スケジューラーと状態管理

**スケジューラー実装：**
```typescript
// src/scheduler.ts
export class DataIngestionScheduler {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private stateManager: StateManager;
  private configLoader: ConfigLoader;

  async initialize(): Promise<void> {
    const equipmentConfigs = await this.configLoader.loadAllEquipmentConfigs();
    
    for (const config of equipmentConfigs) {
      if (config.pi_integration?.enabled) {
        await this.scheduleEquipment(config);
      }
    }
  }

  private async scheduleEquipment(config: EquipmentConfig): Promise<void> {
    const interval = config.basemap.addplot.interval;
    const cronExpression = this.convertIntervalToCron(interval);
    
    const job = cron.schedule(cronExpression, async () => {
      try {
        await this.executeDataIngestion(config);
      } catch (error) {
        console.error(`Data ingestion failed for ${config.name}:`, error);
        await this.stateManager.incrementErrorCount(config.name);
      }
    }, {
      scheduled: false, // Don't start automatically
      timezone: 'Asia/Tokyo'
    });
    
    this.jobs.set(config.name, job);
    job.start();
    
    console.log(`Scheduled data ingestion for ${config.name} with interval ${interval}`);
  }

  private async executeDataIngestion(config: EquipmentConfig): Promise<void> {
    const state = await this.stateManager.getEquipmentState(config.name);
    const now = new Date();
    
    // 前回取得時刻から増分データを取得
    const startTime = state?.lastFetchTime 
      ? new Date(state.lastFetchTime)
      : this.calculateInitialStartTime(config, now);
    
    const endTime = new Date(now.getTime() - 30000); // 30秒のマージンを設ける
    
    if (startTime >= endTime) {
      console.log(`No new data available for ${config.name}`);
      return;
    }
    
    // PI-APIからデータを取得
    const piData = await this.piApiClient.fetchTimeSeriesData(
      config.basemap.source_tags,
      startTime,
      endTime
    );
    
    // CSV形式に変換して出力
    await this.csvOutputService.writeEquipmentData(config, piData);
    
    // 状態を更新
    await this.stateManager.updateEquipmentState(config.name, {
      lastFetchTime: endTime.toISOString(),
      lastSuccessTime: now.toISOString(),
      errorCount: 0
    });
    
    console.log(`Data ingestion completed for ${config.name}: ${piData.length} records`);
  }
}
```

**状態管理実装：**
```typescript
// src/services/state-manager.ts
export class StateManager {
  private statePath: string;
  private state: IngesterState;

  async loadState(): Promise<void> {
    try {
      if (await fs.pathExists(this.statePath)) {
        const stateData = await fs.readJson(this.statePath);
        this.state = this.validateState(stateData);
      } else {
        this.state = this.createInitialState();
      }
    } catch (error) {
      console.warn('Failed to load state, using initial state:', error);
      this.state = this.createInitialState();
    }
  }

  async saveState(): Promise<void> {
    this.state.lastUpdated = new Date().toISOString();
    
    await fs.ensureDir(path.dirname(this.statePath));
    await fs.writeJson(this.statePath, this.state, { spaces: 2 });
  }

  async getEquipmentState(equipmentName: string): Promise<EquipmentState | null> {
    return this.state.equipment[equipmentName] || null;
  }

  async updateEquipmentState(equipmentName: string, update: Partial<EquipmentState>): Promise<void> {
    if (!this.state.equipment[equipmentName]) {
      this.state.equipment[equipmentName] = {
        lastFetchTime: null,
        lastSuccessTime: null,
        errorCount: 0
      };
    }
    
    Object.assign(this.state.equipment[equipmentName], update);
    await this.saveState();
  }

  async incrementErrorCount(equipmentName: string): Promise<void> {
    const currentState = await this.getEquipmentState(equipmentName);
    const errorCount = (currentState?.errorCount || 0) + 1;
    
    await this.updateEquipmentState(equipmentName, { errorCount });
  }
}
```

#### Docker化とCI/CD対応

**Dockerfile：**
```dockerfile
# ingester/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# 依存関係のインストール
COPY package*.json ./
RUN npm ci --only=production

# ソースコードのコピーとビルド
COPY . .
RUN npm run build

# 実行用の軽量イメージ
FROM node:20-alpine AS runner

WORKDIR /app

# 必要なファイルのみをコピー
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# ヘルスチェック用のスクリプト
COPY healthcheck.js ./

# 非rootユーザーでの実行
RUN addgroup -g 1001 -S nodejs
RUN adduser -S ingester -u 1001
USER ingester

# ヘルスチェックの設定
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node healthcheck.js

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**GitHub Actions CI/CD：**
```yaml
# .github/workflows/ingester.yml
name: Ingester CI/CD

on:
  push:
    branches: [main, develop]
    paths: ['ingester/**']
  pull_request:
    branches: [main]
    paths: ['ingester/**']

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '20'
        cache: 'npm'
        cache-dependency-path: ingester/package-lock.json
    
    - name: Install dependencies
      working-directory: ingester
      run: npm ci
    
    - name: Run type check
      working-directory: ingester
      run: npm run type-check
    
    - name: Run linting
      working-directory: ingester
      run: npm run lint
    
    - name: Run tests
      working-directory: ingester
      run: npm test
    
    - name: Build
      working-directory: ingester
      run: npm run build

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v2
    
    - name: Login to Container Registry
      uses: docker/login-action@v2
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
    
    - name: Build and push Docker image
      uses: docker/build-push-action@v4
      with:
        context: ./ingester
        push: true
        tags: |
          ghcr.io/${{ github.repository }}/if-hub-ingester:latest
          ghcr.io/${{ github.repository }}/if-hub-ingester:${{ github.sha }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
```

### 開発環境セットアップ

#### 依存関係とビルド方法

**Fetcherの開発環境：**
```bash
# Fetcherディレクトリに移動
cd fetcher

# 依存関係のインストール
npm install

# 開発用の依存関係（型チェック、リンター等）
npm install --save-dev @types/node typescript ts-node jest @types/jest eslint

# TypeScriptの設定
cat > tsconfig.json << EOF
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*", "cli/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
EOF

# ビルド
npm run build

# 開発モード（ファイル監視付き）
npm run dev

# テスト実行
npm test

# リンター実行
npm run lint
```

**Ingesterの開発環境：**
```bash
# Ingesterディレクトリに移動
cd ingester

# 依存関係のインストール
npm install

# 開発用の依存関係
npm install --save-dev @types/node @types/node-cron typescript ts-node nodemon jest @types/jest

# package.jsonのスクリプト設定
cat > package.json << EOF
{
  "name": "if-hub-ingester",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "nodemon --exec ts-node src/index.ts",
    "test": "jest",
    "lint": "eslint src/**/*.ts",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "js-yaml": "^4.1.0",
    "node-cron": "^3.0.0"
  }
}
EOF

# 開発モード
npm run dev

# ビルド
npm run build

# テスト
npm test
```

#### テスト実行方法

**Fetcherのテスト：**
```typescript
// fetcher/tests/fetcher.test.ts
import { FetcherCore } from '../src/fetcher';
import { MockAPIClient } from './mocks/api-client';

describe('FetcherCore', () => {
  let fetcher: FetcherCore;
  let mockClient: MockAPIClient;

  beforeEach(() => {
    mockClient = new MockAPIClient();
    fetcher = new FetcherCore(mockClient);
  });

  test('should fetch basic tag data', async () => {
    // Mock data setup
    mockClient.mockTagData('Pump01.Temperature', [
      { timestamp: '2023-01-01T00:00:00Z', value: 75.2 },
      { timestamp: '2023-01-01T00:10:00Z', value: 76.1 }
    ]);

    const result = await fetcher.fetchEquipmentData('Pump01', {
      tags: ['Pump01.Temperature']
    });

    expect(result.success).toBe(true);
    expect(result.stats?.totalRecords).toBe(2);
  });

  test('should apply condition filtering', async () => {
    // Test condition-based filtering
    mockClient.mockTagData('Pump01.Temperature', [
      { timestamp: '2023-01-01T00:00:00Z', value: 45.0 },
      { timestamp: '2023-01-01T00:10:00Z', value: 55.0 },
      { timestamp: '2023-01-01T00:20:00Z', value: 48.0 }
    ]);

    const result = await fetcher.fetchEquipmentData('Pump01', {
      tags: ['Pump01.Temperature'],
      onlyWhen: 'Pump01.Temperature > 50'
    });

    expect(result.stats?.filteredRecords).toBe(1);
  });
});
```

**Ingesterのテスト：**
```typescript
// ingester/tests/pi-api-client.test.ts
import { PIApiClient } from '../src/services/pi-api-client';
import nock from 'nock';

describe('PIApiClient', () => {
  let client: PIApiClient;

  beforeEach(() => {
    client = new PIApiClient({
      host: 'test-pi-server',
      port: 3011,
      timeout: 5000,
      maxRetries: 2
    });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test('should fetch time series data successfully', async () => {
    const mockResponse = [
      {
        TagName: 'POW:711034.PV',
        TimeStamp: '2023-01-01T00:00:00Z',
        Value: 123.45,
        Quality: 'Good'
      }
    ];

    nock('http://test-pi-server:3011')
      .get('/PIData')
      .query(true)
      .reply(200, mockResponse);

    const result = await client.fetchTimeSeriesData(
      ['POW:711034.PV'],
      new Date('2023-01-01T00:00:00Z'),
      new Date('2023-01-01T01:00:00Z')
    );

    expect(result).toHaveLength(1);
    expect(result[0].tagName).toBe('POW:711034.PV');
    expect(result[0].value).toBe(123.45);
  });

  test('should retry on network errors', async () => {
    nock('http://test-pi-server:3011')
      .get('/PIData')
      .query(true)
      .replyWithError('Network error')
      .get('/PIData')
      .query(true)
      .reply(200, []);

    const result = await client.fetchTimeSeriesData(
      ['POW:711034.PV'],
      new Date('2023-01-01T00:00:00Z'),
      new Date('2023-01-01T01:00:00Z')
    );

    expect(result).toEqual([]);
  });
});
```

#### デバッグとトラブルシューティング

**Fetcherのデバッグ：**
```typescript
// デバッグモードでの実行
DEBUG=fetcher:* npm run dev

// 詳細ログの有効化
export FETCHER_LOG_LEVEL=debug
./run.sh --equipment Pump01 --verbose

// エラーの詳細確認
./run.sh --equipment Pump01 --tags NonExistentTag 2>&1 | tee debug.log
```

**Ingesterのデバッグ：**
```bash
# ログレベルの設定
export LOG_LEVEL=debug
npm run dev

# Docker環境でのデバッグ
docker logs -f if-hub-pi-ingester

# 状態ファイルの確認
cat logs/ingester-state.json | jq .

# PI-API接続テスト
curl "http://pi-server:3011/PIData?TagNames=TEST&StartDate=20230101000000&EndDate=20230101010000"
```

## テスト方法

### 単体テスト

Jest等のテストフレームワークを使用したテスト例:

```javascript
// utils.test.js
const { getTagMetadata } = require('../src/utils/tag-utils');

// Mock DB responses
jest.mock('../src/db', () => {
  return {
    db: {
      prepare: jest.fn().mockReturnThis(),
      get: jest.fn(),
      all: jest.fn()
    }
  };
});

describe('getTagMetadata', () => {
  it('should return metadata without display_name when display=false', () => {
    const mockTagData = {
      id: 'Pump01.Temperature',
      equipment: 'Pump01',
      name: 'Temperature',
      unit: '°C'
    };
    
    const { db } = require('../src/db');
    db.prepare().get.mockReturnValueOnce(mockTagData);
    
    const result = getTagMetadata('Pump01.Temperature', { display: false });
    
    expect(result).toEqual(mockTagData);
    expect(result.display_name).toBeUndefined();
  });
  
  it('should include display_name when display=true', () => {
    const mockTagData = {
      id: 'Pump01.Temperature',
      equipment: 'Pump01',
      name: 'Temperature',
      unit: '°C'
    };
    
    const mockTranslation = {
      display_name: 'ポンプ01.温度'
    };
    
    const { db } = require('../src/db');
    db.prepare().get
      .mockReturnValueOnce(mockTagData)
      .mockReturnValueOnce(mockTranslation);
    
    const result = getTagMetadata('Pump01.Temperature', { display: true, lang: 'ja' });
    
    expect(result).toEqual({
      ...mockTagData,
      display_name: 'ポンプ01.温度'
    });
  });
});
```

### 統合テスト

SupertestやAxiosを使用したAPIエンドポイントの統合テスト例:

```javascript
// api.test.js
const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const API_URL = 'http://localhost:3001/api';
let server;

// テスト用データの作成
const setupTestData = async () => {
  // テスト用のCSVファイル作成
  const testCsvContent = 
`timestamp,Temperature,Pressure
2023-01-01 00:00:00,75.2,120.5
2023-01-01 00:10:00,76.1,122.1
2023-01-01 00:20:00,75.8,121.7`;

  await fs.outputFile('static_equipment_data/TestEquipment.csv', testCsvContent);
  
  // テスト用のタグメタデータファイル作成
  const testTranslationContent =
`tag_id,display_name
TestEquipment.Temperature,テスト設備.温度
TestEquipment.Pressure,テスト設備.圧力`;

  await fs.outputFile('tag_metadata/translations_test.csv', testTranslationContent);
};

// テスト前の準備
beforeAll(async () => {
  // テストデータをセットアップ
  await setupTestData();
  
  // サーバーを起動
  server = spawn('node', ['src/server.js'], {
    env: { ...process.env, PORT: '3001', NODE_ENV: 'test' }
  });
  
  // サーバーの起動を待機
  await new Promise(resolve => setTimeout(resolve, 3000));
});

// テスト後のクリーンアップ
afterAll(() => {
  // サーバーを終了
  server.kill();
  
  // テストファイルを削除
