# データベース最適化計画：タグIDのINT型への直接変更

## 現状分析

1. **現在の構造と問題点**:
   - `tag_data`テーブルでは、`tag_id`列にテキスト形式の完全なタグID (例: 'sample.POW:7I1032.PV') が格納されています
   - 同一の`tag_id`が何百万レコードにも繰り返し格納され、データベースサイズを圧迫
   - `gtags`テーブルも同様の問題を抱えています

2. **データ重複の具体例**:
   ```sql
   INSERT INTO tag_data VALUES('sample.POW:7I1032.PV','2022-12-31T15:00:00.000Z',12.3);
   INSERT INTO tag_data VALUES('sample.POW:7I1032.PV','2022-12-31T15:01:00.000Z',12.5);
   ```
   同じ文字列`'sample.POW:7I1032.PV'`が何度も格納され、特に数百万レコード存在する場合は大きな無駄となります。

## 改訂版スキーマ設計

1. **tagsテーブルの修正**:
   ```sql
   CREATE TABLE tags (
     id INTEGER PRIMARY KEY AUTOINCREMENT,  -- TEXTからINTEGERに変更
     name TEXT NOT NULL,                    -- 従来のテキスト形式のタグ名を保存
     equipment TEXT NOT NULL,
     source_tag TEXT NOT NULL,
     unit TEXT,
     min REAL,
     max REAL
   )
   ```

2. **tag_dataテーブルの修正**:
   ```sql
   CREATE TABLE tag_data (
     tag_id INTEGER NOT NULL,              -- TEXTからINTEGERに変更
     timestamp TEXT NOT NULL,
     value REAL,
     PRIMARY KEY (tag_id, timestamp),
     FOREIGN KEY (tag_id) REFERENCES tags(id)
   )
   ```

3. **tag_translationsテーブルの修正**:
   ```sql
   CREATE TABLE tag_translations (
     tag_id INTEGER NOT NULL,              -- TEXTからINTEGERに変更
     language TEXT NOT NULL,
     display_name TEXT NOT NULL,
     unit TEXT,
     PRIMARY KEY (tag_id, language),
     FOREIGN KEY (tag_id) REFERENCES tags(id)
   )
   ```

4. **gtagsテーブルの修正**:
   ```sql
   CREATE TABLE gtags (
     id INTEGER PRIMARY KEY AUTOINCREMENT,  -- TEXTからINTEGERに変更
     name TEXT NOT NULL,                    -- 従来のテキスト形式のタグ名を保存
     equipment TEXT NOT NULL,
     description TEXT,
     unit TEXT,
     type TEXT NOT NULL,
     definition TEXT NOT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   )
   ```

## コードの変更点

1. **src/db.js**: スキーマ定義そのものを変更
   ```javascript
   // テーブルの作成
   function initDatabase() {
     // タグメタデータテーブル
     db.exec(`
       CREATE TABLE IF NOT EXISTS tags (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT NOT NULL,               // 従来のテキスト形式のタグIDを保存
         equipment TEXT NOT NULL,
         source_tag TEXT NOT NULL,
         unit TEXT,
         min REAL,
         max REAL
       )
     `);
     
     // 時系列データテーブル
     db.exec(`
       CREATE TABLE IF NOT EXISTS tag_data (
         tag_id INTEGER NOT NULL,
         timestamp TEXT NOT NULL,
         value REAL,
         PRIMARY KEY (tag_id, timestamp),
         FOREIGN KEY (tag_id) REFERENCES tags(id)
       )
     `);
     
     // 同様に他のテーブルも修正
     // ...
   }
   ```

2. **src/utils/csv-importer.js**: タグIDの扱いを変更
   ```javascript
   // タグレコードの挿入方法の変更
   const stmt = db.prepare(`
     INSERT INTO tags (equipment, name, source_tag, unit, min, max)
     VALUES (?, ?, ?, ?, ?, ?)
   `);
   
   const result = stmt.run(
     equipmentId,
     tagName,              // 従来のテキスト形式のタグ名
     header,
     guessUnit(header),
     min,
     max
   );
   
   // 自動採番された整数IDを取得
   const tagId = result.lastInsertRowid;
   
   // タグデータ挿入時に整数IDを使用
   stmtData.run(tagId, point.timestamp, point.value);
   ```

3. **src/routes/data.js, src/routes/tags.js**: API処理を修正
   ```javascript
   // 例：タグデータ取得時の変更
   router.get('/api/data/:tagName', async (req, res) => {
     const { tagName } = req.params;
     
     // タグ名から整数IDを取得
     const tag = db.prepare('SELECT id, name, equipment FROM tags WHERE name = ?').get(tagName);
     
     if (!tag) {
       return res.status(404).json({ error: `Tag ${tagName} not found` });
     }
     
     // 整数IDを使用してデータ取得
     const tagData = db.prepare('SELECT timestamp, value FROM tag_data WHERE tag_id = ?').all(tag.id);
     
     // レスポンスではタグ名を使用
     res.json({
       tagId: tag.name,  // APIの互換性のためにタグ名を返す
       metadata: { /* ... */ },
       data: tagData
     });
   });
   ```

## メタデータ管理の修正

