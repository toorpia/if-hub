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
const GTAG_DEFINITIONS_DIR = path.join(GTAG_DIR, 'definitions');
const GTAG_SCRIPTS_DIR = path.join(GTAG_DIR, 'scripts');

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
    if (!fs.existsSync(GTAG_DEFINITIONS_DIR)) {
      fs.mkdirpSync(GTAG_DEFINITIONS_DIR);
      return [];
    }

    const files = fs.readdirSync(GTAG_DEFINITIONS_DIR);
    const changedFiles = [];

    for (const file of files) {
      if (path.extname(file) !== '.json') continue;

      const filePath = path.join(GTAG_DEFINITIONS_DIR, file);
      const checksum = calculateGtagChecksum(filePath);
      const oldChecksum = gtagChecksums.get(filePath);

      if (oldChecksum !== checksum) {
        changedFiles.push({
          path: filePath,
          name: file,
          checksum
        });
        gtagChecksums.set(filePath, checksum);
      }
    }

    return changedFiles;
  } catch (error) {
    console.error('gtag定義ファイルの検出中にエラーが発生しました:', error);
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
    
    if (!fileContent.name || !fileContent.equipment || !fileContent.type) {
      throw new Error(`必須フィールドが不足しています: ${fileInfo.name}`);
    }
    
    // 現在のタイムスタンプ
    const now = new Date().toISOString();
    
    // gtagsテーブルに挿入または更新
    const existingGtag = db.prepare('SELECT id FROM gtags WHERE name = ?').get(fileContent.name);
    
    if (existingGtag) {
      // 更新
      db.prepare(`
        UPDATE gtags 
        SET equipment = ?, description = ?, unit = ?, type = ?, definition = ?, updated_at = ?
        WHERE id = ?
      `).run(
        fileContent.equipment,
        fileContent.description || '',
        fileContent.unit || '',
        fileContent.type,
        JSON.stringify(fileContent),
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
        fileContent.equipment,
        fileContent.description || '',
        fileContent.unit || '',
        fileContent.type,
        JSON.stringify(fileContent),
        now,
        now
      );
      console.log(`新しいgtag「${fileContent.name}」を登録しました（ID: ${result.lastInsertRowid}）`);
    }
    
    return fileContent;
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
    if (!fs.existsSync(GTAG_DEFINITIONS_DIR)) {
      fs.mkdirpSync(GTAG_DEFINITIONS_DIR);
      return;
    }
    
    const files = fs.readdirSync(GTAG_DEFINITIONS_DIR)
      .filter(file => path.extname(file) === '.json');
    
    console.log(`${files.length}個のgtag定義ファイルを読み込みます`);
    
    for (const file of files) {
      const filePath = path.join(GTAG_DEFINITIONS_DIR, file);
      
      try {
        const fileInfo = {
          path: filePath,
          name: file,
          checksum: calculateGtagChecksum(filePath)
        };
        
        await importGtagDefinition(fileInfo);
        gtagChecksums.set(filePath, fileInfo.checksum);
      } catch (error) {
        console.error(`gtag定義「${file}」のロード中にエラーが発生しました:`, error);
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
 * @param {Object} tagValues - タグIDと値のマッピング
 * @returns {number} 計算結果
 */
function evaluateExpression(expression, tagValues) {
  // タグIDを実際の値に置換
  let evalReady = expression;
  
  for (const [tagId, value] of Object.entries(tagValues)) {
    // タグIDに特殊文字が含まれている可能性があるため、正規表現エスケープ
    const escapedTagId = tagId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedTagId, 'g');
    evalReady = evalReady.replace(regex, value);
  }
  
  return mathjs.evaluate(evalReady);
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
 * 四則演算の計算を実行
 * @param {string} expression - 計算式
 * @param {Object} sourceTagData - ソースタグのデータ
 * @returns {Array} 計算結果の配列
 */
function calculateExpressionData(expression, sourceTagData) {
  // すべてのソースタグのタイムスタンプを統合してユニークにする
  const allTimestamps = new Set();
  
  Object.values(sourceTagData).forEach(tagPoints => {
    tagPoints.forEach(point => allTimestamps.add(point.timestamp));
  });
  
  // タイムスタンプでソート
  const sortedTimestamps = Array.from(allTimestamps).sort();
  
  // 各タイムスタンプでの計算結果を保持
  const result = [];
  
  for (const timestamp of sortedTimestamps) {
    // このタイムスタンプでの各タグの値を取得
    const tagValues = {};
    
    let allTagsHaveData = true;
    for (const [tagId, tagPoints] of Object.entries(sourceTagData)) {
      // 最も近いデータポイントを探す
      const closestPoint = findClosestDataPoint(tagPoints, timestamp);
      
      if (!closestPoint) {
        allTagsHaveData = false;
        break;
      }
      
      tagValues[tagId] = closestPoint.value;
    }
    
    if (allTagsHaveData) {
      // 式を評価
      try {
        const value = evaluateExpression(expression, tagValues);
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
 * Python関数を実行
 * @param {string} script - スクリプト名
 * @param {string} functionName - 関数名
 * @param {Object} params - 関数パラメータ
 * @param {Object} tagData - タグデータ
 * @returns {Promise<Array>} 実行結果
 */
async function executePythonFunction(script, functionName, params, tagData) {
  try {
    // 一時ファイルに入力データを書き込む
    const inputFile = path.join(os.tmpdir(), `gtag_input_${Date.now()}.json`);
    const outputFile = path.join(os.tmpdir(), `gtag_output_${Date.now()}.json`);
    
    await fs.writeJson(inputFile, { tagData, params });
    
    // 実行結果の保存先
    let result = [];
    
    try {
      // スクリプトを実行
      await new Promise((resolve, reject) => {
        const scriptPath = path.join(GTAG_SCRIPTS_DIR, script);
        if (!fs.existsSync(scriptPath)) {
          reject(new Error(`スクリプト「${script}」が見つかりません`));
          return;
        }
        
        const proc = spawn('python', [
          scriptPath,
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
    console.error(`Python関数実行中にエラーが発生しました:`, error);
    throw error;
  }
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
    
    const { start, end } = options;
    
    // ソースタグのデータを取得
    const sourceTagData = {};
    
    for (const sourceTagName of definition.sourceTags) {
      // テキスト形式のタグ名から整数IDを取得
      const tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(sourceTagName);
      
      if (!tag) {
        console.warn(`ソースタグ「${sourceTagName}」が見つかりません。スキップします。`);
        continue;
      }
      
      // 整数IDを使用してタグデータを取得
      let query = 'SELECT timestamp, value FROM tag_data WHERE tag_id = ?';
      const params = [tag.id]; // 整数型のtag_id
      
      if (start) {
        query += ' AND timestamp >= ?';
        params.push(new Date(start).toISOString());
      }
      
      if (end) {
        query += ' AND timestamp <= ?';
        params.push(new Date(end).toISOString());
      }
      
      query += ' ORDER BY timestamp';
      sourceTagData[sourceTagName] = db.prepare(query).all(...params);
    }
    
    // gtagの種類に応じて計算
    let gtagData;
    
    if (definition.type === 'calculation') {
      gtagData = calculateExpressionData(definition.expression, sourceTagData);
    } else if (definition.type === 'python') {
      gtagData = await executePythonFunction(
        definition.script,
        definition.function,
        definition.parameters || {},
        sourceTagData
      );
    } else {
      throw new Error(`未対応のgtag種類: ${definition.type}`);
    }
    
    return gtagData;
  } catch (error) {
    console.error(`gtagデータの取得中にエラーが発生しました (${gtag.name}):`, error);
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
  evaluateExpression,
  calculateExpressionData,
  executePythonFunction,
  gtagChecksums
};
