/**
 * Config.yaml順序に基づくタグソート関数
 * 効率的な実装: データベース取得・フィルタリング後の最終段階でソートを適用
 */
const equipmentConfigManager = require('../services/equipment-config-manager');

/**
 * 設備のconfig.yaml順序に基づいてタグをソートする
 * @param {Array} tags - ソート対象のタグ配列
 * @param {string} equipmentName - 設備名
 * @returns {Array} ソート済みタグ配列
 */
const sortTagsByConfigOrder = (tags, equipmentName) => {
  if (!equipmentName || !tags || tags.length === 0) {
    return tags;
  }

  // config.yamlから順序定義を取得
  const sourceTags = equipmentConfigManager.getSourceTags(equipmentName);
  const gtags = equipmentConfigManager.getGtags(equipmentName);
  
  // 順序インデックスマップを作成（一回のみの処理）
  const orderMap = new Map();
  
  // source_tagsの順序インデックス（0から開始）
  sourceTags.forEach((tag, index) => {
    orderMap.set(tag, index);
  });
  
  // gtagsの順序インデックス（source_tagsの後に続く）
  gtags.forEach((tag, index) => {
    orderMap.set(tag, sourceTags.length + index);
  });
  
  // フィルタリング済みタグをconfig.yaml順序でソート
  return tags.sort((a, b) => {
    // タグ名を取得（source_tag > name > nameフィールドの優先順位）
    const tagNameA = a.source_tag || a.name;
    const tagNameB = b.source_tag || b.name;
    
    // 順序インデックスを取得（定義されていない場合はInfinity）
    const orderA = orderMap.get(tagNameA) ?? Infinity;
    const orderB = orderMap.get(tagNameB) ?? Infinity;
    
    return orderA - orderB;
  });
};

/**
 * 複数設備に対応したタグソート関数
 * @param {Array} tags - ソート対象のタグ配列
 * @param {Array|string} equipmentNames - 設備名配列または単一設備名
 * @returns {Array} ソート済みタグ配列
 */
const sortTagsByMultipleEquipmentOrder = (tags, equipmentNames) => {
  if (!equipmentNames || !tags || tags.length === 0) {
    return tags;
  }

  // 単一設備名の場合は配列に変換
  const equipmentList = Array.isArray(equipmentNames) 
    ? equipmentNames 
    : equipmentNames.split(',').map(eq => eq.trim());

  if (equipmentList.length === 1) {
    // 単一設備の場合は通常のソート関数を使用
    return sortTagsByConfigOrder(tags, equipmentList[0]);
  }

  // 複数設備の場合: 最初の設備の順序を基準とする
  // ただし、他の設備でのみ定義されているタグも考慮
  const primaryEquipment = equipmentList[0];
  const allOrderMap = new Map();
  let currentIndex = 0;

  // すべての設備の順序を統合（最初の設備を優先）
  for (const equipmentName of equipmentList) {
    const sourceTags = equipmentConfigManager.getSourceTags(equipmentName);
    const gtags = equipmentConfigManager.getGtags(equipmentName);
    
    [...sourceTags, ...gtags].forEach(tag => {
      if (!allOrderMap.has(tag)) {
        allOrderMap.set(tag, currentIndex++);
      }
    });
  }

  return tags.sort((a, b) => {
    const tagNameA = a.source_tag || a.name;
    const tagNameB = b.source_tag || b.name;
    
    const orderA = allOrderMap.get(tagNameA) ?? Infinity;
    const orderB = allOrderMap.get(tagNameB) ?? Infinity;
    
    return orderA - orderB;
  });
};

/**
 * CSVエクスポート用のタグID順序ソート関数
 * @param {Array} tagIds - タグID配列
 * @param {string} equipmentName - 設備名
 * @param {Map} tagIdToNameMap - タグIDから名前へのマッピング
 * @param {Map} gtagIdToNameMap - gtagIDから名前へのマッピング
 * @returns {Array} ソート済みタグID配列
 */
const sortTagIdsByConfigOrder = (tagIds, equipmentName, tagIdToNameMap, gtagIdToNameMap) => {
  if (!equipmentName || !tagIds || tagIds.length === 0) {
    return tagIds;
  }

  const sourceTags = equipmentConfigManager.getSourceTags(equipmentName);
  const gtags = equipmentConfigManager.getGtags(equipmentName);
  
  const orderMap = new Map();
  
  // source_tagsの順序インデックス
  sourceTags.forEach((tag, index) => {
    orderMap.set(tag, index);
  });
  
  // gtagsの順序インデックス
  gtags.forEach((tag, index) => {
    orderMap.set(tag, sourceTags.length + index);
  });

  return tagIds.sort((a, b) => {
    // タグIDから名前を取得
    const tagNameA = tagIdToNameMap.get(a) || gtagIdToNameMap.get(a);
    const tagNameB = tagIdToNameMap.get(b) || gtagIdToNameMap.get(b);
    
    if (!tagNameA || !tagNameB) {
      return 0; // 名前が取得できない場合は順序を維持
    }
    
    const orderA = orderMap.get(tagNameA) ?? Infinity;
    const orderB = orderMap.get(tagNameB) ?? Infinity;
    
    return orderA - orderB;
  });
};

module.exports = {
  sortTagsByConfigOrder,
  sortTagsByMultipleEquipmentOrder,
  sortTagIdsByConfigOrder
};