1. **タグメタデータCSVのフォーマット**:
   ```csv
   source_tag,display_name,unit
   POW:7I1032.PV,ボイラー出力,kW
   POW:7I1033.PV,タービン出力,kW
   7F151A.PV,圧力センサー,MPa
   ```
   - 人間が編集しやすいように整数IDは含めず、`source_tag`（実際のタグ名）を識別子として使用
   - 既存のフォーマットとの互換性維持のため、`source_tag`/`sourceTag`と`display_name`/`displayName`の両方の列名をサポート

2. **src/utils/tag-metadata-importer.js**の修正:
   ```javascript
   // メタデータをキャッシュに追加（source_tagをキーとする点は変更なし）
   for (const row of rows) {
     const sourceTag = row.source_tag || row.sourceTag;
     const displayName = row.display_name || row.displayName;
     const unit = row.unit || '';
     
     if (sourceTag && displayName) {
       if (!metadataCache[sourceTag]) {
         metadataCache[sourceTag] = {};
       }
       
       metadataCache[sourceTag][language] = {
         displayName,
         unit
       };
       cacheCount++;
     }
   }
   
   // タグへのメタデータ適用処理（tagIdが整数型に変更されている点に注意）
   function applyMetadataToTag(tagId, sourceTag, language = 'ja') {
     if (!sourceTag || !metadataCache[sourceTag] || !metadataCache[sourceTag][language]) {
       return false;
     }

     try {
       const metadata = metadataCache[sourceTag][language];
       
       const stmt = db.prepare(`
         INSERT OR REPLACE INTO tag_translations (tag_id, language, display_name, unit)
         VALUES (?, ?, ?, ?)
       `);
       
       stmt.run(tagId, language, metadata.displayName, metadata.unit || '');
       return true;
     } catch (error) {
       console.error(`メタデータ適用中にエラーが発生しました: ${error.message}`);
       return false;
     }
   }
   
   // 既存タグへのメタデータ適用処理
   function applyMetadataToExistingTags() {
     try {
       // 既存のタグを取得（idは整数型、source_tagはテキスト型）
       const tags = db.prepare('SELECT id, source_tag FROM tags').all();
       
       for (const tag of tags) {
         // tagIdは整数、source_tagはテキスト
         applyMetadataToTag(tag.id, tag.source_tag);
       }
     } catch (error) {
       console.error('既存タグへのメタデータ適用中にエラーが発生しました:', error);
     }
   }
   ```

## 新しい移行計画

データベースをスクラッチからビルドするため、移行は不要です。新しいスキーマでデータベースを再作成し、CSVからデータを再インポートします。

1. **実装ステップ**:
   ```
   A. 現在のデータベースファイルをバックアップ
   B. 修正されたスキーマ定義でデータベースを新規作成
   C. CSV-importerなどのユーティリティを修正
   D. CSVデータを新しいスキーマに合わせて再インポート
   E. 必要なインデックスを作成してパフォーマンスを最適化
   ```

2. **従来のタグID（テキスト形式）の扱い**:
   - `tags.name`フィールドに保存
   - API応答では従来通りタグ名を返すことで外部互換性を確保
   - 内部処理では整数IDを使用して効率化

## APIの互換性維持

1. **既存APIエンドポイントの動作を維持**:
   - `/api/data/:tagId` などのエンドポイントでは、`:tagId`はテキスト形式のタグ名として解釈
   - 内部的には名前を整数IDに変換してクエリを実行
   - レスポンスでは従来通りタグ名を使用

2. **例：APIエンドポイントの実装例**:
   ```javascript
   // データ取得APIの修正例
   router.get('/api/data/:tagName', async (req, res) => {
     const { tagName } = req.params;
     
     // タグ名から整数IDへのマッピング
     const tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName);
     if (!tag) {
       return res.status(404).json({ error: `Tag ${tagName} not found` });
     }
     
     // 整数IDを使用してクエリを実行
     let query = 'SELECT timestamp, value FROM tag_data WHERE tag_id = ?';
     const params = [tag.id];
     
     // 他のフィルタリング条件...
     
     const data = db.prepare(query).all(...params);
     
     // レスポンスではタグ名を使用（互換性維持）
     res.json({
       tagId: tagName,
       data: data
     });
   });
   ```

## 技術的考慮事項

1. **インデックス戦略**:
   - `tags.name`に対するインデックス（テキスト形式のタグ名検索用）
   - `tags.equipment`に対するインデックス（設備ごとのタグ検索用）
   - `tag_data`テーブルの`(tag_id, timestamp)`複合インデックス

2. **一意性制約の追加**:
   - タグ名の一意性を保証するために`tags.name`に一意性制約を追加

3. **テキスト形式のタグ名と整数IDの相互変換**:
   - 検索やデータアクセス時に頻繁に行われるため、キャッシュやプリペアドステートメントを活用

## メリット

1. **大幅なデータベースサイズの削減**:
   - 長いテキスト形式のタグIDが整数に置き換わることで、`tag_data`テーブルのサイズが劇的に削減
   - 例：1000万レコードの場合、約160MB以上の節約

2. **パフォーマンスの向上**:
   - 整数による結合・フィルタリングは文字列比較より高速
   - インデックスサイズの縮小によるキャッシュ効率の向上

3. **スキーマの簡素化**:
   - 移行用の一時的なカラムが不要で、スキーマがよりクリーン
