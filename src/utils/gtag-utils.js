// src/utils/gtag-utils.js
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { db } = require('../db');
const mathjs = require('mathjs');
const os = require('os');

// gtag設定
const GTAG_DIR = path.join(process.cwd(), 'gtags');

// ファイルチェックサム管理
const gtagChecksums = new Map();

/**
 * gtag定義ファイルからチェックサムを計算
 * @param {string} filePath - ファイルパス
 * @returns {string} チェックサム
 */
function calculateGtagChecksum(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * 変更されたgtag定義ファイルを検出
 * @returns {Array} 変更されたファイル情報の配列
 */
function detectChangedGtagFiles() {
  try {
    if (!fs.existsSync(GTAG_DIR)) {
      fs.mkdirpSync(GTAG_DIR);
      return [];
    }

    // gtagディレクトリを検索
    const gtagDirs = fs.readdirSync(GTAG_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    const changedFiles = [];

    for (const gtagName of gtagDirs) {
      const defPath = path.join(GTAG_DIR, gtagName, 'def.json');
      
      // def.jsonが存在するか確認
      if (!fs.existsSync(defPath)) continue;
      
      const checksum = calculateGtagChecksum(defPath);
      const oldChecksum = gtagChecksums.get(defPath);

      if (oldChecksum !== checksum) {
        changedFiles.push({
          path: defPath,
          name: gtagName,
          checksum
        });
        gtagChecksums.set(defPath, checksum);
      }
    }

    return changedFiles;
  } catch (error) {
    console.error('gtag定義ファイルの検出中にエラーが発生しました:', error);
    return [];
  }
}

/**
 * 柔軟なタグ識別子を解析して適切なタグを見つける
 * @param {string|number} identifier - タグ識別子
 * @returns {Array<Object>} 見つかったタグのリスト
 */
function resolveTagIdentifier(identifier) {
  try {
    // 整数の場合はタグIDとして使用
    if (typeof identifier === 'number' || /^\d+$/.test(identifier)) {
      const tagId = parseInt(identifier, 10);
      const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId);
      return tag ? [tag] : [];
    }
    
    // 文字列の場合
    if (typeof identifier === 'string') {
      // ピリオドを含む場合はタグ名として検索
      if (identifier.includes('.')) {
        const tag = db.prepare('SELECT * FROM tags WHERE name = ?').get(identifier);
        return tag ? [tag] : [];
      }
      
      // コロンを含む場合は「設備:ソースタグ」として解釈
      if (identifier.includes(':')) {
        const [equipment, sourceTag] = identifier.split(':');
        return db.prepare('SELECT * FROM tags WHERE equipment = ? AND source_tag = ?').all(equipment, sourceTag);
      }
      
      // それ以外はソースタグとして検索
      return db.prepare('SELECT * FROM tags WHERE source_tag = ?').all(identifier);
    }
    
    return [];
  } catch (error) {
    console.error(`タグ識別子の解決中にエラーが発生しました: ${identifier}`, error);
    return [];
  }
}

/**
 * gtag定義ファイルを読み込み、DBに登録
 * @param {Object} fileInfo - ファイル情報 
 */
async function importGtagDefinition(fileInfo) {
  try {
    const fileContent = await fs.readJson(fileInfo.path);
    
    if (!fileContent.name || !fileContent.type) {
      throw new Error(`必須フィールドが不足しています: ${fileInfo.name}`);
    }
    
    // 設備名を抽出（タグ名から設備部分を取得）
    const equipment = fileContent.name.includes('.') 
      ? fileContent.name.split('.')[0] 
      : '';
    
    // 現在のタイムスタンプ
    const now = new Date().toISOString();
    
    // 入力を処理
    const inputs = Array.isArray(fileContent.inputs) ? fileContent.inputs : [];
    
    // 保存用の定義オブジェクトを作成
    const definition = {
      ...fileContent,
      equipment: equipment,
      sourceTags: inputs
    };
    
    // gtagsテーブルに挿入または更新
    const existingGtag = db.prepare('SELECT id FROM gtags WHERE name = ?').get(fileContent.name);
    
    if (existingGtag) {
      // 更新
      db.prepare(`
        UPDATE gtags 
        SET equipment = ?, description = ?, unit = ?, type = ?, definition = ?, updated_at = ?
        WHERE id = ?
      `).run(
        equipment,
        fileContent.description || '',
        fileContent.unit || '',
        fileContent.type,
        JSON.stringify(definition),
        now,
        existingGtag.id
      );
      console.log(`gtag「${fileContent.name}」を更新しました`);
    } else {
      // 新規作成
      const result = db.prepare(`
        INSERT INTO gtags (name, equipment, description, unit, type, definition, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fileContent.name,
        equipment,
        fileContent.description || '',
        fileContent.unit || '',
        fileContent.type,
        JSON.stringify(definition),
        now,
        now
      );
      console.log(`新しいgtag「${fileContent.name}」を登録しました（ID: ${result.lastInsertRowid}）`);
    }
    
    return definition;
  } catch (error) {
    console.error(`gtag定義のインポート中にエラーが発生しました (${fileInfo.name}):`, error);
    throw error;
  }
}

/**
 * すべてのgtag定義ファイルをロード
 */
async function loadAllGtagDefinitions() {
  try {
    if (!fs.existsSync(GTAG_DIR)) {
      fs.mkdirpSync(GTAG_DIR);
      return;
    }
    
    // gtagディレクトリを検索
    const gtagDirs = fs.readdirSync(GTAG_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    console.log(`${gtagDirs.length}個のgtagディレクトリを検出しました`);
    
    for (const gtagName of gtagDirs) {
      const defPath = path.join(GTAG_DIR, gtagName, 'def.json');
      
      // def.jsonが存在するか確認
      if (!fs.existsSync(defPath)) {
        console.warn(`gtag「${gtagName}」のdef.jsonが見つかりません`);
        continue;
      }
      
      try {
        const fileInfo = {
          path: defPath,
          name: gtagName,
          checksum: calculateGtagChecksum(defPath)
        };
        
        await importGtagDefinition(fileInfo);
        gtagChecksums.set(defPath, fileInfo.checksum);
      } catch (error) {
        console.error(`gtag定義「${gtagName}」のロード中にエラーが発生しました:`, error);
      }
    }
    
    console.log('すべてのgtag定義のロードが完了しました');
  } catch (error) {
    console.error('gtag定義のロード中にエラーが発生しました:', error);
  }
}

/**
 * 式を評価
 * @param {string} expression - 評価する式
 * @param {Array} inputValues - 入力値の配列
 * @returns {number} 計算結果
 */
function evaluateExpression(expression, inputValues) {
  try {
    // inputs[0], inputs[1]などの参照を実際の値に置換
    let evalReady = expression;
    
    // inputs[n]形式の参照を置換
    for (let i = 0; i < inputValues.length; i++) {
      const pattern = new RegExp(`inputs\\[${i}\\]`, 'g');
      evalReady = evalReady.replace(pattern, inputValues[i]);
    }
    
    // 計算式を評価
    return mathjs.evaluate(evalReady);
  } catch (error) {
    console.error(`式の評価中にエラーが発生しました: ${expression}`, error);
    throw error;
  }
}

/**
 * 最も近いデータポイントを見つける
 * @param {Array} tagPoints - タグのデータポイント配列
 * @param {string} targetTimestamp - 目標タイムスタンプ
 * @returns {Object|null} 最も近いデータポイント、なければnull
 */
function findClosestDataPoint(tagPoints, targetTimestamp) {
  if (!tagPoints || tagPoints.length === 0) return null;
  
  const targetTime = new Date(targetTimestamp).getTime();
  let closestPoint = tagPoints[0];
  let minDiff = Math.abs(new Date(closestPoint.timestamp).getTime() - targetTime);
  
  for (let i = 1; i < tagPoints.length; i++) {
    const diff = Math.abs(new Date(tagPoints[i].timestamp).getTime() - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      closestPoint = tagPoints[i];
    }
  }
  
  return closestPoint;
}

/**
 * 移動平均を計算
 * @param {Array} data - 計算対象のデータ
 * @param {number} windowSize - 窓サイズ
 * @returns {Array} 計算結果
 */
function calculateMovingAverage(data, windowSize = 5) {
  if (!data || data.length === 0) return [];
  
  // タイムスタンプでソート
  const sortedData = [...data].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  const result = [];
  for (let i = 0; i < sortedData.length; i++) {
    // 窓内のデータポイントを取得
    const windowStart = Math.max(0, i - windowSize + 1);
    const window = sortedData.slice(windowStart, i + 1);
    
    // 平均値を計算
    const sum = window.reduce((acc, point) => acc + point.value, 0);
    const average = sum / window.length;
    
    result.push({
      timestamp: sortedData[i].timestamp,
      value: average,
      original: sortedData[i].value
    });
  }
  
  return result;
}

/**
 * Z-scoreを計算
 * @param {Array} data - 計算対象のデータ
 * @param {number} windowSize - 窓サイズ (nullの場合は全データを使用)
 * @returns {Array} 計算結果
 */
function calculateZScore(data, windowSize = null) {
  if (!data || data.length === 0) return [];
  
  // タイムスタンプでソート
  const sortedData = [...data].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  const result = [];
  for (let i = 0; i < sortedData.length; i++) {
    // 窓の範囲を計算
    let window;
    if (windowSize) {
      const windowStart = Math.max(0, i - windowSize + 1);
      window = sortedData.slice(windowStart, i + 1);
    } else {
      window = sortedData.slice(0, i + 1);
    }
    
    // 平均と標準偏差を計算
    const values = window.map(point => point.value);
    const mean = values.reduce((acc, val) => acc + val, 0) / values.length;
    
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    // Z-scoreを計算 (標準偏差が0の場合は0を返す)
    const zScore = stdDev === 0 ? 0 : (sortedData[i].value - mean) / stdDev;
    
    result.push({
      timestamp: sortedData[i].timestamp,
      value: zScore,
      original: sortedData[i].value,
      mean: mean,
      stdDev: stdDev
    });
  }
  
  return result;
}

/**
 * 偏差値を計算
 * @param {Array} data - 計算対象のデータ
 * @param {number} windowSize - 窓サイズ (nullの場合は全データを使用)
 * @returns {Array} 計算結果
 */
function calculateDeviation(data, windowSize = null) {
  if (!data || data.length === 0) return [];
  
  // Z-scoreを計算
  const zScores = calculateZScore(data, windowSize);
  
  // 偏差値に変換 (Z-score * 10 + 50)
  return zScores.map(point => ({
    timestamp: point.timestamp,
    value: point.value * 10 + 50,
    original: point.original,
    mean: point.mean,
    stdDev: point.stdDev
  }));
}

/**
 * 式ベースの計算を実行
 * @param {string} expression - 計算式
 * @param {Object} inputTagsData - 入力タグのデータ
 * @returns {Array} 計算結果の配列
 */
function calculateExpressionData(expression, inputTagsData) {
  // すべての入力タグのタイムスタンプを統合してユニークにする
  const allTimestamps = new Set();
  
  Object.values(inputTagsData).forEach(tagPoints => {
    tagPoints.forEach(point => allTimestamps.add(point.timestamp));
  });
  
  // タイムスタンプでソート
  const sortedTimestamps = Array.from(allTimestamps).sort();
  
  // 各タイムスタンプでの計算結果を保持
  const result = [];
  
  for (const timestamp of sortedTimestamps) {
    // このタイムスタンプでの各タグの値を取得
    const inputValues = [];
    let allInputsHaveData = true;
    
    for (let i = 0; i < Object.keys(inputTagsData).length; i++) {
      const tagId = Object.keys(inputTagsData)[i];
      const tagData = inputTagsData[tagId];
      
      // 最も近いデータポイントを探す
      const closestPoint = findClosestDataPoint(tagData, timestamp);
      
      if (!closestPoint) {
        allInputsHaveData = false;
        break;
      }
      
      inputValues[i] = closestPoint.value;
    }
    
    if (allInputsHaveData) {
      // 式を評価
      try {
        const value = evaluateExpression(expression, inputValues);
        result.push({
          timestamp,
          value
        });
      } catch (error) {
        console.error(`式の評価中にエラーが発生しました: ${expression}`, error);
      }
    }
  }
  
  return result;
}

/**
 * カスタムPython関数を実行
 * @param {string} implementationPath - 実装ファイルパス
 * @param {string} functionName - 関数名
 * @param {Object} params - 関数パラメータ
 * @param {Object} inputTagsData - 入力タグのデータ
 * @returns {Promise<Array>} 実行結果
 */
async function executeCustomImplementation(implementationPath, functionName, params, inputTagsData) {
  try {
    // 一時ファイルに入力データを書き込む
    const inputFile = path.join(os.tmpdir(), `gtag_input_${Date.now()}.json`);
    const outputFile = path.join(os.tmpdir(), `gtag_output_${Date.now()}.json`);
    
    await fs.writeJson(inputFile, { inputTagsData, params });
    
    // 実行結果の保存先
    let result = [];
    
    try {
      // スクリプトを実行
      await new Promise((resolve, reject) => {
        // 実装ファイルのフルパスを解決
        const scriptFullPath = path.isAbsolute(implementationPath) 
          ? implementationPath 
          : path.resolve(GTAG_DIR, implementationPath);
        
        if (!fs.existsSync(scriptFullPath)) {
          reject(new Error(`実装ファイル「${scriptFullPath}」が見つかりません`));
          return;
        }
        
        const proc = spawn('python', [
          scriptFullPath,
          '--function', functionName,
          '--input', inputFile,
          '--output', outputFile
        ]);
        
        let stderr = '';
        
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Python実行エラー: ${stderr}`));
          }
        });
        
        proc.on('error', (err) => {
          reject(err);
        });
      });
      
      // 結果を読み込む
      if (fs.existsSync(outputFile)) {
        result = await fs.readJson(outputFile);
      }
    } finally {
      // 一時ファイルを削除
      if (fs.existsSync(inputFile)) await fs.remove(inputFile);
      if (fs.existsSync(outputFile)) await fs.remove(outputFile);
    }
    
    return result;
  } catch (error) {
    console.error(`カスタム実装実行中にエラーが発生しました:`, error);
    throw error;
  }
}

