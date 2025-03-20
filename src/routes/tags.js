// src/routes/tags.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { getTagMetadata, getTagsMetadata } = require('../utils/tag-utils');

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
      const tagIds = tags.map(tag => tag.id);
      const metadataMap = getTagsMetadata(tagIds, {
        display: true,
        lang,
        showUnit: showUnit === 'true'
      });
      
      const tagsWithDisplayNames = tags.map(tag => ({
        ...tag,
        display_name: metadataMap[tag.id]?.display_name || tag.name,
        unit: metadataMap[tag.id]?.unit || tag.unit
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
    
    // SQLクエリの構築
    let query = 'SELECT * FROM tags';
    const params = [];
    
    // 設備によるフィルタリング
    if (equipment) {
      // カンマ区切りの値を配列に変換
      const equipmentList = equipment.split(',');
      if (equipmentList.length === 1) {
        // 単一の設備
        query += ' WHERE equipment = ?';
        params.push(equipmentList[0]);
      } else if (equipmentList.length > 1) {
        // 複数の設備（IN句を使用）
        query += ' WHERE equipment IN (' + equipmentList.map(() => '?').join(',') + ')';
        params.push(...equipmentList);
      }
    }
    
    // 通常タグを取得
    const tags = db.prepare(query).all(...params);
    
    // gtagも取得
    let gtags = [];
    if (shouldIncludeGtags) {
      let gtagQuery = 'SELECT * FROM gtags';
      const gtagParams = [];
      
      if (equipment) {
        // 設備フィルタリングを適用
        if (equipment.includes(',')) {
          const equipmentList = equipment.split(',');
          gtagQuery += ' WHERE equipment IN (' + equipmentList.map(() => '?').join(',') + ')';
          gtagParams.push(...equipmentList);
        } else {
          gtagQuery += ' WHERE equipment = ?';
          gtagParams.push(equipment);
        }
      }
      
      gtags = db.prepare(gtagQuery).all(...gtagParams);
      
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
    
    // 通常タグとgtagを統合
    const allTags = [...tags, ...gtags];
    
    // 表示名処理
    if (shouldDisplay) {
      const tagIds = tags.map(tag => tag.id);
      const metadataMap = getTagsMetadata(tagIds, { 
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
            display_name: metadataMap[tag.id]?.display_name || tag.name,
            unit: metadataMap[tag.id]?.unit || tag.unit
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
