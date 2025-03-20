// src/routes/data.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { getTagMetadata, getTagsMetadata } = require('../utils/tag-utils');
const { getGtagData } = require('../utils/gtag-utils');
const { getTimeShiftedData } = require('../utils/time-utils');
const config = require('../config');

// 特定タグのデータ取得
router.get('/api/data/:tagId', async (req, res) => {
  const { tagId } = req.params;
  const { start, end, timeshift, display = 'false', lang = 'ja', showUnit = 'false' } = req.query;
  
  try {
    // タグが通常タグかgtagかチェック
    const tagExists = db.prepare('SELECT COUNT(*) as count FROM tags WHERE id = ?').get(tagId).count > 0;
    const gtagExists = db.prepare('SELECT COUNT(*) as count FROM gtags WHERE id = ?').get(tagId).count > 0;
    
    // タグもgtagも存在しない場合
    if (!tagExists && !gtagExists) {
      return res.status(404).json({ error: `Tag ${tagId} not found` });
    }
    
    const shouldTimeShift = timeshift === 'true';
    
    // gtagの場合
    if (gtagExists) {
      // gtagの定義を取得
      const gtag = db.prepare('SELECT * FROM gtags WHERE id = ?').get(tagId);
      const definition = JSON.parse(gtag.definition);
      
      // メタデータを構築
      const metadata = {
        id: gtag.id,
        equipment: gtag.equipment,
        name: gtag.name,
        unit: gtag.unit || '',
        description: gtag.description || '',
        is_gtag: true,
        type: gtag.type
      };
      
      if (display === 'true') {
        metadata.display_name = gtag.description || gtag.name;
      }
      
      // gtagのデータを計算
      const gtagData = await getGtagData(gtag, { start, end });
      
      // タイムシフトを適用
      const processedData = shouldTimeShift ? getTimeShiftedData(gtagData, true) : gtagData;
      
      return res.json({
        tagId,
        metadata,
        data: processedData
      });
    }
    
    // 通常タグの場合
    // タグのメタデータを取得（表示名オプション付き）
    const metadata = getTagMetadata(tagId, {
      display: display === 'true',
      lang,
      showUnit: showUnit === 'true'
    });
    
    // 時間範囲のフィルタリング
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
    
    // タイムシフトを適用
    const processedData = shouldTimeShift ? getTimeShiftedData(tagData, true) : tagData;
    
    res.json({
      tagId,
      metadata,
      data: processedData
    });
  } catch (error) {
    console.error('タグデータの取得中にエラーが発生しました:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 複数タグの一括取得
router.get('/api/batch', async (req, res) => {
  const { tags, start, end, timeshift, display = 'false', lang = 'ja', showUnit = 'false' } = req.query;
  
  if (!tags) {
    return res.status(400).json({ error: 'Tags parameter is required' });
  }
  
  try {
    const tagIds = tags.split(',');
    const shouldTimeShift = timeshift === 'true';
    const shouldDisplay = display === 'true';
    const shouldShowUnit = showUnit === 'true';
    const result = {};
    
    // 一括でメタデータを取得（通常タグ用）
    const metadataMap = getTagsMetadata(tagIds, {
      display: shouldDisplay,
      lang,
      showUnit: shouldShowUnit
    });
    
    // gtagのIDリストを作成
    const gtagIds = [];
    const normalTagIds = [];
    
    for (const tagId of tagIds) {
      // gtagかどうか判定
      const isGtag = db.prepare('SELECT COUNT(*) as count FROM gtags WHERE id = ?').get(tagId).count > 0;
      
      if (isGtag) {
        gtagIds.push(tagId);
      } else if (metadataMap[tagId]) {
        normalTagIds.push(tagId);
      }
    }
    
    // 通常タグの処理
    for (const tagId of normalTagIds) {
      // 時間範囲のフィルタリング
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
      
      // タイムシフトを適用
      const processedData = shouldTimeShift ? getTimeShiftedData(tagData, true) : tagData;
      
      result[tagId] = {
        metadata: metadataMap[tagId],
        data: processedData
      };
    }
    
    // gtagの処理
    for (const tagId of gtagIds) {
      // gtagの定義を取得
      const gtag = db.prepare('SELECT * FROM gtags WHERE id = ?').get(tagId);
      
      if (gtag) {
        // メタデータを構築
        const metadata = {
          id: gtag.id,
          equipment: gtag.equipment,
          name: gtag.name,
          unit: gtag.unit || '',
          description: gtag.description || '',
          is_gtag: true,
          type: gtag.type
        };
        
        if (shouldDisplay) {
          metadata.display_name = gtag.description || gtag.name;
        }
        
        // gtagのデータを計算
        const gtagData = await getGtagData(gtag, { start, end });
        
        // タイムシフトを適用
        const processedData = shouldTimeShift ? getTimeShiftedData(gtagData, true) : gtagData;
        
        result[tagId] = {
          metadata,
          data: processedData
        };
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error('バッチデータの取得中にエラーが発生しました:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 最新値取得（現在のポーリングをシミュレート）
router.get('/api/current', (req, res) => {
  const { tags, display = 'false', lang = 'ja', showUnit = 'false' } = req.query;
  
  if (!tags) {
    return res.status(400).json({ error: 'Tags parameter is required' });
  }
  
  try {
    const tagIds = tags.split(',');
    const now = new Date();
    const result = {};
    
    // 一括でメタデータを取得（表示名オプション付き）
    const metadataMap = getTagsMetadata(tagIds, {
      display: display === 'true',
      lang,
      showUnit: showUnit === 'true'
    });
    
    for (const tagId of tagIds) {
      // タグが存在するか確認
      if (metadataMap[tagId]) {
        // 最新のデータポイントを取得（タイムシフトを適用するため最新10点を取得）
        const latestData = db.prepare(`
          SELECT timestamp, value FROM tag_data 
          WHERE tag_id = ? 
          ORDER BY timestamp DESC 
          LIMIT 10
        `).all(tagId);
        
        if (latestData.length > 0) {
          // タイムシフトを適用
          const shiftedData = getTimeShiftedData(latestData.reverse(), true);
          
          // 現在時刻に最も近いデータポイントを検索
          let closestPoint = shiftedData[0];
          let minDiff = Math.abs(now - new Date(closestPoint.timestamp));
          
          for (let i = 1; i < shiftedData.length; i++) {
            const diff = Math.abs(now - new Date(shiftedData[i].timestamp));
            if (diff < minDiff) {
              minDiff = diff;
              closestPoint = shiftedData[i];
            }
          }
          
          result[tagId] = {
            timestamp: closestPoint.timestamp,
            value: closestPoint.value,
            metadata: metadataMap[tagId]
          };
        }
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error('最新値の取得中にエラーが発生しました:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 設備のCSVデータエクスポート
router.get('/api/export/equipment/:equipmentId/csv', async (req, res) => {
  const { equipmentId } = req.params;
  const { 
    start, 
    end, 
    includeGtags = 'true', 
    timeshift = 'false',
    display = 'false',
    lang = 'ja',
    showUnit = 'false'
  } = req.query;
  
  try {
    // 設備の存在チェック
    const equipmentExists = db.prepare(
      'SELECT COUNT(*) as count FROM tags WHERE equipment = ?'
    ).get(equipmentId).count > 0;
    
    if (!equipmentExists) {
      return res.status(404).json({ error: `Equipment ${equipmentId} not found` });
    }
    
    // 設備に関連する通常タグを取得してソート
    const tags = db.prepare('SELECT id FROM tags WHERE equipment = ? ORDER BY id').all(equipmentId);
    const normalTagIds = tags.map(tag => tag.id);
    
    // gtagを含める場合、IDでソートして取得
    const shouldIncludeGtags = includeGtags === 'true';
    let gtagIds = [];
    if (shouldIncludeGtags) {
      const gtags = db.prepare('SELECT id FROM gtags WHERE equipment = ? ORDER BY id').all(equipmentId);
      gtagIds = gtags.map(gtag => gtag.id);
    }
    
    // 全タグIDを配列にまとめる（通常タグが先、gtagが後）
    const allTagIds = [...normalTagIds, ...gtagIds];
    
    if (allTagIds.length === 0) {
      return res.status(404).json({ error: `No tags found for equipment ${equipmentId}` });
    }
    
    // 表示名オプションの処理
    const shouldDisplay = display === 'true';
    const shouldShowUnit = showUnit === 'true';
    
    // ヘッダー名を取得
    let headerNames = [...allTagIds]; // デフォルトはタグID
    
    if (shouldDisplay) {
      // 通常タグのメタデータを取得
      const metadataMap = getTagsMetadata(normalTagIds, {
        display: true,
        lang,
        showUnit: shouldShowUnit
      });
      
      // gtag表示名の取得
      const gtagHeaderMap = {};
      if (shouldIncludeGtags && gtagIds.length > 0) {
        for (const gtagId of gtagIds) {
          const gtag = db.prepare('SELECT * FROM gtags WHERE id = ?').get(gtagId);
          let displayName = gtag.description || gtag.name;
          if (shouldShowUnit && gtag.unit) {
            displayName = `${displayName} (${gtag.unit})`;
          }
          gtagHeaderMap[gtagId] = displayName;
        }
      }
      
      // ヘッダー名を表示名に置き換え
      headerNames = allTagIds.map(tagId => {
        if (gtagIds.includes(tagId)) {
          // gtagの場合
          return gtagHeaderMap[tagId] || tagId;
        } else {
          // 通常タグの場合
          return metadataMap[tagId]?.display_name || tagId;
        }
      });
    }
    
    // CSVヘッダーの生成（1列目はdatetime、2列目以降は各タグの名前）
    const csvHeader = ['datetime', ...headerNames].join(',');
    
    // データポイントのタイムスタンプを収集
    const timestamps = new Set();
    const tagData = {};
    
    // 各タグのデータを取得し、タイムスタンプを収集
    for (const tagId of allTagIds) {
      // gtagかどうかチェック
      const isGtag = gtagIds.includes(tagId);
      
      let data;
      if (isGtag) {
        // gtagの場合
        const gtag = db.prepare('SELECT * FROM gtags WHERE id = ?').get(tagId);
        data = await getGtagData(gtag, { start, end });
      } else {
        // 通常タグの場合
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
        data = db.prepare(query).all(...params);
      }
      
      // タイムシフトを適用
      if (timeshift === 'true') {
        data = getTimeShiftedData(data, true);
      }
      
      // タグのデータを保存
      tagData[tagId] = {};
      data.forEach(point => {
        timestamps.add(point.timestamp);
        tagData[tagId][point.timestamp] = point.value;
      });
    }
    
    // 時系列順にソート
    const sortedTimestamps = Array.from(timestamps).sort();
    
    // CSVレコードの生成
    const csvRows = sortedTimestamps.map(timestamp => {
      const values = allTagIds.map(tagId => {
        const value = tagData[tagId][timestamp];
        return value !== undefined ? value : '';
      });
      return [timestamp, ...values].join(',');
    });
    
    // CSVデータの生成
    const csvContent = [csvHeader, ...csvRows].join('\n');
    
    // 現在のタイムスタンプをファイル名に使用
    const currentTime = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${equipmentId}_data_${currentTime}.csv`;
    
    // CSVレスポンスの送信
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(csvContent);
  } catch (error) {
    console.error('CSVエクスポート中にエラーが発生しました:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

module.exports = router;