/**
 * 入力タグのデータを取得
 * @param {Array} inputs - 入力タグ識別子の配列
 * @param {Object} options - 取得オプション（start、endなど）
 * @returns {Promise<Object>} タグ識別子をキーとするデータオブジェクト
 */
async function getInputTagsData(inputs, options = {}) {
  const { start, end } = options;
  const inputTagsData = {};
  
  for (const input of inputs) {
    // タグ識別子を解決
    const tags = resolveTagIdentifier(input);
    
    if (tags.length === 0) {
      console.warn(`入力タグ「${input}」が見つかりません。スキップします。`);
      continue;
    }
    
    // 複数のタグが見つかった場合は最初のものを使用
    const tag = tags[0];
    
    // タグデータを取得
    let query = 'SELECT timestamp, value FROM tag_data WHERE tag_id = ?';
    const params = [tag.id];
    
    if (start) {
      query += ' AND timestamp >= ?';
      params.push(new Date(start).toISOString());
    }
    
    if (end) {
      query += ' AND timestamp <= ?';
      params.push(new Date(end).toISOString());
    }
    
    query += ' ORDER BY timestamp';
    inputTagsData[input] = db.prepare(query).all(...params);
  }
  
  return inputTagsData;
}

/**
 * gtag用のデータを取得
 * @param {Object} gtag - gtag定義
 * @param {Object} options - 取得オプション
 * @returns {Promise<Array>} gtag計算結果
 */
