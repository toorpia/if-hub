// src/utils/csv-importer.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const moment = require('moment');
const { db } = require('../db');
const config = require('../config');

// CSVフォルダパス
const CSV_FOLDER = config.dataSource.staticDataPath;

// 配列の内容が等しいかを比較
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ユニット推測関数（既存関数を再利用）
function guessUnit(tagName) {
  const tagLower = tagName.toLowerCase();
  if (tagLower.includes('temp')) return '°C';
  if (tagLower.includes('press')) return 'kPa';
  if (tagLower.includes('flow')) return 'm³/h';
  if (tagLower.includes('level')) return '%';
  if (tagLower.includes('speed') || tagLower.includes('rpm')) return 'rpm';
  if (tagLower.includes('current')) return 'A';
  if (tagLower.includes('voltage')) return 'V';
  if (tagLower.includes('power')) return 'kW';
  return '';
}

// CSVデータをインポート
async function importCsvToDatabase() {
  console.log('CSVデータのインポートを開始します...');
  
  try {
    // CSVファイル一覧を取得
    const files = fs.readdirSync(CSV_FOLDER).filter(file => file.endsWith('.csv'));
    console.log(`${files.length}個のCSVファイルを見つけました`);
    
    // 既存のデータを削除（オプション、環境に応じて）
    // db.exec('DELETE FROM tag_data');
    // db.exec('DELETE FROM tags');
    
    let totalTagCount = 0;
    let totalDataPointCount = 0;
    
    // 各ファイルを処理
    for (const file of files) {
      const equipmentId = path.basename(file, '.csv');
      const filePath = path.join(CSV_FOLDER, file);
      console.log(`ファイル ${file} を処理中...`);
      
      // CSVを読み込む
      const rows = [];
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (row) => rows.push(row))
          .on('end', () => {
            console.log(`  ${file} から ${rows.length} 行を読み込みました`);
            resolve();
          })
          .on('error', reject);
      });
      
      if (rows.length === 0) {
        console.log(`  ${file} はデータがありません。スキップします。`);
        continue;
      }
      
      // ヘッダー（タグ名）を取得
      const headers = Object.keys(rows[0]);
      
      // タイムスタンプ列を特定
      const timestampColumn = headers.find(h => 
        h.toLowerCase().includes('time') || 
        h.toLowerCase().includes('date')
      ) || headers[0]; // 見つからない場合は最初の列を使用
      
      console.log(`  タイムスタンプ列: ${timestampColumn}`);
      console.log(`  検出されたタグ: ${headers.filter(h => h !== timestampColumn).join(', ')}`);
      
      // トランザクション処理で高速化
      db.exec('BEGIN TRANSACTION');
      
      try {
        // 各タグのデータを処理
        for (const header of headers) {
          if (header !== timestampColumn) {
            const tagId = `${equipmentId}.${header}`;
            console.log(`  タグ ${tagId} を処理中...`);
            
            // タグ値を抽出
            const tagValues = rows
              .map(row => parseFloat(row[header]))
              .filter(val => !isNaN(val));
            
            if (tagValues.length === 0) {
              console.log(`    有効な数値データがありません。スキップします。`);
              continue;
            }
            
            const min = Math.min(...tagValues);
            const max = Math.max(...tagValues);
            
            // タグレコードの挿入または更新
            const stmtTag = db.prepare(`
              INSERT OR REPLACE INTO tags (id, equipment, name, source_tag, unit, min, max)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmtTag.run(
              tagId,
              equipmentId,
              header,
              header,        // source_tagとして元のタグ名を保存
              guessUnit(header),
              min,
              max
            );
            
            totalTagCount++;
            
            // データポイントをバッチで挿入（チャンクに分割して処理）
            const stmtData = db.prepare(`
              INSERT OR REPLACE INTO tag_data (tag_id, timestamp, value)
              VALUES (?, ?, ?)
            `);
            
            // バッチ挿入用トランザクション
            const insertBatch = db.transaction((points) => {
              for (const point of points) {
                stmtData.run(point.tagId, point.timestamp, point.value);
              }
            });
            
            // データポイントを作成
            const dataPoints = [];
            for (const row of rows) {
              const value = parseFloat(row[header]);
              if (!isNaN(value)) {
                try {
                  // 日時フォーマットの解析を試みる
                  const timestamp = moment(row[timestampColumn], [
                    'YYYY-MM-DD HH:mm:ss',
                    'YYYY/MM/DD HH:mm:ss',
                    'MM/DD/YYYY HH:mm:ss',
                    'DD/MM/YYYY HH:mm:ss',
                    // 他のフォーマットも必要に応じて追加
                  ]).toISOString();
                  
                  dataPoints.push({
                    tagId,
                    timestamp,
                    value
                  });
                } catch (err) {
                  console.warn(`    日時の解析に失敗しました: ${row[timestampColumn]}`);
                }
              }
            }
            
            // データポイントをチャンクに分割して挿入（メモリ消費を抑える）
            const CHUNK_SIZE = 1000;
            for (let i = 0; i < dataPoints.length; i += CHUNK_SIZE) {
              const chunk = dataPoints.slice(i, i + CHUNK_SIZE);
              insertBatch(chunk);
            }
            
            totalDataPointCount += dataPoints.length;
            console.log(`    ${dataPoints.length} データポイントを挿入しました`);
          }
        }
        
        db.exec('COMMIT');
        console.log(`  ${file} の処理が完了しました`);
      } catch (error) {
        db.exec('ROLLBACK');
        console.error(`  ${file} の処理中にエラーが発生しました:`, error);
      }
    }
    
    console.log('CSVデータのインポートが完了しました');
    console.log(`合計: ${totalTagCount} タグ, ${totalDataPointCount} データポイント`);
    
    return { totalTagCount, totalDataPointCount };
  } catch (error) {
    console.error('CSVデータのインポート中にエラーが発生しました:', error);
    throw error;
  }
}

/**
 * ヘッダー行を取得する
 * @param {string} filePath CSVファイルパス
 * @returns {Promise<Object>} ヘッダー行
 */
async function getHeaderRow(filePath) {
  return new Promise((resolve, reject) => {
    let headerRow = null;
    const stream = fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        headerRow = row;
        stream.destroy(); // 最初の行を取得したらストリームを終了
      })
      .on('end', () => {
        if (headerRow) {
          resolve(headerRow);
        } else {
          reject(new Error('CSVファイルにヘッダー行がありません'));
        }
      })
      .on('error', reject);
  });
}

/**
 * 特定のタグのデータを処理する
 * @param {string} filePath CSVファイルパス
 * @param {string} tagId タグID
 * @param {string} header ヘッダー名
 * @param {string} timestampColumn タイムスタンプ列名
 * @param {string} equipmentId 設備ID
 * @returns {Promise<Object>} 処理結果（最小値、最大値、データポイント数）
 */
async function processTagData(filePath, tagId, header, timestampColumn, equipmentId) {
  return new Promise((resolve, reject) => {
    let min = Infinity;
    let max = -Infinity;
    let count = 0;
    let batch = [];
    const BATCH_SIZE = 500; // より小さなバッチサイズに変更
    
    // タグデータ用のステートメントを準備
    const stmtData = db.prepare(`
      INSERT OR REPLACE INTO tag_data (tag_id, timestamp, value)
      VALUES (?, ?, ?)
    `);
    
    // タグ用のステートメントを準備
    const stmtTag = db.prepare(`
      INSERT OR REPLACE INTO tags (id, equipment, name, source_tag, unit, min, max)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    // トランザクション開始
    db.exec('BEGIN TRANSACTION');
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        const value = parseFloat(row[header]);
        if (!isNaN(value)) {
          // 最小値と最大値を更新
          min = Math.min(min, value);
          max = Math.max(max, value);
          
          try {
            // 日時フォーマット変換
            const timestamp = moment(row[timestampColumn], [
              'YYYY-MM-DD HH:mm:ss',
              'YYYY/MM/DD HH:mm:ss',
              'MM/DD/YYYY HH:mm:ss',
              'DD/MM/YYYY HH:mm:ss',
              // 他のフォーマットも必要に応じて追加
            ]).toISOString();
            
            // バッチに追加
            batch.push({
              tagId,
              timestamp,
              value
            });
            count++;
            
            // バッチサイズに達したらDBに挿入
            if (batch.length >= BATCH_SIZE) {
              for (const point of batch) {
                stmtData.run(point.tagId, point.timestamp, point.value);
              }
              batch = []; // バッチをクリア
              
              // 定期的にコミットして新しいトランザクションを開始（メモリ解放）
              db.exec('COMMIT');
              db.exec('BEGIN TRANSACTION');
            }
          } catch (err) {
            console.warn(`    日時の解析に失敗しました: ${row[timestampColumn]}`);
          }
        }
      })
      .on('end', () => {
        try {
          // 残りのバッチを処理
          if (batch.length > 0) {
            for (const point of batch) {
              stmtData.run(point.tagId, point.timestamp, point.value);
            }
          }
          
          // タグレコード更新
          if (count > 0) {
            stmtTag.run(
              tagId,
              equipmentId,
              header,
              header,
              guessUnit(header),
              min === Infinity ? 0 : min,
              max === -Infinity ? 0 : max
            );
          }
          
          // トランザクション完了
          db.exec('COMMIT');
          console.log(`    ${count} データポイントを挿入しました`);
          resolve({ min, max, count });
        } catch (error) {
          db.exec('ROLLBACK');
          reject(error);
        }
      })
      .on('error', (err) => {
        db.exec('ROLLBACK');
        reject(err);
      });
  });
}

