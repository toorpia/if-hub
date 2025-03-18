// src/utils/tag-translations-importer.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { db } = require('../db');
const config = require('../config');

// タグ表示名ファイルパス
const TRANSLATIONS_PATH = path.join(process.cwd(), 'translations');

/**
 * タグ表示名をインポート
 */
async function importTagTranslations() {
  try {
    // ディレクトリが存在するか確認
    if (!fs.existsSync(TRANSLATIONS_PATH)) {
      console.log(`タグ表示名ディレクトリが見つかりません: ${TRANSLATIONS_PATH}`);
      return;
    }

    // CSVファイル一覧を取得
    const files = fs.readdirSync(TRANSLATIONS_PATH)
      .filter(file => file.endsWith('.csv') && file.includes('translations'));
    
    if (files.length === 0) {
      console.log(`タグ表示名ファイルが見つかりません`);
      return;
    }

    console.log(`${files.length}個のタグ表示名ファイルを見つけました`);
    
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
        
        // タグ表示名を挿入
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO tag_translations (tag_id, language, display_name)
          VALUES (?, ?, ?)
        `);
        
        let counter = 0;
        for (const row of rows) {
          const tagId = row.tag_id || row.tagId;
          const displayName = row.display_name || row.displayName;
          
          if (tagId && displayName) {
            stmt.run(tagId, language, displayName);
            counter++;
          }
        }
        
        console.log(`  ${counter} 件のタグ表示名を挿入しました（言語: ${language}）`);
      }
      
      db.exec('COMMIT');
      console.log('タグ表示名のインポートが完了しました');
    } catch (error) {
      db.exec('ROLLBACK');
      console.error('タグ表示名のインポート中にエラーが発生しました:', error);
    }
  } catch (error) {
    console.error('タグ表示名のインポート中にエラーが発生しました:', error);
  }
}

module.exports = { importTagTranslations };
