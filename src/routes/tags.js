// src/routes/tags.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { getTagMetadata, getTagsMetadata } = require('../utils/tag-utils');

// ===== 設備関連API =====

// 設備一覧取得
router.get('/api/equipment', (req, res) => {
  try {
    // equipment_tagsテーブルから設備一覧を取得
    const equipments = db.prepare(`
      SELECT 
        equipment_name as name,
        COUNT(CASE WHEN tag_type = 'source' THEN 1 END) as source_tag_count,
        COUNT(CASE WHEN tag_type = 'gtag' THEN 1 END) as gtag_count,
        COUNT(*) as total_tag_count
      FROM equipment_tags
      GROUP BY equipment_name
      ORDER BY equipment_name
    `).all();
    
    res.json({ 
      equipments: equipments.map(eq => ({
        name: eq.name,
        sourceTags: eq.source_tag_count,
        gtags: eq.gtag_count,
        totalTags: eq.total_tag_count
      }))
    });
  } catch (error) {
    console.error('設備一覧の取得中にエラーが発生しました:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== タグ関連API =====

// ソースタグ名によるタグの検索
router.get('/api/tags/sourceTag/:sourceTag', (req, res) => {
  const { sourceTag } = req.params;
  const { equipment, display = 'false', lang = 'ja', showUnit = 'false' } = req.query;
  
  try {
    let query = 'SELECT * FROM tags WHERE source_tag = ?';
    const params = [sourceTag];
    
    // 設備IDでフィルタリング
    if (equipment) {
      query += ' AND equipment = ?';
      params.push(equipment);
    }
    
    const tags = db.prepare(query).all(...params);
    
    if (tags.length === 0) {
      return res.json({ 
        sourceTag, 
        tags: [] 
      });
    }
    
    // 表示名を追加
    if (display === 'true') {
      const tagNames = tags.map(tag => tag.name);
      const metadataMap = getTagsMetadata(tagNames, {
        display: true,
        lang,
        showUnit: showUnit === 'true'
      });
      
      const tagsWithDisplayNames = tags.map(tag => ({
        ...tag,
        display_name: metadataMap[tag.name]?.display_name || tag.name,
        unit: metadataMap[tag.name]?.unit || tag.unit
      }));
      
      return res.json({
        sourceTag,
        tags: tagsWithDisplayNames
      });
    }
    
    res.json({
      sourceTag,
      tags
    });
  } catch (error) {
    console.error('ソースタグによるタグ検索中にエラーが発生しました:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 利用可能なタグ一覧
router.get('/api/tags', (req, res) => {
  const { display = 'false', lang = 'ja', showUnit = 'false', equipment, includeGtags = 'true' } = req.query;
  
  try {
    const shouldDisplay = display === 'true';
    const shouldShowUnit = showUnit === 'true';
    const shouldIncludeGtags = includeGtags === 'true';
    
    // 設備フィルタリング用のパラメータ準備
    let equipmentList = [];
    if (equipment) {
      equipmentList = equipment.split(',').map(eq => eq.trim());
    }
    
    // 通常タグの取得（新しいequipment_tagsテーブルを使用）
    let tagsQuery;
    let tagsParams = [];
    
    if (equipmentList.length > 0) {
      // 設備フィルタリング有り
      tagsQuery = `
        SELECT DISTINCT t.*, GROUP_CONCAT(et.equipment_name) as equipments_str
        FROM tags t
        JOIN equipment_tags et ON t.name = et.tag_name AND et.tag_type = 'source'
        WHERE et.equipment_name IN (${equipmentList.map(() => '?').join(',')})
        GROUP BY t.id, t.name, t.source_tag, t.unit, t.min, t.max
      `;
      tagsParams = equipmentList;
    } else {
      // 設備フィルタリング無し（全タグ）
      tagsQuery = `
        SELECT DISTINCT t.*, GROUP_CONCAT(et.equipment_name) as equipments_str
        FROM tags t
        LEFT JOIN equipment_tags et ON t.name = et.tag_name AND et.tag_type = 'source'
        GROUP BY t.id, t.name, t.source_tag, t.unit, t.min, t.max
      `;
    }
    
    const tags = db.prepare(tagsQuery).all(...tagsParams);
    
    // タグに設備情報を追加
    const tagsWithEquipments = tags.map(tag => {
      const equipments = tag.equipments_str ? tag.equipments_str.split(',') : [];
      return {
        id: tag.id,
        name: tag.name,
        equipment: equipments[0] || '', // 後方互換性のため最初の設備名
        equipments: equipments, // 新しいフィールド（配列）
        source_tag: tag.source_tag,
        unit: tag.unit,
        min: tag.min,
        max: tag.max
      };
    });
    
    // gtagも取得
    let gtagsWithEquipments = [];
    if (shouldIncludeGtags) {
      let gtagQuery;
      let gtagParams = [];
      
      if (equipmentList.length > 0) {
        // 設備フィルタリング有り
        gtagQuery = `
          SELECT DISTINCT g.*, GROUP_CONCAT(et.equipment_name) as equipments_str
          FROM gtags g
          JOIN equipment_tags et ON g.name = et.tag_name AND et.tag_type = 'gtag'
          WHERE et.equipment_name IN (${equipmentList.map(() => '?').join(',')})
          GROUP BY g.id, g.name, g.description, g.unit, g.type, g.definition, g.created_at, g.updated_at
        `;
        gtagParams = equipmentList;
      } else {
        // 設備フィルタリング無し
        gtagQuery = `
          SELECT DISTINCT g.*, GROUP_CONCAT(et.equipment_name) as equipments_str
          FROM gtags g
          LEFT JOIN equipment_tags et ON g.name = et.tag_name AND et.tag_type = 'gtag'
          GROUP BY g.id, g.name, g.description, g.unit, g.type, g.definition, g.created_at, g.updated_at
        `;
      }
      
      const gtags = db.prepare(gtagQuery).all(...gtagParams);
      
      // gtagをタグ形式に変換
      gtagsWithEquipments = gtags.map(gtag => {
        const equipments = gtag.equipments_str ? gtag.equipments_str.split(',') : [];
        const definition = gtag.definition ? JSON.parse(gtag.definition) : {};
        
        return {
          id: gtag.id,
          equipment: equipments[0] || '', // 後方互換性
          equipments: equipments, // 新しいフィールド
          name: gtag.name,
          unit: gtag.unit || '',
          description: gtag.description || '',
          is_gtag: true,
          type: gtag.type
        };
      });
    }
    
    // 通常タグとgtagを統合
    const allTags = [...tagsWithEquipments, ...gtagsWithEquipments];
    
    // 表示名処理
    if (shouldDisplay) {
      const tagNames = tagsWithEquipments.map(tag => tag.name);
      const metadataMap = getTagsMetadata(tagNames, { 
        display: true, 
        lang, 
        showUnit: shouldShowUnit 
      });
      
      // 通常タグに表示名を追加
      const tagsWithDisplayNames = allTags.map(tag => {
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
      
      res.json({ tags: tagsWithDisplayNames });
    } else {
      // 通常のタグデータを返す
      res.json({ tags: allTags });
    }
  } catch (error) {
    console.error('タグ一覧の取得中にエラーが発生しました:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== gtag関連API =====

// gtag一覧取得
router.get('/api/gtags', (req, res) => {
  try {
    const gtags = db.prepare('SELECT * FROM gtags').all();
    
    const formattedGtags = gtags.map(gtag => {
      const definition = JSON.parse(gtag.definition);
      return {
        id: gtag.id,
        equipment: gtag.equipment,
        name: gtag.name,
        description: gtag.description || '',
        unit: gtag.unit || '',
        type: gtag.type,
        sourceTags: definition.sourceTags || [],
        createdAt: gtag.created_at,
        updatedAt: gtag.updated_at
      };
    });
    
    res.json({ gtags: formattedGtags });
  } catch (error) {
    console.error('gtag一覧の取得中にエラーが発生しました:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
