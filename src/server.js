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
  const { display = 'false', lang = 'ja', showUnit = 'false' } = req.query;
  
  try {
    const shouldDisplay = display === 'true';
    const shouldShowUnit = showUnit === 'true';
    
    // 全タグを取得
    const tags = db.prepare('SELECT * FROM tags').all();
    
    // 表示名を含める場合
    if (shouldDisplay) {
      const tagIds = tags.map(tag => tag.id);
      const metadataMap = getTagsMetadata(tagIds, { 
        display: true, 
        lang, 
        showUnit: shouldShowUnit 
      });
      
      // 表示名を含めたタグデータを返す
      const tagsWithDisplayNames = tags.map(tag => ({
        ...tag,
        display_name: metadataMap[tag.id]?.display_name || tag.name,
        unit: metadataMap[tag.id]?.unit || tag.unit
      }));
      
      res.json({ tags: tagsWithDisplayNames });
    } else {
      // 通常のタグデータを返す
      res.json({ tags });
    }
  } catch (error) {
    console.error('タグ一覧の取得中にエラーが発生しました:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 設備一覧
app.get('/api/equipment', (req, res) => {
  try {
    const equipment = db.prepare(`
      SELECT equipment as id, equipment as name, COUNT(*) as tagCount
      FROM tags
      GROUP BY equipment
    `).all();
    
    res.json({ equipment });
  } catch (error) {
    console.error('設備一覧の取得中にエラーが発生しました:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 特定タグのデータ取得
app.get('/api/data/:tagId', (req, res) => {
  const { tagId } = req.params;
  const { start, end, timeshift, display = 'false', lang = 'ja', showUnit = 'false' } = req.query;
  
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
    
    const tagData = db.prepare(query).all(...params);
    
    // タイムシフトを適用
    const shouldTimeShift = timeshift === 'true';
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
app.get('/api/batch', (req, res) => {
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
    
    // 一括でメタデータを取得（表示名オプション付き）
    const metadataMap = getTagsMetadata(tagIds, {
      display: shouldDisplay,
      lang,
      showUnit: shouldShowUnit
    });
    
    for (const tagId of tagIds) {
      // タグが存在するか確認
      if (metadataMap[tagId]) {
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
        
        const tagData = db.prepare(query).all(...params);
        
        // タイムシフトを適用
        const processedData = shouldTimeShift ? getTimeShiftedData(tagData, true) : tagData;
        
        result[tagId] = {
          metadata: metadataMap[tagId],
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
  } catch (error) {
    console.error('サーバー起動中にエラーが発生しました:', error);
    process.exit(1);
  }
}

startServer();
