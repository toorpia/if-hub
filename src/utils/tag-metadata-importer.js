// src/utils/tag-metadata-importer.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { db } = require('../db');
const config = require('../config');

// タグメタデータファイルパス
const TRANSLATIONS_PATH = path.join(process.cwd(), 'tag_metadata');

// メタデータキャッシュ（source_tagをキーとする）
let metadataCache = {};

/**
 * メタデータキャッシュを初期化
 */
function initMetadataCache() {
  metadataCache = {};
}

/**
 * タグが登録されたときにメタデータを適用
 * @param {number} tagId タグID（整数型）
 * @param {string} sourceTag ソースタグ
 * @param {string} language 言語コード
 * @returns {boolean} メタデータが適用されたかどうか
 */
function applyMetadataToTag(tagId, sourceTag, language = 'ja') {
  if (!sourceTag || !metadataCache[sourceTag] || !metadataCache[sourceTag][language]) {
    return false;
  }

  try {
    const metadata = metadataCache[sourceTag][language];
    console.log(`タグID ${tagId} にキャッシュされたメタデータを適用します: ${JSON.stringify(metadata)}`);
    
    // tag_idは整数型になっていることに注意
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

/**
 * タグメタデータCSVの読み込みとキャッシュ
 */
async function loadAndCacheMetadata() {
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
    
    // メタデータキャッシュをクリア
    initMetadataCache();
    
    // 各ファイルを処理
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
      
      // メタデータをキャッシュに追加
      let cacheCount = 0;
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
      
      console.log(`  ${cacheCount} 件のメタデータをキャッシュしました（言語: ${language}）`);
      
      // キャッシュの一部をデバッグ表示
      const cacheKeys = Object.keys(metadataCache);
      if (cacheKeys.length > 0) {
        console.log(`  キャッシュサンプル: ${cacheKeys[0]} => ${JSON.stringify(metadataCache[cacheKeys[0]])}`);
      }
    }
    
    console.log('タグメタデータのキャッシュが完了しました');
    
    // 既存タグに対してメタデータを適用
    applyMetadataToExistingTags();
  } catch (error) {
    console.error('タグメタデータの読み込み中にエラーが発生しました:', error);
  }
}

/**
 * 既存タグに対してメタデータを適用
 */
function applyMetadataToExistingTags() {
  try {
    // 既存のタグを取得
    const tags = db.prepare('SELECT id, source_tag FROM tags').all();
    let appliedCount = 0;
    
    console.log(`${tags.length} 件の既存タグにメタデータを適用します...`);
    
    for (const tag of tags) {
      if (applyMetadataToTag(tag.id, tag.source_tag)) {
        appliedCount++;
      }
    }
    
    console.log(`${appliedCount} 件のタグにメタデータを適用しました`);
  } catch (error) {
    console.error('既存タグへのメタデータ適用中にエラーが発生しました:', error);
  }
}

/**
 * タグメタデータをインポート
 * 注: このメソッドは後方互換性のために残しています
 */
async function importTagMetadata() {
  await loadAndCacheMetadata();
}

/**
 * メタデータキャッシュを取得
 * @returns {Object} メタデータキャッシュ
 */
function getMetadataCache() {
  return metadataCache;
}

module.exports = { 
  importTagMetadata, 
  loadAndCacheMetadata, 
  applyMetadataToTag,
  getMetadataCache
};
