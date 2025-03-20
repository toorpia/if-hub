// src/routes/system.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const config = require('../config');

// システム情報
router.get('/api/system/info', (req, res) => {
  try {
    // タグ数の取得
    const tagCount = db.prepare('SELECT COUNT(*) as count FROM tags').get().count;
    
    // 設備数の取得
    const equipmentCount = db.prepare('SELECT COUNT(DISTINCT equipment) as count FROM tags').get().count;
    
    res.json({
      name: 'IndustryFlow Hub',
      version: '1.0.0',
      tagCount,
      equipmentCount,
      environment: config.environment,
      storage: 'SQLite database'
    });
  } catch (error) {
    console.error('システム情報の取得中にエラーが発生しました:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ステータスエンドポイント（ヘルスチェック用）
router.get('/api/status', (req, res) => {
  try {
    // タグ数の取得
    const tagCount = db.prepare('SELECT COUNT(*) as count FROM tags').get().count;
    
    // 設備数の取得
    const equipmentCount = db.prepare('SELECT COUNT(DISTINCT equipment) as count FROM tags').get().count;
    
    // データポイント数の取得
    const dataPointCount = db.prepare('SELECT COUNT(*) as count FROM tag_data').get().count;
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.environment,
      database: {
        type: 'SQLite',
        tags: tagCount,
        equipment: equipmentCount,
        dataPoints: dataPointCount
      }
    });
  } catch (error) {
    console.error('ステータスの取得中にエラーが発生しました:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

module.exports = router;
