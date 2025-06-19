// src/routes/tags.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { getTagMetadata, getTagsMetadata } = require('../utils/tag-utils');
const equipmentConfigManager = require('../services/equipment-config-manager');
const { sortTagsByConfigOrder, sortTagsByMultipleEquipmentOrder } = require('../utils/config-order-sort');

// ===== タグ関連API =====

// ソースタグ名によるタグの検索
router.get('/api/tags/sourceTag/:sourceTag', (req, res) => {
  const { sourceTag } = req.params;
  const { equipment, display = 'false', lang = 'ja', showUnit = 'false' } = req.query;
  
  try {
    // 全タグを取得
    const allTags = db.prepare('SELECT * FROM tags WHERE source_tag = ?').all(sourceTag);
    
    // 設備フィルタリング（config.yamlベース）
    let filteredTags = allTags;
    if (equipment) {
      const equipmentList = equipment.split(',').map(eq => eq.trim());
      const allowedSourceTags = new Set();
      
      equipmentList.forEach(equipmentName => {
        const sourceTags = equipmentConfigManager.getSourceTags(equipmentName);
        sourceTags.forEach(tag => allowedSourceTags.add(tag));
      });
      
      filteredTags = allTags.filter(tag => 
        allowedSourceTags.has(tag.source_tag || tag.name)
      );
    }
    
    if (filteredTags.length === 0) {
      return res.json({ 
        sourceTag, 
        tags: [] 
      });
    }
    
    // 設備情報を追加
    let tagsWithEquipments = filteredTags.map(tag => {
      const equipments = equipmentConfigManager.getEquipmentsUsingSourceTag(tag.source_tag || tag.name);
      
      return {
        ...tag,
        equipments: equipments
      };
    });
    
    // config.yaml順序でソート（設備フィルタリング時のみ）
    if (equipment) {
      tagsWithEquipments = sortTagsByMultipleEquipmentOrder(tagsWithEquipments, equipment);
    }
    
    // 表示名を追加
    if (display === 'true') {
      const tagNames = tagsWithEquipments.map(tag => tag.name);
      const metadataMap = getTagsMetadata(tagNames, {
        display: true,
        lang,
        showUnit: showUnit === 'true'
      });
      
      const tagsWithDisplayNames = tagsWithEquipments.map(tag => ({
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
      tags: tagsWithEquipments
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
    
    // 全タグを取得
    const allSourceTags = db.prepare('SELECT * FROM tags').all();
    const allGtags = shouldIncludeGtags ? db.prepare('SELECT * FROM gtags').all() : [];
    
    // 設備フィルタリング
    let filteredSourceTags = allSourceTags;
    let filteredGtags = allGtags;
    
    if (equipment) {
      const equipmentList = equipment.split(',').map(eq => eq.trim());
      
      // 複数設備での統合フィルタリング
      const allowedSourceTags = new Set();
      const allowedGtags = new Set();
      
      equipmentList.forEach(equipmentName => {
        const sourceTags = equipmentConfigManager.getSourceTags(equipmentName);
        const gtags = equipmentConfigManager.getGtags(equipmentName);
        
        sourceTags.forEach(tag => allowedSourceTags.add(tag));
        gtags.forEach(gtag => allowedGtags.add(gtag));
      });
      
      // フィルタリング実行
      filteredSourceTags = allSourceTags.filter(tag => 
        allowedSourceTags.has(tag.source_tag || tag.name)
      );
      
      filteredGtags = allGtags.filter(gtag => 
        allowedGtags.has(gtag.name)
      );
    }
    
    // source tagsに設備情報を追加
    const tagsWithEquipments = filteredSourceTags.map(tag => {
      const equipments = equipmentConfigManager.getEquipmentsUsingSourceTag(tag.source_tag || tag.name);
      
      return {
        id: tag.id,
        name: tag.name,
        equipments: equipments, // 設備横断対応の配列
        source_tag: tag.source_tag,
        unit: tag.unit,
        min: tag.min,
        max: tag.max
      };
    });
    
    // gtagsに設備情報を追加
    const gtagsWithEquipments = filteredGtags.map(gtag => {
      const equipments = equipmentConfigManager.getEquipmentsUsingGtag(gtag.name);
      
      return {
        id: gtag.id,
        equipments: equipments, // 設備横断対応の配列
        name: gtag.name,
        unit: gtag.unit || '',
        description: gtag.description || '',
        is_gtag: true,
        type: gtag.type
      };
    });
    
    // 通常タグとgtagを統合
    let allTags = [...tagsWithEquipments, ...gtagsWithEquipments];
    
    // config.yaml順序でソート（設備フィルタリング時のみ）
    if (equipment) {
      allTags = sortTagsByMultipleEquipmentOrder(allTags, equipment);
    }
    
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
      const equipments = equipmentConfigManager.getEquipmentsUsingGtag(gtag.name);
      
      return {
        id: gtag.id,
        equipments: equipments, // 設備横断対応の配列
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
