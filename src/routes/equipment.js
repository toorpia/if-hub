// src/routes/equipment.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { getTagsMetadata } = require('../utils/tag-utils');

// 設備一覧
router.get('/api/equipment', (req, res) => {
  const { includeTags = 'false', display = 'false', lang = 'ja', showUnit = 'false', includeGtags = 'true' } = req.query;
  
  try {
    // 設備情報を取得
    const equipment = db.prepare(`
      SELECT equipment as id, equipment as name, COUNT(*) as tagCount
      FROM tags
      GROUP BY equipment
    `).all();
    
    const shouldIncludeTags = includeTags === 'true';
    const shouldIncludeGtags = includeGtags === 'true';
    
    // タグ情報を含める場合
    if (shouldIncludeTags) {
      const shouldDisplay = display === 'true';
      const shouldShowUnit = showUnit === 'true';
      
      // 各設備のタグ情報を取得
      for (const equip of equipment) {
        // 設備に関連するタグを取得
        const tags = db.prepare('SELECT * FROM tags WHERE equipment = ?').all(equip.id);
        
        // 設備に関連するgtagを取得
        let gtags = [];
        if (shouldIncludeGtags) {
          gtags = db.prepare('SELECT * FROM gtags WHERE equipment = ?').all(equip.id);
          
          // gtagをタグ形式に変換
          gtags = gtags.map(gtag => {
            const definition = JSON.parse(gtag.definition);
            return {
              id: gtag.id,
              equipment: gtag.equipment,
              name: gtag.name,
              unit: gtag.unit || '',
              description: gtag.description || '',
              is_gtag: true,
              type: gtag.type
            };
          });
        }
        
        // 通常タグとgtagを結合
        const allTags = [...tags, ...gtags];
        
        // タグに表示名を含める場合
        if (shouldDisplay) {
          const tagIds = tags.map(tag => tag.id);
          const metadataMap = getTagsMetadata(tagIds, {
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
                display_name: metadataMap[tag.id]?.display_name || tag.name,
                unit: metadataMap[tag.id]?.unit || tag.unit
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
