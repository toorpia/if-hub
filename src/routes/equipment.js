// src/routes/equipment.js
const express = require('express');
const router = express.Router();
const { get } = require('../db');
const { getTagsMetadata } = require('../utils/tag-utils');
const equipmentConfigManager = require('../services/equipment-config-manager');
const { sortTagsByConfigOrder } = require('../utils/config-order-sort');

// 設備一覧
router.get('/api/equipment', async (req, res) => {
  const { includeTags = 'false', display = 'false', lang = 'ja', showUnit = 'false', includeGtags = 'true' } = req.query;
  
  try {
    // 設定ファイルの変更チェック・自動リロード
    equipmentConfigManager.checkAndReloadIfNeeded();
    
    // config.yamlから設備情報を取得
    const equipmentNames = equipmentConfigManager.getAllEquipments();
    const equipment = equipmentNames.map(name => {
      const sourceTags = equipmentConfigManager.getSourceTags(name);
      const gtags = equipmentConfigManager.getGtags(name);
      
      return {
        id: name,
        name,
        sourceTags: sourceTags.length,
        gtags: gtags.length,
        totalTags: sourceTags.length + gtags.length
      };
    });
    
    const shouldIncludeTags = includeTags === 'true';
    const shouldIncludeGtags = includeGtags === 'true';
    
    // タグ情報を含める場合
    if (shouldIncludeTags) {
      const shouldDisplay = display === 'true';
      const shouldShowUnit = showUnit === 'true';
      
      // 各設備のタグ情報を取得
      for (const equip of equipment) {
        const equipmentName = equip.id;
        
        // config.yamlから設備に関連するタグを取得
        const sourceTagNames = equipmentConfigManager.getSourceTags(equipmentName);
        const gtagNames = shouldIncludeGtags ? equipmentConfigManager.getGtags(equipmentName) : [];
        
        // 通常タグをデータベースから取得
        const tags = [];
        for (const tagName of sourceTagNames) {
          const tag = await get('SELECT * FROM tags WHERE source_tag = $1 OR name = $1', [tagName]);
          if (tag) {
            // 設備情報を追加
            const equipments = equipmentConfigManager.getEquipmentsUsingSourceTag(tag.source_tag || tag.name);
            tags.push({
              ...tag,
              equipments: equipments
            });
          }
        }

        // gtagをデータベースから取得
        let gtags = [];
        for (const gtagName of gtagNames) {
          const gtag = await get('SELECT * FROM gtags WHERE name = $1', [gtagName]);
          if (gtag) {
            const definition = JSON.parse(gtag.definition);
            const equipments = equipmentConfigManager.getEquipmentsUsingGtag(gtag.name);
            gtags.push({
              id: gtag.id,
              equipments: equipments,
              name: gtag.name,
              unit: gtag.unit || '',
              description: gtag.description || '',
              is_gtag: true,
              type: gtag.type
            });
          }
        }
        
        // 通常タグとgtagを結合
        let allTags = [...tags, ...gtags];
        
        // config.yaml順序でソート
        allTags = sortTagsByConfigOrder(allTags, equipmentName);
        
        // タグに表示名を含める場合
        if (shouldDisplay) {
          const tagNames = tags.map(tag => tag.name);
          const metadataMap = await getTagsMetadata(tagNames, {
            display: true,
            lang,
            showUnit: shouldShowUnit
          });
          
          // タグデータに表示名を設定
          equip.tags = allTags.map(tag => {
            if (tag.is_gtag) {
              // gtagの場合
              return {
                ...tag,
                display_name: tag.description || tag.name
              };
            } else {
              // 通常タグの場合
              return {
                ...tag,
                display_name: metadataMap[tag.name]?.display_name || tag.name,
                unit: metadataMap[tag.name]?.unit || tag.unit
              };
            }
          });
        } else {
          equip.tags = allTags;
        }
      }
    }
    
    res.json({ equipment });
  } catch (error) {
    console.error('設備一覧の取得中にエラーが発生しました:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