async function getGtagData(gtag, options = {}) {
  try {
    const definition = typeof gtag.definition === 'string' 
      ? JSON.parse(gtag.definition) 
      : gtag.definition;
    
    // 入力タグのデータを取得
    const inputs = definition.inputs || definition.sourceTags || [];
    const inputTagsData = await getInputTagsData(inputs, options);
    
    if (Object.keys(inputTagsData).length === 0) {
      return [];
    }
    
    // タイプに応じて処理を実行
    let gtagData;
    
    switch (definition.type) {
      case 'calculation':
        gtagData = calculateExpressionData(definition.expression, inputTagsData);
        break;
        
      case 'moving_average':
        // 単一入力の移動平均
        if (inputs.length !== 1) {
          throw new Error('移動平均は単一の入力が必要です');
        }
        gtagData = calculateMovingAverage(
          inputTagsData[inputs[0]], 
          definition.window || 5
        );
        break;
        
      case 'zscore':
        // 単一入力のZ-score
        if (inputs.length !== 1) {
          throw new Error('Z-scoreは単一の入力が必要です');
        }
        gtagData = calculateZScore(
          inputTagsData[inputs[0]], 
          definition.window
        );
        break;
        
      case 'deviation':
        // 単一入力の偏差値
        if (inputs.length !== 1) {
          throw new Error('偏差値は単一の入力が必要です');
        }
        gtagData = calculateDeviation(
          inputTagsData[inputs[0]], 
          definition.window
        );
        break;
        
      case 'custom':
        // カスタム実装（Pythonなど）
        if (!definition.implementation) {
          throw new Error('カスタム実装には実装ファイルパスが必要です');
        }
        
        // gtagディレクトリからの相対パスを構築
        const implementationPath = path.isAbsolute(definition.implementation)
          ? definition.implementation
          : path.join(GTAG_DIR, gtag.name, definition.implementation);
          
        gtagData = await executeCustomImplementation(
          implementationPath,
          definition.function || 'process',
          definition.params || {},
          inputTagsData
        );
        break;
        
      case 'raw':
        // 単一入力のrawデータ
        if (inputs.length !== 1) {
          throw new Error('rawタイプは単一の入力が必要です');
        }
        gtagData = inputTagsData[inputs[0]].map(point => ({
          timestamp: point.timestamp,
          value: point.value
        }));
        break;
        
      default:
        throw new Error(`未対応のgtag種類: ${definition.type}`);
    }
    
    return gtagData;
  } catch (error) {
    console.error(`gtagデータの取得中にエラーが発生しました (${gtag.name}):`, error);
    throw error;
  }
}

