// src/utils/tag-utils.js
const { db } = require('../db');

/**
 * タグのメタデータを表示名付きで取得
 * @param {string} tagId - タグID
 * @param {Object} options - オプション
 * @param {boolean} options.display - 表示名を含めるかどうか
 * @param {string} options.lang - 言語コード
 * @returns {Object} タグメタデータ
 */
function getTagMetadata(tagId, options = {}) {
  const { display = false, lang = 'ja' } = options;
  
  // タグのメタデータを取得
  const metadata = db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId);
  
  // タグが存在しないか、表示名が不要な場合はそのまま返す
  if (!metadata || !display) {
    return metadata;
  }
  
  // 表示名を取得
  const translation = db.prepare(
    'SELECT display_name FROM tag_translations WHERE tag_id = ? AND language = ?'
  ).get(tagId, lang);
  
  // 指定言語の表示名がない場合はデフォルト言語を試す
  if (!translation && lang !== 'default') {
    const defaultTranslation = db.prepare(
      'SELECT display_name FROM tag_translations WHERE tag_id = ? AND language = ?'
    ).get(tagId, 'default');
    
    if (defaultTranslation) {
      return {
        ...metadata,
        display_name: defaultTranslation.display_name
      };
    }
  }
  
  // 表示名があれば追加して返す
  if (translation) {
    return {
      ...metadata,
      display_name: translation.display_name
    };
  }
  
  // 表示名がない場合はタグIDをそのまま返す
  return {
    ...metadata,
    display_name: metadata.name
  };
}

/**
 * 複数タグのメタデータをバッチで取得
 * @param {string[]} tagIds - タグIDの配列
 * @param {Object} options - オプション
 * @param {boolean} options.display - 表示名を含めるかどうか
 * @param {string} options.lang - 言語コード
 * @returns {Object} タグIDをキーとするメタデータオブジェクト
 */
function getTagsMetadata(tagIds, options = {}) {
  const result = {};
  
  for (const tagId of tagIds) {
    const metadata = getTagMetadata(tagId, options);
    if (metadata) {
      result[tagId] = metadata;
    }
  }
  
  return result;
}

module.exports = { getTagMetadata, getTagsMetadata };
