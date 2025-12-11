// src/utils/tag-utils.js
const { get } = require('../db');

/**
 * タグ名から整数IDを取得
 * @param {string} tagName - タグ名
 * @returns {Promise<number|null>} 整数ID（存在しない場合はnull）
 */
async function getTagIdFromName(tagName) {
  const tag = await get('SELECT id FROM tags WHERE name = $1', [tagName]);
  return tag ? tag.id : null;
}

/**
 * タグのメタデータを表示名付きで取得
 * @param {string} tagName - タグ名（APIでの参照に使用）
 * @param {Object} options - オプション
 * @param {boolean} options.display - 表示名を含めるかどうか
 * @param {string} options.lang - 言語コード
 * @param {boolean} options.showUnit - 単位を表示名と結合して表示するかどうか
 * @returns {Promise<Object>} タグメタデータ
 */
async function getTagMetadata(tagName, options = {}) {
  const { display = false, lang = 'ja', showUnit = false } = options;

  // タグ名から整数IDを取得してメタデータを取得
  const metadata = await get('SELECT * FROM tags WHERE name = $1', [tagName]);

  // タグが存在しないか、表示名が不要な場合はそのまま返す
  if (!metadata || !display) {
    return metadata;
  }

  // 表示名と単位を取得（この時点でmetadata.idは整数型）
  const translation = await get(
    'SELECT display_name, unit FROM tag_translations WHERE tag_id = $1 AND language = $2',
    [metadata.id, lang]
  );

  // 指定言語の表示名がない場合はデフォルト言語を試す
  if (!translation && lang !== 'default') {
    const defaultTranslation = await get(
      'SELECT display_name, unit FROM tag_translations WHERE tag_id = $1 AND language = $2',
      [metadata.id, 'default']
    );

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
 * @param {string[]} tagNames - タグ名の配列
 * @param {Object} options - オプション
 * @param {boolean} options.display - 表示名を含めるかどうか
 * @param {string} options.lang - 言語コード
 * @param {boolean} options.showUnit - 単位を表示名と結合して表示するかどうか
 * @returns {Promise<Object>} タグ名をキーとするメタデータオブジェクト
 */
async function getTagsMetadata(tagNames, options = {}) {
  const result = {};

  for (const tagName of tagNames) {
    const metadata = await getTagMetadata(tagName, options);
    if (metadata) {
      result[tagName] = metadata;
    }
  }

  // 表示名が必要な場合、重複チェックを行い必要に応じてsuffixを追加
  if (options.display === true) {
    return addSuffixToDuplicateDisplayNames(result);
  }

  return result;
}

module.exports = { getTagIdFromName, getTagMetadata, getTagsMetadata };
