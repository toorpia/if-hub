// src/routes/gtags.js
const express = require('express');
const router = express.Router();
const { get } = require('../db');
const { getTagMetadata } = require('../utils/tag-utils');
const { getGtagData, executeProcess } = require('../utils/gtag-utils');
const { getTimeShiftedData } = require('../utils/time-utils');
const config = require('../config');

/**
 * 単一のgtagデータを取得するエンドポイント
 */
router.get('/api/gtags/:name', async (req, res) => {
  const { name } = req.params;
  const {
    start,
    end,
    timeshift = 'false',
    display = 'false',
    lang = 'ja',
    showUnit = 'false',
    params = '{}'
  } = req.query;

  try {
    // gtagの存在確認
    const gtag = await get('SELECT * FROM gtags WHERE name = $1', [name]);
    
    if (!gtag) {
      return res.status(404).json({ error: `gtag ${name} not found` });
    }
    
    // パラメータの解析
    let processParams = {};
    try {
      processParams = JSON.parse(params);
    } catch (error) {
      console.warn('パラメータの解析に失敗しました。デフォルト値を使用します:', error);
    }
    
    // gtagデータを取得
    const options = { start, end };
    const gtagData = await getGtagData(gtag, options);
    
    if (!gtagData || gtagData.length === 0) {
      return res.json({
        name,
        type: gtag.type,
        data: []
      });
    }
    
    // タイムシフトが必要な場合は適用
    let finalData = gtagData;
    if (timeshift === 'true') {
      finalData = getTimeShiftedData(gtagData, true);
    }
    
    // メタデータの取得
    const metadata = {
      description: gtag.description || '',
      unit: gtag.unit || '',
      equipment: gtag.equipment || ''
    };
    
    // 応答を構築
    res.json({
      name,
      type: gtag.type,
      metadata,
      data: finalData
    });
  } catch (error) {
    console.error(`gtagデータの取得中にエラーが発生しました (${name}):`, error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message
    });
  }
});

/**
 * 動的プロセス実行エンドポイント
 */
router.get('/api/process/:target', async (req, res) => {
  const { target } = req.params;
  const { 
    type = 'raw', 
    start, 
    end, 
    window,
    timeshift = 'false',
    display = 'false',
    lang = 'ja',
    showUnit = 'false'
  } = req.query;
  
  try {
    // パラメータの構築
    const params = { window: window ? parseInt(window, 10) : undefined };
    const options = { start, end };
    
    // プロセスを実行
    const processedData = await executeProcess(target, type, params, options);
    
    if (!processedData || processedData.length === 0) {
      return res.json({
        target,
        type,
        data: []
      });
    }
    
    // タイムシフトが必要な場合は適用
    let finalData = processedData;
    if (timeshift === 'true') {
      finalData = getTimeShiftedData(processedData, true);
    }
    
    // メタデータの取得（表示名オプション付き）
    const metadata = await getTagMetadata(target, {
      display: display === 'true',
      lang,
      showUnit: showUnit === 'true'
    });
    
    // 応答を構築
    res.json({
      target,
      type,
      metadata,
      data: finalData
    });
  } catch (error) {
    console.error(`プロセス実行中にエラーが発生しました (${target}, ${type}):`, error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message
    });
  }
});

module.exports = router;