/**
 * 特定のCSVファイルをインポート
 * @param {Object} fileInfo ファイル情報（path, name, equipmentId, checksum）
 * @returns {Promise<Object>} インポート結果
 */
async function importSpecificCsvFile(fileInfo) {
  console.log(`CSVファイル ${fileInfo.name} のインポートを開始します...`);
  
  try {
    const equipmentId = fileInfo.equipmentId;
    const filePath = fileInfo.path;
    
    // ヘッダー行のみを取得（ストリーミングで効率的に）
    let headerRow;
    try {
      headerRow = await getHeaderRow(filePath);
    } catch (error) {
      console.log(`  ${fileInfo.name} はデータがありません。スキップします。`);
      return { tagCount: 0, dataPointCount: 0 };
    }
    
    // ヘッダー（タグ名）を取得
    const headers = Object.keys(headerRow);
    
    // タイムスタンプ列を特定
    const timestampColumn = headers.find(h => 
      h.toLowerCase().includes('time') || 
      h.toLowerCase().includes('date')
    ) || headers[0];
    
    // タグ名だけを抽出（タイムスタンプ列を除く）
    const tagHeaders = headers.filter(h => h !== timestampColumn);
    
    console.log(`  タイムスタンプ列: ${timestampColumn}`);
    console.log(`  検出されたタグ: ${tagHeaders.join(', ')}`);
    
    // 当該設備の既存タグを取得して比較
    const existingTags = db.prepare('SELECT name FROM tags WHERE equipment = ?').all(equipmentId)
      .map(tag => tag.name);
    
    // タグ構成が変わっている場合、当該設備のデータを全削除
    const tagsChanged = !arraysEqual(existingTags.sort(), tagHeaders.sort());
    
    // タグ構成変更時は設備データを削除（独立したトランザクションで）
    if (tagsChanged) {
      console.log(`  設備 ${equipmentId} のタグ構成が変更されました。既存データを削除します。`);
      
      db.exec('BEGIN TRANSACTION');
      try {
        // 設備に関連するタグIDを取得
        const tagIds = db.prepare('SELECT id FROM tags WHERE equipment = ?').all(equipmentId)
          .map(tag => tag.id);
        
        // タグデータを削除
        for (const tagId of tagIds) {
          db.prepare('DELETE FROM tag_data WHERE tag_id = ?').run(tagId);
        }
        
        // タグを削除
        db.prepare('DELETE FROM tags WHERE equipment = ?').run(equipmentId);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
    
    // 各タグを個別に処理（分割して処理することでメモリ使用量を抑制）
    let tagCount = 0;
    let dataPointCount = 0;
    
    // タグごとに個別にデータを処理
    for (const header of tagHeaders) {
      const tagId = `${equipmentId}.${header}`;
      console.log(`  タグ ${tagId} を処理中...`);
      
      try {
        // タグデータをストリーミング処理
        const result = await processTagData(filePath, tagId, header, timestampColumn, equipmentId);
        
        if (result.count > 0) {
          tagCount++;
          dataPointCount += result.count;
        } else {
          console.log(`    有効な数値データがありません。スキップします。`);
        }
      } catch (error) {
        console.error(`    タグ ${tagId} の処理中にエラーが発生しました:`, error);
        // エラーが発生しても他のタグの処理を続行
      }
    }
    
    console.log(`  ${fileInfo.name} の処理が完了しました`);
    return { tagCount, dataPointCount };
  } catch (error) {
    console.error(`CSVファイル ${fileInfo.name} のインポート中にエラーが発生しました:`, error);
    throw error;
  }
}

module.exports = { importCsvToDatabase, importSpecificCsvFile };
