// src/utils/tag-metadata-importer.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { db } = require('../db');
const config = require('../config');

// タグメタデータファイルパス
const TRANSLATIONS_PATH = path.join(process.cwd(), 'tag_metadata');

/**
 * タグメタデータをインポート
 */
async function importTagMetadata() {
  try {
    // ディレクトリが存在するか確認
    if (!fs.existsSync(TRANSLATIONS_PATH)) {
      console.log(`タグメタデータディレクトリが見つかりません: ${TRANSLATIONS_PATH}`);
      return;
    }

    // CSVファイル一覧を取得
    const files = fs.readdirSync(TRANSLATIONS_PATH)
      .filter(file => file.endsWith('.csv') && file.includes('translations'));
    
    if (files.length === 0) {
      console.log(`タグメタデータファイルが見つかりません`);
      return;
    }

    console.log(`${files.length}個のタグメタデータファイルを見つけました`);
    
    // トランザクション開始
    db.exec('BEGIN TRANSACTION');
    
    try {
      for (const file of files) {
        const filePath = path.join(TRANSLATIONS_PATH, file);
        console.log(`ファイル ${file} を処理中...`);
        
        // 言語コードをファイル名から抽出（例: translations_ja.csv → ja）
        const langMatch = file.match(/translations_([a-z]{2}(?:[-_][A-Z]{2})?)\.csv/);
        const language = langMatch ? langMatch[1] : 'default';
        
        // CSVを読み込む
        const rows = [];
        await new Promise((resolve, reject) => {
          fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => rows.push(row))
            .on('end', () => {
              console.log(`  ${file} から ${rows.length} 行を読み込みました`);
              resolve();
            })
            .on('error', reject);
        });
        
        // タグメタデータを挿入
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO tag_translations (tag_id, language, display_name, unit)
          VALUES (?, ?, ?, ?)
        `);
        
        let counter = 0;
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
        
        console.log(`  ${counter} 件のタグメタデータを挿入しました（言語: ${language}）`);
      }
      
      db.exec('COMMIT');
      console.log('タグメタデータのインポートが完了しました');
    } catch (error) {
      db.exec('ROLLBACK');
      console.error('タグメタデータのインポート中にエラーが発生しました:', error);
    }
  } catch (error) {
    console.error('タグメタデータのインポート中にエラーが発生しました:', error);
  }
}

module.exports = { importTagMetadata };
