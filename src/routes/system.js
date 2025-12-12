// src/routes/system.js
const express = require('express');
const router = express.Router();
const { get } = require('../db');
const config = require('../config');

// システム情報
router.get('/api/system/info', async (req, res) => {
  try {
    // タグ数の取得
    const tagCountResult = await get('SELECT COUNT(*) as count FROM tags');
    const tagCount = parseInt(tagCountResult.count);

    // 設備数の取得 (equipment列は削除されたため、常に0を返す)
    const equipmentCount = 0;
    
    res.json({
      name: 'IndustryFlow Hub',
      version: '1.0.0',
      tagCount,
      equipmentCount,
      environment: config.environment,
      storage: 'TimescaleDB (PostgreSQL)'
    });
  } catch (error) {
    console.error('システム情報の取得中にエラーが発生しました:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ステータスエンドポイント（ヘルスチェック用）
router.get('/api/status', async (req, res) => {
  try {
    // タグ数の取得
    const tagCountResult = await get('SELECT COUNT(*) as count FROM tags');
    const tagCount = parseInt(tagCountResult.count);

    // 設備数の取得 (equipment列は削除されたため、常に0を返す)
    const equipmentCount = 0;

    // データポイント数の取得
    const dataPointCountResult = await get('SELECT COUNT(*) as count FROM tag_data');
    const dataPointCount = parseInt(dataPointCountResult.count);

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.environment,
      database: {
        type: 'TimescaleDB (PostgreSQL)',
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
