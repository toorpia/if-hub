// src/server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const cors = require('cors');
const config = require('./config');
const { db } = require('./db');
const { importCsvToDatabase } = require('./utils/csv-importer');
const { importTagTranslations } = require('./utils/tag-translations-importer');
const { getTagMetadata, getTagsMetadata } = require('./utils/tag-utils');
const { 
  initializeGtagSystem, 
  loadAllGtagDefinitions, 
  detectChangedGtagFiles, 
  importGtagDefinition,
  getGtagData,
  gtagChecksums
} = require('./utils/gtag-utils');

const app = express();
const PORT = config.server.port;

// CORS設定
app.use(cors({
  origin: config.server.corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// タイムシフト関数（過去データを現在時刻にシフト）
function getTimeShiftedData(tagData, shiftToPresent = true) {
  if (!tagData || tagData.length === 0) return [];
  
  if (!shiftToPresent) return tagData;
  
  const now = new Date();
  
  // データの時間範囲を取得
  const timestamps = tagData.map(point => new Date(point.timestamp).getTime());
  const oldestTime = new Date(Math.min(...timestamps));
  const newestTime = new Date(Math.max(...timestamps));
  
  // 最新時刻が現在になるようにシフト
  const timeShift = now - newestTime;
  
  return tagData.map(point => ({
    timestamp: new Date(new Date(point.timestamp).getTime() + timeShift),
    value: point.value
  }));
}

// 時間範囲でフィルタリング
function filterByTimeRange(data, startTime, endTime) {
  if (!startTime && !endTime) return data;
  
  const start = startTime ? new Date(startTime) : new Date(0);
  const end = endTime ? new Date(endTime) : new Date();
  
  return data.filter(point => {
    const pointTime = new Date(point.timestamp);
    return pointTime >= start && pointTime <= end;
  });
}

// ===== APIエンドポイント =====

// システム情報
app.get('/api/system/info', (req, res) => {
  try {
    // タグ数の取得
    const tagCount = db.prepare('SELECT COUNT(*) as count FROM tags').get().count;
    
    // 設備数の取得
    const equipmentCount = db.prepare('SELECT COUNT(DISTINCT equipment) as count FROM tags').get().count;
    
    res.json({
      name: 'Mock PI System',
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

// 利用可能なタグ一覧
app.get('/api/tags', (req, res) => {
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

// gtag一覧取得
app.get('/api/gtags', (req, res) => {
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

// 設備一覧
app.get('/api/equipment', (req, res) => {
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

// 特定タグのデータ取得
app.get('/api/data/:tagId', async (req, res) => {
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
app.get('/api/batch', async (req, res) => {
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
app.get('/api/current', (req, res) => {
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

// ステータスエンドポイント（ヘルスチェック用）
app.get('/api/status', (req, res) => {
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

// 外部プロセッサをインポート
const externalProcessor = require('./utils/external-processor');

// Z-scoreデータの取得エンドポイント
app.get('/api/process/zscore/:tagId', async (req, res) => {
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
app.get('/api/process/deviation/:tagId', async (req, res) => {
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

// 設備のCSVデータエクスポート
app.get('/api/export/equipment/:equipmentId/csv', async (req, res) => {
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

// 移動平均データの取得エンドポイント
app.get('/api/process/ma/:tagId', async (req, res) => {
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

// サーバー起動
async function startServer() {
  try {
    // ファイル監視とインポート機能をインポート
    const { 
      detectChangedFiles, 
      detectChangedTranslationFiles, 
      fileChecksums,
      translationChecksums 
    } = require('./utils/file-watcher');
    const { importSpecificCsvFile } = require('./utils/csv-importer');
    
    // gtag機能の初期化
    console.log('gtagシステムの初期化を開始します...');
    initializeGtagSystem();
    await loadAllGtagDefinitions();
    console.log('gtagシステムの初期化が完了しました');
    
    console.log('CSV変更の確認を開始します...');
    
    // 起動時にチェックサムベースで変更ファイルを検出
    const changedFiles = detectChangedFiles();
    
    if (changedFiles.length > 0) {
      console.log(`${changedFiles.length}個のCSVファイルの変更を検出しました`);
      
      for (const fileInfo of changedFiles) {
        const oldChecksum = fileChecksums.get(fileInfo.path) || '新規ファイル';
        console.log(`ファイル ${fileInfo.name} の更新を処理します（チェックサム: ${fileInfo.checksum.substring(0, 8)}...）`);
        await importSpecificCsvFile(fileInfo);
      }
      
      console.log('CSV更新の処理が完了しました');
    } else {
      console.log('更新されたCSVファイルはありません。インポートはスキップします。');
    }
    
    // 翻訳ファイルの変更を確認
    console.log('翻訳ファイル変更の確認を開始します...');
    const changedTranslationFiles = detectChangedTranslationFiles();
    
    if (changedTranslationFiles.length > 0) {
      console.log(`${changedTranslationFiles.length}個の翻訳ファイルの変更を検出しました`);
      // タグ表示名をインポート
      await importTagTranslations();
      console.log('翻訳ファイルの更新処理が完了しました');
    } else {
      console.log('更新された翻訳ファイルはありません');
      // それでも初回は読み込む
      await importTagTranslations();
    }
    
    app.listen(PORT, () => {
      console.log(`DataStream Hub Server running on port ${PORT}`);
      console.log(`Environment: ${config.environment}`);
      console.log(`Storage: SQLite database`);
      console.log(`Available endpoints:`);
      console.log(`  GET /api/system/info`);
      console.log(`  GET /api/tags`);
      console.log(`  GET /api/equipment`);
      console.log(`  GET /api/data/:tagId`);
      console.log(`  GET /api/batch`);
      console.log(`  GET /api/current`);
      console.log(`  GET /api/status`);
      console.log(`  GET /api/process/ma/:tagId`);
    });
    
    // 1分おきにCSVフォルダを監視
    console.log(`CSVフォルダ監視を開始します (間隔: 1分)`);
    
    setInterval(async () => {
      try {
        const changedFiles = detectChangedFiles();
        
        if (changedFiles.length > 0) {
          console.log(`${changedFiles.length}個のCSVファイルの変更を検出しました`);
          
          for (const fileInfo of changedFiles) {
            console.log(`ファイル ${fileInfo.name} の更新を処理します（チェックサム: ${fileInfo.checksum.substring(0, 8)}...）`);
            await importSpecificCsvFile(fileInfo);
          }
          
          console.log('CSV更新の処理が完了しました');
        }
      } catch (error) {
        console.error('CSV監視処理中にエラーが発生しました:', error);
      }
    }, 60000); // 1分間隔
    
    // 5分おきに翻訳ファイルを監視
    console.log(`翻訳ファイル監視を開始します (間隔: 5分)`);
    
    setInterval(async () => {
      try {
        const changedTranslationFiles = detectChangedTranslationFiles();
        
        if (changedTranslationFiles.length > 0) {
          console.log(`${changedTranslationFiles.length}個の翻訳ファイルの変更を検出しました`);
          
          // タグ表示名をインポート
          await importTagTranslations();
          
          console.log('翻訳ファイルの更新処理が完了しました');
        }
      } catch (error) {
        console.error('翻訳ファイル監視処理中にエラーが発生しました:', error);
      }
    }, 300000); // 5分間隔
    
    // 5分おきにgtag定義ファイルを監視
    console.log(`gtag定義ファイル監視を開始します (間隔: 5分)`);
    
    setInterval(async () => {
      try {
        const changedGtagFiles = detectChangedGtagFiles();
        
        if (changedGtagFiles.length > 0) {
          console.log(`${changedGtagFiles.length}個のgtag定義ファイルの変更を検出しました`);
          
          for (const fileInfo of changedGtagFiles) {
            console.log(`gtag定義「${fileInfo.name}」の更新を処理します (チェックサム: ${fileInfo.checksum.substring(0, 8)}...)`);
            await importGtagDefinition(fileInfo);
          }
          
          console.log('gtag定義の更新処理が完了しました');
        }
      } catch (error) {
        console.error('gtag定義ファイル監視処理中にエラーが発生しました:', error);
      }
    }, 300000); // 5分間隔
  } catch (error) {
    console.error('サーバー起動中にエラーが発生しました:', error);
    process.exit(1);
  }
}

startServer();
