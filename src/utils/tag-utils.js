// src/utils/tag-utils.js
const { db } = require('../db');

/**
 * タグのメタデータを表示名付きで取得
 * @param {string} tagId - タグID
 * @param {Object} options - オプション
 * @param {boolean} options.display - 表示名を含めるかどうか
 * @param {string} options.lang - 言語コード
 * @param {boolean} options.showUnit - 単位を表示名と結合して表示するかどうか
 * @returns {Object} タグメタデータ
 */
function getTagMetadata(tagId, options = {}) {
  const { display = false, lang = 'ja', showUnit = false } = options;
  
  // タグのメタデータを取得
  const metadata = db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId);
  
  // タグが存在しないか、表示名が不要な場合はそのまま返す
  if (!metadata || !display) {
    return metadata;
  }
  
  // 表示名と単位を取得
  const translation = db.prepare(
    'SELECT display_name, unit FROM tag_translations WHERE tag_id = ? AND language = ?'
  ).get(tagId, lang);
  
  // 指定言語の表示名がない場合はデフォルト言語を試す
  if (!translation && lang !== 'default') {
    const defaultTranslation = db.prepare(
      'SELECT display_name, unit FROM tag_translations WHERE tag_id = ? AND language = ?'
    ).get(tagId, 'default');
    
    if (defaultTranslation) {
      // 単位を含めるかどうかで表示名を決定
      const displayName = showUnit && defaultTranslation.unit 
        ? `${defaultTranslation.display_name} (${defaultTranslation.unit})`
        : defaultTranslation.display_name;
        
      return {
        ...metadata,
        display_name: displayName,
        unit: defaultTranslation.unit || metadata.unit
      };
    }
  }
  
  // 表示名があれば追加して返す
  if (translation) {
    // 単位を含めるかどうかで表示名を決定
    const displayName = showUnit && translation.unit 
      ? `${translation.display_name} (${translation.unit})`
      : translation.display_name;
      
    return {
      ...metadata,
      display_name: displayName,
      unit: translation.unit || metadata.unit
    };
  }
  
  // 表示名がない場合はタグIDをそのまま返す
  return {
    ...metadata,
    display_name: metadata.name
  };
}

/**
 * 重複する表示名にsuffixを追加
 * @param {Object} metadataMap - タグIDをキーとするメタデータオブジェクト
 * @returns {Object} 重複表示名にsuffixが追加されたメタデータオブジェクト
 */
function addSuffixToDuplicateDisplayNames(metadataMap) {
  // 表示名ごとのタグIDリストを作成
  const displayNameMapping = {};
  
  // 最初に全ての表示名を収集
  for (const tagId in metadataMap) {
    const displayName = metadataMap[tagId].display_name;
    if (!displayNameMapping[displayName]) {
      displayNameMapping[displayName] = [];
    }
    displayNameMapping[displayName].push(tagId);
  }
  
  // 重複している表示名にsuffixを追加
  for (const displayName in displayNameMapping) {
    const tagIds = displayNameMapping[displayName];
    if (tagIds.length > 1) {
      // 重複あり - 2つ目以降にsuffixを追加
      for (let i = 1; i < tagIds.length; i++) {
        metadataMap[tagIds[i]].display_name = `${displayName}_${i}`;
      }
    }
  }
  
  return metadataMap;
}

/**
 * 複数タグのメタデータをバッチで取得
 * @param {string[]} tagIds - タグIDの配列
 * @param {Object} options - オプション
 * @param {boolean} options.display - 表示名を含めるかどうか
 * @param {string} options.lang - 言語コード
 * @param {boolean} options.showUnit - 単位を表示名と結合して表示するかどうか
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
  
  // 表示名が必要な場合、重複チェックを行い必要に応じてsuffixを追加
  if (options.display === true) {
    return addSuffixToDuplicateDisplayNames(result);
  }
  
  return result;
}

module.exports = { getTagMetadata, getTagsMetadata };