/**
 * 動的プロセスの実行
 * @param {string} target - 対象タグ識別子
 * @param {string} type - 処理タイプ
 * @param {Object} params - 処理パラメータ
 * @param {Object} options - 取得オプション
 * @returns {Promise<Array>} 処理結果
 */
async function executeProcess(target, type, params = {}, options = {}) {
  try {
    // 対象タグの取得
    const tags = resolveTagIdentifier(target);
    
    if (tags.length === 0) {
      throw new Error(`対象タグ「${target}」が見つかりません`);
    }
    
    // 対象タグのデータを取得
    const tag = tags[0];
    const inputTagsData = await getInputTagsData([tag.name], options);
    
    if (Object.keys(inputTagsData).length === 0 || !inputTagsData[tag.name] || inputTagsData[tag.name].length === 0) {
      return [];
    }
    
    // タイプに応じて処理を実行
    switch (type) {
      case 'moving_average':
        return calculateMovingAverage(
          inputTagsData[tag.name], 
          params.window || 5
        );
        
      case 'zscore':
        return calculateZScore(
          inputTagsData[tag.name], 
          params.window
        );
        
      case 'deviation':
        return calculateDeviation(
          inputTagsData[tag.name], 
          params.window
        );
        
      case 'raw':
        return inputTagsData[tag.name].map(point => ({
          timestamp: point.timestamp,
          value: point.value
        }));
        
      default:
        throw new Error(`未対応の処理タイプ: ${type}`);
    }
  } catch (error) {
    console.error(`プロセス実行中にエラーが発生しました (${target}, ${type}):`, error);
    throw error;
  }
}

/**
 * gtag初期化（テーブル作成とインデックス設定）
 */
function initializeGtagSystem() {
  try {
    // gtagsテーブルの作成
    db.prepare(`
      CREATE TABLE IF NOT EXISTS gtags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        equipment TEXT NOT NULL,
        description TEXT,
        unit TEXT,
        type TEXT NOT NULL,
        definition TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    
    // インデックス作成
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_gtags_equipment ON gtags(equipment)
    `).run();
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_gtags_name ON gtags(name)
    `).run();
    
    console.log('gtagシステムの初期化が完了しました');
  } catch (error) {
    console.error('gtagシステム初期化中にエラーが発生しました:', error);
    throw error;
  }
}

module.exports = {
  initializeGtagSystem,
  loadAllGtagDefinitions,
  detectChangedGtagFiles,
  importGtagDefinition,
  getGtagData,
  executeProcess,
  resolveTagIdentifier,
  evaluateExpression,
  calculateExpressionData,
  calculateMovingAverage,
  calculateZScore,
  calculateDeviation,
  executeCustomImplementation,
  gtagChecksums
};
