// src/utils/gtag-utils.js
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { query, get, run } = require('../db');
const mathjs = require('mathjs');
const os = require('os');
const { calculateMovingAverage, calculateZScore, calculateDeviation } = require('./data-processing');

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
 * @returns {Promise<Array<Object>>} 見つかったタグのリスト
 */
async function resolveTagIdentifier(identifier) {
  try {
    // 整数の場合はタグIDとして使用
    if (typeof identifier === 'number' || /^\d+$/.test(identifier)) {
      const tagId = parseInt(identifier, 10);
      const tag = await get('SELECT * FROM tags WHERE id = $1', [tagId]);
      return tag ? [tag] : [];
    }

    // 文字列の場合
    if (typeof identifier === 'string') {
      // ピリオドを含む場合はタグ名として検索
      if (identifier.includes('.')) {
        const tag = await get('SELECT * FROM tags WHERE name = $1', [identifier]);
        return tag ? [tag] : [];
      }

      // コロンを含む場合は「設備:ソースタグ」として解釈
      if (identifier.includes(':')) {
        const [equipment, sourceTag] = identifier.split(':');
        return await query('SELECT * FROM tags WHERE equipment = $1 AND source_tag = $2', [equipment, sourceTag]);
      }

      // それ以外はソースタグとして検索
      return await query('SELECT * FROM tags WHERE source_tag = $1', [identifier]);
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
    const existingGtag = await get('SELECT id FROM gtags WHERE name = $1', [fileContent.name]);

    if (existingGtag) {
      // 更新
      await run(`
        UPDATE gtags
        SET equipment = $1, description = $2, unit = $3, type = $4, definition = $5, updated_at = $6
        WHERE id = $7
      `, [
        equipment,
        fileContent.description || '',
        fileContent.unit || '',
        fileContent.type,
        JSON.stringify(definition),
        now,
        existingGtag.id
      ]);
      console.log(`gtag「${fileContent.name}」を更新しました`);
    } else {
      // 新規作成
      const result = await run(`
        INSERT INTO gtags (name, equipment, description, unit, type, definition, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [
        fileContent.name,
        equipment,
        fileContent.description || '',
        fileContent.unit || '',
        fileContent.type,
        JSON.stringify(definition),
        now,
        now
      ]);
      console.log(`新しいgtag「${fileContent.name}」を登録しました（ID: ${result.lastID}）`);
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
 * タグ参照パターンを標準形式に変換
 * @param {string} expression - 評価する式
 * @param {Array} inputTags - 入力タグの配列
 * @returns {string} 変換後の式
 */
function normalizeExpression(expression, inputTags) {
  let normalizedExpr = expression;
  
  // タグ名形式 (Pump01.Flow) を inputs[n] 形式に変換
  if (inputTags && inputTags.length > 0) {
    for (let i = 0; i < inputTags.length; i++) {
      const tagName = inputTags[i];
      const escapedTagName = tagName.replace(/\./g, '\\.');
      const pattern = new RegExp(escapedTagName, 'g');
      normalizedExpr = normalizedExpr.replace(pattern, `inputs[${i}]`);
    }
  }
  
  return normalizedExpr;
}

/**
 * 式を評価
 * @param {string} expression - 評価する式
 * @param {Array} inputValues - 入力値の配列
 * @param {Array} inputTags - 入力タグの配列（オプション）
 * @returns {number} 計算結果
 */
function evaluateExpression(expression, inputValues, inputTags = []) {
  try {
    // 式内のタグ名を標準形式に変換
    const normalizedExpr = normalizeExpression(expression, inputTags);
    
    // inputs[0], inputs[1]などの参照を実際の値に置換
    let evalReady = normalizedExpr;
    
    // inputs[n]形式の参照を置換
    for (let i = 0; i < inputValues.length; i++) {
      const pattern = new RegExp(`inputs\\[${i}\\]`, 'g');
      evalReady = evalReady.replace(pattern, inputValues[i]);
    }
    
    // 計算式を評価
    try {
      return mathjs.evaluate(evalReady);
    } catch (mathError) {
      // mathjs固有のエラーをより明確にログ
      throw new Error(`${mathError.message} (解析された式: ${evalReady})`);
    }
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
  
  // 入力タグのID配列
  const inputTagIds = Object.keys(inputTagsData);
  
  // 検証用のエラーカウンタ（同じエラーの繰り返し出力を防ぐ）
  const errorCounts = {};
  
  for (const timestamp of sortedTimestamps) {
    // このタイムスタンプでの各タグの値を取得
    const inputValues = [];
    let allInputsHaveData = true;
    
    for (let i = 0; i < inputTagIds.length; i++) {
      const tagId = inputTagIds[i];
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
        const value = evaluateExpression(expression, inputValues, inputTagIds);
        result.push({
          timestamp,
          value
        });
      } catch (error) {
        // エラー数をカウント
        const errorKey = error.message;
        errorCounts[errorKey] = (errorCounts[errorKey] || 0) + 1;
        
        // 同じエラーは最初の数回だけ詳細にログ
        if (errorCounts[errorKey] <= 3) {
          console.error(`式の評価中にエラーが発生しました: ${expression}`, error);
        } else if (errorCounts[errorKey] === 4) {
          console.error(`式の評価エラーが多数発生しています。以降は抑制します: ${expression}`);
        }
      }
    }
  }
  
  return result;
}

/**
 * カスタム処理スクリプトを実行
 * @param {string} implementationPath - 実装ファイルパス
 * @param {Array} args - コマンドライン引数
 * @param {Object} inputTagsData - 入力タグのデータ
 * @returns {Promise<Array>} 実行結果
 */
async function executeCustomImplementation(implementationPath, args, inputTagsData) {
  return new Promise((resolve, reject) => {
    try {
      // 実装ファイルの存在確認
      if (!fs.existsSync(implementationPath)) {
        throw new Error(`実装ファイル「${implementationPath}」が見つかりません`);
      }
      
      console.log(`カスタム実装を実行します: ${path.basename(implementationPath)} (引数: ${args.join(' ')})`);
      
      // 実行ファイルの権限を確認し、必要に応じて調整
      try {
        fs.accessSync(implementationPath, fs.constants.X_OK);
      } catch (err) {
        // 実行権限がない場合は付与を試みる
        console.warn(`実行ファイル「${implementationPath}」に実行権限を付与します`);
        try {
          fs.chmodSync(implementationPath, '755');
        } catch (chmodErr) {
          throw new Error(`実行権限の付与に失敗しました: ${chmodErr.message}`);
        }
      }
      
      // 引数付きでプロセスを実行
      const proc = spawn(implementationPath, args);
      
      // すべてのタイムスタンプを収集して一意にする
      const allTimestamps = new Set();
      Object.values(inputTagsData).forEach(points => {
        points.forEach(point => allTimestamps.add(point.timestamp));
      });
      
      // タイムスタンプでソート
      const sortedTimestamps = Array.from(allTimestamps).sort();
      
      // 各タイムスタンプでの全てのタグの値を行として書き込む
      const inputTagNames = Object.keys(inputTagsData);
      
      let i = 0;
      const writeNext = () => {
        if (i < sortedTimestamps.length) {
          const timestamp = sortedTimestamps[i++];
          
          // このタイムスタンプにおける各タグの値を収集
          const values = inputTagNames.map(tagName => {
            const point = inputTagsData[tagName].find(p => p.timestamp === timestamp);
            return point ? point.value : 'null';
          });
          
          // timestamp,value1,value2,... 形式の行を作成
          const line = `${timestamp},${values.join(',')}\n`;
          
          // バックプレッシャーがあれば待機
          const canContinue = proc.stdin.write(line);
          if (canContinue) {
            process.nextTick(writeNext);
          } else {
            proc.stdin.once('drain', writeNext);
          }
        } else {
          proc.stdin.end();
        }
      };
      
      // データの書き込みを開始
      writeNext();
      
      // ストリーミング出力処理
      const results = [];
      let outputBuffer = '';
      
      proc.stdout.on('data', (chunk) => {
        outputBuffer += chunk.toString();
        processOutputBuffer();
      });
      
      function processOutputBuffer() {
        const lines = outputBuffer.split('\n');
        outputBuffer = lines.pop() || '';  // 最後の不完全な行を保持
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const [timestamp, valueStr] = line.split(',');
              const value = parseFloat(valueStr);
              
              if (!isNaN(value)) {
                results.push({
                  timestamp,
                  value
                });
              }
            } catch (err) {
              console.warn(`無効な出力行: ${line}`);
            }
          }
        }
      }
      
      // エラー処理
      let stderr = '';
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      // 完了処理
      proc.on('close', (code) => {
        // 残りのバッファを処理
        if (outputBuffer) {
          processOutputBuffer();
        }
        
        if (code === 0) {
          resolve(results);
        } else {
          reject(new Error(`プロセスが終了コード ${code} で終了しました: ${stderr}`));
        }
      });
      
      proc.on('error', (err) => {
        reject(new Error(`プロセス実行エラー: ${err.message}`));
      });
      
    } catch (error) {
      reject(new Error(`カスタム実装実行中にエラー: ${error.message}`));
    }
  });
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
    const tags = await resolveTagIdentifier(input);

    if (tags.length === 0) {
      console.warn(`入力タグ「${input}」が見つかりません。スキップします。`);
      continue;
    }

    // 複数のタグが見つかった場合は最初のものを使用
    const tag = tags[0];

    // タグデータを取得
    let sql = 'SELECT timestamp, value FROM tag_data WHERE tag_id = $1';
    const params = [tag.id];
    let paramIndex = 1;

    if (start) {
      sql += ` AND timestamp >= $${++paramIndex}`;
      params.push(new Date(start).toISOString());
    }

    if (end) {
      sql += ` AND timestamp <= $${++paramIndex}`;
      params.push(new Date(end).toISOString());
    }

    sql += ' ORDER BY timestamp';
    inputTagsData[input] = await query(sql, params);
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
        // 単一入力の確認
        if (inputs.length !== 1) {
          throw new Error('moving_averageタイプは単一の入力が必要です');
        }
        // 移動平均計算関数を使用
        gtagData = calculateMovingAverage(
          inputTagsData[inputs[0]],
          definition.window || 5
        );
        break;
        
      case 'zscore':
        // 単一入力の確認
        if (inputs.length !== 1) {
          throw new Error('zscoreタイプは単一の入力が必要です');
        }
        // Z-score計算関数を使用
        gtagData = calculateZScore(
          inputTagsData[inputs[0]],
          definition.window
        );
        break;
        
      case 'deviation':
        // 単一入力の確認
        if (inputs.length !== 1) {
          throw new Error('deviationタイプは単一の入力が必要です');
        }
        // 偏差値計算関数を使用
        gtagData = calculateDeviation(
          inputTagsData[inputs[0]],
          definition.window
        );
        break;

      case 'custom':
        // カスタム実装（Pythonなど）
        // 実行ファイルパスの決定（progフィールドを優先）
        let progPath = definition.prog;
        
        // 後方互換性のために、progがなければimplementationまたはbinを使用
        if (!progPath) {
          progPath = definition.implementation || definition.bin;
          if (!progPath) {
            throw new Error(`${gtag.name}: 実行ファイルのパスが指定されていません。progフィールドを設定してください。`);
          }
        }
        
        // gtagディレクトリからの相対パスを構築
        let scriptPath;
        if (path.isAbsolute(progPath)) {
          scriptPath = progPath;
        } else {
          // binディレクトリ内にあるか確認
          const binPath = path.join(GTAG_DIR, gtag.name, 'bin', progPath);
          const directPath = path.join(GTAG_DIR, gtag.name, progPath);
          
          if (fs.existsSync(binPath)) {
            scriptPath = binPath;
          } else if (fs.existsSync(directPath)) {
            scriptPath = directPath;
          } else {
            throw new Error(`${gtag.name}: 実行ファイル「${progPath}」が見つかりません。パス「${binPath}」と「${directPath}」を確認しました。`);
          }
        }
        
        console.log(`${gtag.name}: スクリプト実行パス: ${scriptPath}`);
        
        // 引数を準備
        let args = [];
        
        // argsフィールドがあればそれを使用
        if (Array.isArray(definition.args)) {
          args = [...definition.args];
        } 
        // 後方互換性のための処理
        else {
          // functionフィールドがあれば第一引数として追加
          if (definition.function) {
            args.push(definition.function);
          }
          
          // paramsがあれば、それを引数形式に変換
          if (definition.params && typeof definition.params === 'object') {
            Object.entries(definition.params).forEach(([key, value]) => {
              args.push(`--${key}=${value}`);
            });
          }
        }
        
        // スクリプトを実行
        gtagData = await executeCustomImplementation(
          scriptPath,
          args,
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
        throw new Error(`未対応のgtag種類: ${definition.type} (${gtag.name})`);
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
    const tags = await resolveTagIdentifier(target);

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
 * Note: gtagsテーブルはTimescaleDB init-timescaledb.sqlで既に作成済み
 */
function initializeGtagSystem() {
  try {
    // TimescaleDBではテーブルとインデックスは init-timescaledb.sql で作成済み
    // ここでは何もしない（互換性のために関数のみ残す）
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
