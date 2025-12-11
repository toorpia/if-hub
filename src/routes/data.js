// src/routes/data.js
const express = require('express');
const router = express.Router();
const { query, get } = require('../db');
const { getTagMetadata, getTagsMetadata } = require('../utils/tag-utils');
const { getGtagData } = require('../utils/gtag-utils');
const { getTimeShiftedData } = require('../utils/time-utils');
const { calculateMovingAverage, calculateZScore, calculateDeviation } = require('../utils/data-processing');
const config = require('../config');
const equipmentConfigManager = require('../services/equipment-config-manager');
const { sortTagIdsByConfigOrder } = require('../utils/config-order-sort');

// 特定タグのデータ取得
router.get('/api/data/:tagName', async (req, res) => {
  const { tagName } = req.params;
  const { 
    start, 
    end, 
    timeshift, 
    display = 'false', 
    lang = 'ja', 
    showUnit = 'false', 
    zeroAsNull = 'false',
    processing,
    window
  } = req.query;
  
  try {
    // タグが通常タグかgtagかチェック
    const tagExistsResult = await get('SELECT COUNT(*) as count FROM tags WHERE name = $1', [tagName]);
    const tagExists = tagExistsResult.count > 0;
    const gtagExistsResult = await get('SELECT COUNT(*) as count FROM gtags WHERE name = $1', [tagName]);
    const gtagExists = gtagExistsResult.count > 0;
    
    // タグもgtagも存在しない場合
    if (!tagExists && !gtagExists) {
      return res.status(404).json({ error: `Tag ${tagName} not found` });
    }
    
    const shouldTimeShift = timeshift === 'true';
    
    // gtagの場合
    if (gtagExists) {
      // gtagの定義を取得
      const gtag = await get('SELECT * FROM gtags WHERE name = $1', [tagName]);

      // メタデータを構築
      const metadata = {
        id: gtag.id,
        name: gtag.name,
        equipment: gtag.equipment,
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
      
      // 値0をnullとして扱うオプションの処理
      const shouldTreatZeroAsNull = zeroAsNull === 'true';
      if (shouldTreatZeroAsNull) {
        processedData.forEach(point => {
          if (point.value === 0) {
            point.value = null;
          }
        });
      }
      
      return res.json({
        tagId: tagName, // APIの互換性のためにtagNameを使用
        metadata,
        data: processedData
      });
    }
    
    // 通常タグの場合
    // タグ名から整数IDを取得
    const tag = await get('SELECT id FROM tags WHERE name = $1', [tagName]);

    if (!tag) {
      return res.status(404).json({ error: `Tag ${tagName} not found` });
    }

    // タグのメタデータを取得（表示名オプション付き）
    const metadata = getTagMetadata(tagName, {
      display: display === 'true',
      lang,
      showUnit: showUnit === 'true'
    });

    // 時間範囲のフィルタリング（整数型のtag_idを使用）
    let sql = 'SELECT timestamp, value FROM tag_data WHERE tag_id = $1';
    const params = [tag.id]; // 整数IDを使用
    let paramIndex = 2;

    if (start) {
      sql += ` AND timestamp >= $${paramIndex}`;
      params.push(new Date(start).toISOString());
      paramIndex++;
    }

    if (end) {
      sql += ` AND timestamp <= $${paramIndex}`;
      params.push(new Date(end).toISOString());
      paramIndex++;
    }

    sql += ' ORDER BY timestamp';

    // レコード数の上限を適用
    sql += ` LIMIT ${config.api.maxRecordsPerRequest}`;

    const tagData = await query(sql, params);
    
    // タイムシフトを適用
    let processedData = shouldTimeShift ? getTimeShiftedData(tagData, true) : tagData;
    
    // 処理オプションの適用
    const processingInfo = {};
    if (processing) {
      const windowSize = window ? parseInt(window, 10) : null;
      
      const { executeProcess } = require('../utils/gtag-utils');
      
      try {
        switch (processing) {
          case 'moving_average':
            processedData = await executeProcess(
              tagName, 
              'moving_average', 
              { window: windowSize || 5 }, 
              { start, end }
            );
            processingInfo.type = 'moving_average';
            processingInfo.window = windowSize || 5;
            break;
            
          case 'zscore':
            processedData = await executeProcess(
              tagName, 
              'zscore', 
              { window: windowSize }, 
              { start, end }
            );
            processingInfo.type = 'zscore';
            processingInfo.window = windowSize;
            break;
            
          case 'deviation':
            processedData = await executeProcess(
              tagName, 
              'deviation', 
              { window: windowSize }, 
              { start, end }
            );
            processingInfo.type = 'deviation';
            processingInfo.window = windowSize;
            break;
            
          default:
            return res.status(400).json({ 
              error: `Unsupported processing type: ${processing}`,
              supportedTypes: ['moving_average', 'zscore', 'deviation']
            });
        }
      } catch (error) {
        console.error(`処理オプション適用中にエラーが発生しました: ${error.message}`);
        return res.status(500).json({ 
          error: 'Processing error',
          message: error.message
        });
      }
    }
    
    // 値0をnullとして扱うオプションの処理
    const shouldTreatZeroAsNull = zeroAsNull === 'true';
    if (shouldTreatZeroAsNull) {
      processedData.forEach(point => {
        if (point.value === 0) {
          point.value = null;
        }
      });
    }
    
    // レスポンスの作成
    const response = {
      tagId: tagName, // APIの互換性のためにtagNameを返す
      metadata
    };
    
    // 処理情報を追加（処理が適用された場合のみ）
    if (processing && Object.keys(processingInfo).length > 0) {
      response.processing = processingInfo;
    }
    
    // データを追加
    response.data = processedData;
    
    res.json(response);
  } catch (error) {
    console.error('タグデータの取得中にエラーが発生しました:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 複数タグの一括取得
router.get('/api/batch', async (req, res) => {
  const { 
    tags, 
    start, 
    end, 
    timeshift, 
    display = 'false', 
    lang = 'ja', 
    showUnit = 'false', 
    zeroAsNull = 'false',
    processing,
    window
  } = req.query;
  
  if (!tags) {
    return res.status(400).json({ error: 'Tags parameter is required' });
  }
  
  try {
    const tagNames = tags.split(',');
    const shouldTimeShift = timeshift === 'true';
    const shouldDisplay = display === 'true';
    const shouldShowUnit = showUnit === 'true';
    const shouldTreatZeroAsNull = zeroAsNull === 'true';
    const result = {};
    
    // 一括でメタデータを取得（通常タグ用）
    const metadataMap = await getTagsMetadata(tagNames, {
      display: shouldDisplay,
      lang,
      showUnit: shouldShowUnit
    });
    
    // gtagのリストとタグリストを作成
    const gtagNames = [];
    const normalTagNames = [];
    
    for (const tagName of tagNames) {
      // gtagかどうか判定
      const gtagCheckResult = await get('SELECT COUNT(*) as count FROM gtags WHERE name = $1', [tagName]);
      const isGtag = gtagCheckResult.count > 0;

      if (isGtag) {
        gtagNames.push(tagName);
      } else if (metadataMap[tagName]) {
        normalTagNames.push(tagName);
      }
    }
    
    // 通常タグの処理
    for (const tagName of normalTagNames) {
      // タグ名から整数IDを取得
      const tag = await get('SELECT id FROM tags WHERE name = $1', [tagName]);

      if (!tag) {
        console.warn(`タグ名 ${tagName} に対応するタグが見つかりません`);
        continue;
      }

      // 時間範囲のフィルタリング
      let sql = 'SELECT timestamp, value FROM tag_data WHERE tag_id = $1';
      const params = [tag.id]; // 整数IDを使用
      let paramIndex = 2;

      if (start) {
        sql += ` AND timestamp >= $${paramIndex}`;
        params.push(new Date(start).toISOString());
        paramIndex++;
      }

      if (end) {
        sql += ` AND timestamp <= $${paramIndex}`;
        params.push(new Date(end).toISOString());
        paramIndex++;
      }

      sql += ' ORDER BY timestamp';

      // レコード数の上限を適用
      sql += ` LIMIT ${config.api.maxRecordsPerRequest}`;

      const tagData = await query(sql, params);
      
      // タイムシフトを適用
      let processedData = shouldTimeShift ? getTimeShiftedData(tagData, true) : tagData;
      
      // 処理オプションの適用
      const processingInfo = {};
      if (processing) {
        const windowSize = window ? parseInt(window, 10) : null;
        
        const { executeProcess } = require('../utils/gtag-utils');
        
        try {
          switch (processing) {
            case 'moving_average':
              processedData = await executeProcess(
                tagName, 
                'moving_average', 
                { window: windowSize || 5 }, 
                { start, end }
              );
              processingInfo.type = 'moving_average';
              processingInfo.window = windowSize || 5;
              break;
              
            case 'zscore':
              processedData = await executeProcess(
                tagName, 
                'zscore', 
                { window: windowSize }, 
                { start, end }
              );
              processingInfo.type = 'zscore';
              processingInfo.window = windowSize;
              break;
              
            case 'deviation':
              processedData = await executeProcess(
                tagName, 
                'deviation', 
                { window: windowSize }, 
                { start, end }
              );
              processingInfo.type = 'deviation';
              processingInfo.window = windowSize;
              break;
          }
        } catch (error) {
          console.error(`処理オプション適用中にエラーが発生しました (${tagName}): ${error.message}`);
          // エラーが発生しても処理を続行し、そのタグは元のデータを使用
        }
      }
      
      // 値0をnullとして扱うオプションの処理
      if (shouldTreatZeroAsNull) {
        processedData.forEach(point => {
          if (point.value === 0) {
            point.value = null;
          }
        });
      }
      
      // タグ結果の作成
      const tagResult = {
        metadata: metadataMap[tagName],
        data: processedData
      };
      
      // 処理情報を追加（処理が適用された場合のみ）
      if (processing && Object.keys(processingInfo).length > 0) {
        tagResult.processing = processingInfo;
      }
      
      result[tagName] = tagResult;
    }
    
    // gtagの処理
    for (const tagName of gtagNames) {
      // gtagの定義を取得
      const gtag = await get('SELECT * FROM gtags WHERE name = $1', [tagName]);

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
        
        // 値0をnullとして扱うオプションの処理
        if (shouldTreatZeroAsNull) {
          processedData.forEach(point => {
            if (point.value === 0) {
              point.value = null;
            }
          });
        }
        
        result[tagName] = {
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
router.get('/api/current', async (req, res) => {
  const { tags, display = 'false', lang = 'ja', showUnit = 'false', zeroAsNull = 'false' } = req.query;
  
  if (!tags) {
    return res.status(400).json({ error: 'Tags parameter is required' });
  }
  
  try {
    const tagNames = tags.split(',');
    const now = new Date();
    const shouldTreatZeroAsNull = zeroAsNull === 'true';
    const result = {};
    
    // 一括でメタデータを取得（表示名オプション付き）
    const metadataMap = await getTagsMetadata(tagNames, {
      display: display === 'true',
      lang,
      showUnit: showUnit === 'true'
    });
    
    for (const tagName of tagNames) {
      // タグが存在するか確認
      if (metadataMap[tagName]) {
        // タグ名から整数IDを取得
        const tag = await get('SELECT id FROM tags WHERE name = $1', [tagName]);

        if (!tag) {
          console.warn(`タグ名 ${tagName} に対応するタグが見つかりません`);
          continue;
        }

        // 最新のデータポイントを取得（タイムシフトを適用するため最新10点を取得）
        const latestData = await query(`
          SELECT timestamp, value FROM tag_data
          WHERE tag_id = $1
          ORDER BY timestamp DESC
          LIMIT 10
        `, [tag.id]); // 整数IDを使用
        
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
          
          // 値が0の場合にnullに変換
          let value = closestPoint.value;
          if (shouldTreatZeroAsNull && value === 0) {
            value = null;
          }
          
          result[tagName] = {
            timestamp: closestPoint.timestamp,
            value: value,
            metadata: metadataMap[tagName]
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
    showUnit = 'false',
    skipInvalidValues = 'true', // 不定値（Infinity、NaNなど）を空セルとして出力するかどうか
    zeroAsNull = 'false', // 値0をnull（空白）として出力するかどうか
    zeroAsNullTags = '', // 特定のタグのみ値0をnull（空白）として出力するためのカンマ区切りタグリスト
    processing, // 処理タイプ（moving_average, zscore, deviation）
    window // 処理窓サイズ
  } = req.query;
  
  try {
    // 設定ファイルの変更チェック・自動リロード
    equipmentConfigManager.checkAndReloadIfNeeded();
    
    // 設備の存在チェック（config.yamlベース）
    const equipmentNames = equipmentConfigManager.getAllEquipments();
    if (!equipmentNames.includes(equipmentId)) {
      return res.status(404).json({ error: `Equipment ${equipmentId} not found` });
    }
    
    // config.yamlから設備に関連するタグを取得
    const sourceTags = equipmentConfigManager.getSourceTags(equipmentId);
    const shouldIncludeGtags = includeGtags === 'true';
    const gtags = shouldIncludeGtags ? equipmentConfigManager.getGtags(equipmentId) : [];
    
    if (sourceTags.length === 0 && gtags.length === 0) {
      return res.status(404).json({ error: `No tags found for equipment ${equipmentId}` });
    }
    
    // タグ名からタグIDとgtagIDを取得
    const normalTagIds = [];
    const tagIdToName = new Map();
    const gtagIds = [];
    const gtagIdToName = new Map();
    
    // 通常タグの処理
    for (const tagName of sourceTags) {
      const tag = await get('SELECT id, name FROM tags WHERE source_tag = $1 OR name = $1', [tagName]);
      if (tag) {
        normalTagIds.push(tag.id);
        tagIdToName.set(tag.id, tag.name);
      }
    }

    // gtagの処理
    for (const gtagName of gtags) {
      const gtag = await get('SELECT id, name FROM gtags WHERE name = $1', [gtagName]);
      if (gtag) {
        gtagIds.push(gtag.id);
        gtagIdToName.set(gtag.id, gtag.name);
      }
    }
    
    // 全タグIDを配列にまとめる（通常タグが先、gtagが後）
    let allTagIds = [...normalTagIds, ...gtagIds];
    
    // config.yaml順序でソート
    allTagIds = sortTagIdsByConfigOrder(allTagIds, equipmentId, tagIdToName, gtagIdToName);
    
    if (allTagIds.length === 0) {
      return res.status(404).json({ error: `No valid tags found for equipment ${equipmentId}` });
    }
    
    // 表示名オプションの処理
    const shouldDisplay = display === 'true';
    const shouldShowUnit = showUnit === 'true';
    
    // ヘッダー名を取得
    let headerNames = [...allTagIds]; // デフォルトはタグID
    
    if (shouldDisplay) {
      // タグIDから内部タグ名（7th-untan.POW:7I1032.PV形式）のリストを作成
      const normalTagNames = normalTagIds.map(id => tagIdToName.get(id)).filter(Boolean);
      
      // 内部タグ名からメタデータを取得（他のAPIエンドポイントと同様のアプローチ）
      const metadataMap = getTagsMetadata(normalTagNames, {
        display: true,
        lang,
        showUnit: shouldShowUnit
      });
      
      // gtag表示名の取得
      const gtagHeaderMap = {};
      if (shouldIncludeGtags && gtagIds.length > 0) {
        for (const gtagId of gtagIds) {
          const gtag = await get('SELECT * FROM gtags WHERE id = $1', [gtagId]);
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
          const tagName = tagIdToName.get(tagId);
          return tagName ? metadataMap[tagName]?.display_name || tagId : tagId;
        }
      });
    }
    
    // CSVヘッダーの生成（1列目はdatetime、2列目以降は各タグの名前）
    // 表示名オプションがオンの場合はheaderNamesを使用、それ以外はタグ名を使用
    const headersToUse = shouldDisplay ? headerNames : allTagIds.map(tagId => {
      if (gtagIds.includes(tagId)) {
        // gtagの場合
        return gtagIdToName.get(tagId) || tagId.toString();
      } else {
        // 通常タグの場合
        return tagIdToName.get(tagId) || tagId.toString();
      }
    });
    
    const csvHeader = ['datetime', ...headersToUse].join(',');
    
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
      const gtag = await get('SELECT * FROM gtags WHERE id = $1', [tagId]);
      data = await getGtagData(gtag, { start, end });
      
      // 修正2: gtagにも処理を適用（追加）
      if (processing) {
        const tagName = gtagIdToName.get(tagId);
        if (tagName) {
          const windowSize = window ? parseInt(window, 10) : null;
          try {
            switch (processing) {
              case 'moving_average':
                // データを移動平均で処理
                data = calculateMovingAverage(data, windowSize || 5);
                break;
              case 'zscore':
                // データをZスコアで処理
                data = calculateZScore(data, windowSize);
                break;
              case 'deviation':
                // データを偏差値で処理
                data = calculateDeviation(data, windowSize);
                break;
            }
          } catch (error) {
            console.error(`CSVエクスポート: gTag ${tagName} の処理オプション適用中にエラーが発生しました: ${error.message}`);
            // エラーでも処理を継続
          }
        }
      }
    } else {
      // 通常タグの場合
      let sql = 'SELECT timestamp, value FROM tag_data WHERE tag_id = $1';
      const params = [tagId];
      let paramIndex = 2;

      if (start) {
        sql += ` AND timestamp >= $${paramIndex}`;
        params.push(new Date(start).toISOString());
        paramIndex++;
      }

      if (end) {
        sql += ` AND timestamp <= $${paramIndex}`;
        params.push(new Date(end).toISOString());
        paramIndex++;
      }

      sql += ' ORDER BY timestamp';
      data = await query(sql, params);
      
          // 処理オプションの適用
          if (processing) {
            const tagName = tagIdToName.get(tagId);
            if (tagName) {
              const windowSize = window ? parseInt(window, 10) : null;
              const { executeProcess } = require('../utils/gtag-utils');
            
            try {
              switch (processing) {
                case 'moving_average':
                  data = await executeProcess(
                    tagName, 
                    'moving_average', 
                    { window: windowSize || 5 }, 
                    { start, end }
                  );
                  break;
                  
                case 'zscore':
                  data = await executeProcess(
                    tagName, 
                    'zscore', 
                    { window: windowSize }, 
                    { start, end }
                  );
                  break;
                  
                case 'deviation':
                  data = await executeProcess(
                    tagName, 
                    'deviation', 
                    { window: windowSize }, 
                    { start, end }
                  );
                  break;
              }
            } catch (error) {
              console.error(`CSVエクスポート: タグ ${tagName} の処理オプション適用中にエラーが発生しました: ${error.message}`);
              // エラーが発生しても処理を続行
            }
          }
        }
      }
      
      // タイムシフトを適用
      if (timeshift === 'true') {
        data = getTimeShiftedData(data, true);
      }
      
      // タグのデータを保存（修正）
      tagData[tagId] = {};
      
      // すべてのポイントをタイムスタンプ辞書に追加
      data.forEach(point => {
        timestamps.add(point.timestamp);
        // 処理済みでも未処理でも同じく point.value を使用（これはすでに正しい値）
        tagData[tagId][point.timestamp] = point.value;
      });
    }
    
    // 時系列順にソート
    const sortedTimestamps = Array.from(timestamps).sort();
    
    // CSVレコードの生成
    const shouldTreatZeroAsNull = zeroAsNull === 'true';
    const zeroAsNullTagsList = zeroAsNullTags.split(',').filter(tag => tag.trim() !== '');
    
    // タグIDからタグ名への変換マップを作成
    const idToNameMap = new Map();
    for (const tagId of normalTagIds) {
      const name = tagIdToName.get(tagId);
      if (name) {
        idToNameMap.set(tagId, name);
      }
    }
    for (const gtagId of gtagIds) {
      const name = gtagIdToName.get(gtagId);
      if (name) {
        idToNameMap.set(gtagId, name);
      }
    }
    
    const csvRows = sortedTimestamps.map(timestamp => {
      const values = allTagIds.map(tagId => {
        const value = tagData[tagId][timestamp];
        const tagName = idToNameMap.get(tagId);
        
        // skipInvalidValuesがtrueの場合、無効値チェック
        if (skipInvalidValues === 'true') {
          // 値が存在しないか、nullの場合は空文字を返す
          if (value === undefined || value === null) {
            return '';
          }
          
          // 数値型だが、無限大またはNaNの場合は空文字を返す
          if (typeof value === 'number' && !Number.isFinite(value)) {
            return '';
          }
        }
        
        // 値0をnullとして扱うオプション
        if (value === 0) {
          // 全タグに適用するグローバル設定がオンの場合
          if (shouldTreatZeroAsNull) {
            return '';
          }
          
          // 特定のタグに適用する場合
          if (zeroAsNullTagsList.length > 0 && tagName) {
            if (zeroAsNullTagsList.includes(tagName)) {
              return '';
            }
          }
        }
        
        // 有効な値またはskipInvalidValues=falseの場合は値をそのまま返す
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
