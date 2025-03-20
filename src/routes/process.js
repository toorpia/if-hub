// src/routes/process.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { getTagMetadata } = require('../utils/tag-utils');
const externalProcessor = require('../utils/external-processor');
const { getTimeShiftedData } = require('../utils/time-utils');
const config = require('../config');

// Z-scoreデータの取得エンドポイント
router.get('/api/process/zscore/:tagId', async (req, res) => {
  const { tagId } = req.params;
  const { 
    window, 
    start, 
    end, 
    timeshift = 'false',
    display = 'false',
    lang = 'ja',
    showUnit = 'false'
  } = req.query;
  
  try {
    // タグの存在確認
    const tagExists = db.prepare('SELECT COUNT(*) as count FROM tags WHERE id = ?').get(tagId).count > 0;
    
    if (!tagExists) {
      return res.status(404).json({ error: `Tag ${tagId} not found` });
    }
    
    // タグのメタデータを取得（表示名オプション付き）
    const metadata = getTagMetadata(tagId, {
      display: display === 'true',
      lang,
      showUnit: showUnit === 'true'
    });
    
    // タグデータを取得
    let query = 'SELECT timestamp, value FROM tag_data WHERE tag_id = ?';
    const params = [tagId];
    
    if (start) {
      query += ' AND timestamp >= ?';
      params.push(new Date(start).toISOString());
    }
    
    if (end) {
      query += ' AND timestamp <= ?';
      params.push(new Date(end).toISOString());
    }
    
    query += ' ORDER BY timestamp';
    
    // レコード数の上限を適用
    query += ` LIMIT ${config.api.maxRecordsPerRequest}`;
    
    const tagData = db.prepare(query).all(...params);
    
    if (tagData.length === 0) {
      return res.json({
        tagId,
        metadata,
        processType: 'zscore',
        windowSize: window ? parseInt(window, 10) : null,
        data: []
      });
    }
    
    // 外部プロセッサでZ-scoreを計算
    const processedData = await externalProcessor.calculateZScore(tagData, {
      windowSize: window ? parseInt(window, 10) : null,
      timeshift: timeshift === 'true'
    });
    
    // タイムシフトが必要な場合は別途適用
    let finalData = processedData;
    if (timeshift === 'true') {
      finalData = getTimeShiftedData(processedData, true);
    }
    
    res.json({
      tagId,
      metadata,
      processType: 'zscore',
      windowSize: window ? parseInt(window, 10) : null,
      data: finalData
    });
  } catch (error) {
    console.error('Z-scoreの計算中にエラーが発生しました:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message
    });
  }
});

// 偏差データの取得エンドポイント
router.get('/api/process/deviation/:tagId', async (req, res) => {
  const { tagId } = req.params;
  const { 
    window, 
    start, 
    end, 
    timeshift = 'false',
    display = 'false',
    lang = 'ja',
    showUnit = 'false'
  } = req.query;
  
  try {
    // タグの存在確認
    const tagExists = db.prepare('SELECT COUNT(*) as count FROM tags WHERE id = ?').get(tagId).count > 0;
    
    if (!tagExists) {
      return res.status(404).json({ error: `Tag ${tagId} not found` });
    }
    
    // タグのメタデータを取得（表示名オプション付き）
    const metadata = getTagMetadata(tagId, {
      display: display === 'true',
      lang,
      showUnit: showUnit === 'true'
    });
    
    // タグデータを取得
    let query = 'SELECT timestamp, value FROM tag_data WHERE tag_id = ?';
    const params = [tagId];
    
    if (start) {
      query += ' AND timestamp >= ?';
      params.push(new Date(start).toISOString());
    }
    
    if (end) {
      query += ' AND timestamp <= ?';
      params.push(new Date(end).toISOString());
    }
    
    query += ' ORDER BY timestamp';
    
    // レコード数の上限を適用
    query += ` LIMIT ${config.api.maxRecordsPerRequest}`;
    
    const tagData = db.prepare(query).all(...params);
    
    if (tagData.length === 0) {
      return res.json({
        tagId,
        metadata,
        processType: 'deviation',
        windowSize: window ? parseInt(window, 10) : null,
        data: []
      });
    }
    
    // 外部プロセッサで偏差を計算
    const processedData = await externalProcessor.calculateDeviation(tagData, {
      windowSize: window ? parseInt(window, 10) : null,
      timeshift: timeshift === 'true'
    });
    
    // タイムシフトが必要な場合は別途適用
    let finalData = processedData;
    if (timeshift === 'true') {
      finalData = getTimeShiftedData(processedData, true);
    }
    
    res.json({
      tagId,
      metadata,
      processType: 'deviation',
      windowSize: window ? parseInt(window, 10) : null,
      data: finalData
    });
  } catch (error) {
    console.error('偏差の計算中にエラーが発生しました:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message
    });
  }
});

// 移動平均データの取得エンドポイント
router.get('/api/process/ma/:tagId', async (req, res) => {
  const { tagId } = req.params;
  const { 
    window = 5, 
    start, 
    end, 
    timeshift = 'false',
    display = 'false',
    lang = 'ja',
    showUnit = 'false'
  } = req.query;
  
  try {
    // タグの存在確認
    const tagExists = db.prepare('SELECT COUNT(*) as count FROM tags WHERE id = ?').get(tagId).count > 0;
    
    if (!tagExists) {
      return res.status(404).json({ error: `Tag ${tagId} not found` });
    }
    
    // タグのメタデータを取得（表示名オプション付き）
    const metadata = getTagMetadata(tagId, {
      display: display === 'true',
      lang,
      showUnit: showUnit === 'true'
    });
    
    // タグデータを取得
    let query = 'SELECT timestamp, value FROM tag_data WHERE tag_id = ?';
    const params = [tagId];
    
    if (start) {
      query += ' AND timestamp >= ?';
      params.push(new Date(start).toISOString());
    }
    
    if (end) {
      query += ' AND timestamp <= ?';
      params.push(new Date(end).toISOString());
    }
    
    query += ' ORDER BY timestamp';
    
    const tagData = db.prepare(query).all(...params);
    
    if (tagData.length === 0) {
      return res.json({
        tagId,
        metadata,
        processType: 'moving_average',
        windowSize: parseInt(window, 10),
        data: []
      });
    }
    
    // 外部プロセッサで移動平均を計算
    const processedData = await externalProcessor.movingAverage(tagData, {
      windowSize: parseInt(window, 10),
      timeshift: timeshift === 'true'
    });
    
    // タイムシフトが必要な場合は別途適用
    let finalData = processedData;
    if (timeshift === 'true') {
      finalData = getTimeShiftedData(processedData, true);
    }
    
    res.json({
      tagId,
      metadata,
      processType: 'moving_average',
      windowSize: parseInt(window, 10),
      data: finalData
    });
  } catch (error) {
    console.error('移動平均の計算中にエラーが発生しました:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message
    });
  }
});

module.exports = router;
