// src/utils/csv-importer.js
// Copyright (c) 2025 toorPIA / toor Inc.
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const moment = require('moment');
const { db } = require('../db');
const config = require('../config');
const { applyMetadataToTag } = require('./tag-metadata-importer');

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

/**
 * ヘッダー行を取得する
 * @param {string} filePath CSVファイルパス
 * @returns {Promise<Object>} ヘッダー行
 */
async function getHeaderRow(filePath) {
  console.log(`CSVヘッダー読み込みを開始: ${filePath}`);
  // ファイルの内容を確認（デバッグ用）
  const fileContent = fs.readFileSync(filePath, 'utf8').slice(0, 200);
  console.log(`CSVファイル先頭部分: ${fileContent}`);
  
  return new Promise((resolve, reject) => {
    let headerRow = null;
    const stream = fs.createReadStream(filePath)
      .pipe(csv({
        separator: ',', // カンマをセパレータとして指定
        skipLines: 0,   // スキップする行数
        strict: false   // 厳密なチェックを無効化
      }))
      .on('data', (row) => {
        headerRow = row;
        console.log(`ヘッダー行が見つかりました: ${JSON.stringify(row).slice(0, 200)}`);
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
  try {
    // 全データを読み込んで処理
    const data = [];
    let min = Infinity;
    let max = -Infinity;
    
    // まずCSVからデータを読み込み
    await new Promise((resolve, reject) => {
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
                'YYYY/M/D H:mm',
                'YYYY/M/D H:mm:ss',
                'MM/DD/YYYY HH:mm:ss',
                'DD/MM/YYYY HH:mm:ss',
              ]).toISOString();
              
              // 最初の数件だけデバッグログを出力
              if (data.length < 2) {
                console.log(`    [DEBUG] 処理中: ${row[timestampColumn]} -> ${timestamp}, 値: ${value}`);
              }
              
              data.push({
                timestamp,
                value
              });
            } catch (err) {
              console.warn(`    日時の解析に失敗しました: ${row[timestampColumn]}`);
            }
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });
    
    if (data.length === 0) {
      console.log(`    有効な数値データがありません。スキップします。`);
      return { min: 0, max: 0, count: 0 };
    }
    
    // タグを登録してからデータを挿入する
    db.exec('BEGIN TRANSACTION');
    
    try {
      // 既存のタグを確認
      console.log(`    タグID「${tagId}」の存在確認`);
      const existingTag = db.prepare('SELECT id FROM tags WHERE name = ?').get(tagId);
      
      let tagIdInt; // 整数型タグID
      
      if (existingTag) {
        // 既存のタグを更新
        console.log(`    既存タグID(整数): ${existingTag.id} を更新`);
        db.prepare(`
          UPDATE tags SET source_tag = ?, unit = ?, min = ?, max = ?
          WHERE id = ?
        `).run(
          header,
          guessUnit(header),
          min === Infinity ? 0 : min,
          max === -Infinity ? 0 : max,
          existingTag.id
        );
        tagIdInt = existingTag.id;
        console.log(`    タグ更新完了: ${tagIdInt}`);
      } else {
        // 新しいタグを挿入
        console.log(`    新規タグ「${tagId}」を作成`);
        const stmtTag = db.prepare(`
          INSERT INTO tags (name, source_tag, unit, min, max)
          VALUES (?, ?, ?, ?, ?)
        `);
        
        const result = stmtTag.run(
          tagId,
          header,
          guessUnit(header),
          min === Infinity ? 0 : min,
          max === -Infinity ? 0 : max
        );
        
        tagIdInt = result.lastInsertRowid;
        console.log(`    新規タグ作成完了: ${tagIdInt}`);
      }
      
      // タグにメタデータを適用
      console.log(`    タグID(${tagIdInt})にメタデータを適用`);
      applyMetadataToTag(tagIdInt, header);
      
      // データポイントを挿入
      console.log(`    タグID(${tagIdInt})のデータポイント(${data.length}件)を挿入`);
      const stmtData = db.prepare(`
        INSERT OR REPLACE INTO tag_data (tag_id, timestamp, value)
        VALUES (?, ?, ?)
      `);
      
      // データポイントをバッチで挿入
      const insertBatch = db.transaction((points) => {
        for (const point of points) {
          try {
            stmtData.run(tagIdInt, point.timestamp, point.value);
          } catch (err) {
            console.error(`    データポイント挿入エラー: tag_id=${tagIdInt}, timestamp=${point.timestamp}, value=${point.value}`);
            console.error(`    エラー詳細: ${err.message}`);
            throw err;
          }
        }
      });
      
      // データポイントをチャンクに分割して挿入
      const CHUNK_SIZE = 500;
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        insertBatch(chunk);
      }
      
      db.exec('COMMIT');
      console.log(`    ${data.length} データポイントを挿入しました`);
      
      return { min, max, count: data.length };
    } catch (error) {
      db.exec('ROLLBACK');
      console.error(`    タグID「${tagId}」の処理でエラー発生: ${error.message}`);
      throw error;
    }
  } catch (error) {
    console.error(`    タグID「${tagId}」の処理に失敗: ${error.message}`);
    throw error;
  }
}

/**
 * CSVファイルをデータベースにインポート
 * @param {Object} fileInfo ファイル情報（path, name, equipmentId, checksum）
 * @returns {Promise<Object>} インポート結果
 */
async function importCsvToDatabase(fileInfo) {
  console.log(`CSVファイル ${fileInfo.name} のインポートを開始します...`);
  // インポート前にインデックスを削除（性能向上のため）
  console.log(`  インポート前にインデックスを削除します...`);
  db.exec('DROP INDEX IF EXISTS idx_tag_data_timestamp');
  
  try {
    const filePath = fileInfo.path;
    
    console.log(`ファイル ${filePath} を読み込みます`);
    
    // CSVファイルの内容を直接読んでヘッダーを確認（デバッグ）
    const fileContent = fs.readFileSync(filePath, 'utf8').slice(0, 200);
    console.log(`CSVファイル先頭部分: ${fileContent}`);
    
    // 一度だけCSVファイルを読み込む
    const rows = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          // デバッグ出力（最初の数行のみ）
          if (rows.length < 2) {
            console.log(`データ行サンプル: ${JSON.stringify(row)}`);
          }
          rows.push(row);
        })
        .on('end', () => {
          console.log(`  ${filePath} から ${rows.length} 行を読み込みました`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`  CSVファイル読み込みエラー: ${err.message}`);
          reject(err);
        });
    });
    
    if (rows.length === 0) {
      console.log(`  ${fileInfo.name} はデータがありません。スキップします。`);
      return { tagCount: 0, dataPointCount: 0 };
    }
    
    // ヘッダー（タグ名）を取得
    const headers = Object.keys(rows[0]);
    console.log(`検出されたヘッダー: ${headers.join(', ').slice(0, 200)}...`);
    
    // タイムスタンプ列を特定
    const timestampColumn = headers.find(h => 
      h.toLowerCase().includes('time') || 
      h.toLowerCase().includes('date')
    ) || headers[0]; // 見つからない場合は最初の列を使用
    
    // タグ名だけを抽出（タイムスタンプ列を除く）
    const tagHeaders = headers.filter(h => h !== timestampColumn);
    
    console.log(`  タイムスタンプ列: ${timestampColumn}`);
    console.log(`  検出されたタグ: ${tagHeaders.join(', ')}`);
    
    // 設備固定関連付けを削除したため、タグ構成変更の判定は不要
    // 同名タグが存在する場合は上書きされる（最後に処理されたデータが残る）
    
    // メインのインポート処理をトランザクションで実行
    db.exec('BEGIN TRANSACTION');
    
    try {
      let tagCount = 0;
      let dataPointCount = 0;
      
      // タグごとに処理（CSVの再読み込みなし）
      for (const header of tagHeaders) {
        const tagId = header; // 設備名を含まない形式に変更
        console.log(`  タグ ${tagId} を処理中...`);
        
        // メモリ内のデータからタグ値を抽出
        const tagValues = rows
          .map(row => parseFloat(row[header]))
          .filter(val => !isNaN(val));
        
        if (tagValues.length === 0) {
          console.log(`    有効な数値データがありません。スキップします。`);
          continue;
        }
        
        // 最小値と最大値を計算（スプレッド演算子を使わない安全な実装）
        const min = tagValues.reduce((min, val) => Math.min(min, val), Infinity);
        const max = tagValues.reduce((max, val) => Math.max(max, val), -Infinity);
        
        // タグレコードの挿入または更新
        let tagIdInt; // 整数型タグID
        const existingTag = db.prepare('SELECT id FROM tags WHERE name = ?').get(tagId);
        
        if (existingTag) {
          // 既存のタグを更新
          db.prepare(`
            UPDATE tags SET source_tag = ?, unit = ?, min = ?, max = ?
            WHERE id = ?
          `).run(
            header,
            guessUnit(header),
            min,
            max,
            existingTag.id
          );
          tagIdInt = existingTag.id;
        } else {
          // 新しいタグを挿入
          const stmtTag = db.prepare(`
            INSERT INTO tags (name, source_tag, unit, min, max)
            VALUES (?, ?, ?, ?, ?)
          `);
          
          const result = stmtTag.run(
            tagId,
            header,
            guessUnit(header),
            min,
            max
          );
          
          tagIdInt = result.lastInsertRowid;
        }
        
        // タグにメタデータを適用
        applyMetadataToTag(tagIdInt, header);
        
        tagCount++;
        
        // データポイントを作成（メモリ内データから）
        const dataPoints = [];
        for (const row of rows) {
          const value = parseFloat(row[header]);
          if (!isNaN(value)) {
            try {
              // 日時フォーマット変換
              const timestamp = moment(row[timestampColumn], [
                'YYYY-MM-DD HH:mm:ss',
                'YYYY/MM/DD HH:mm:ss',
                'YYYY/M/D H:mm',
                'YYYY/M/D H:mm:ss',
                'MM/DD/YYYY HH:mm:ss',
                'DD/MM/YYYY HH:mm:ss',
              ]).toISOString();
              
              // デバッグ用ログ（最初の数件のみ）
              if (dataPoints.length < 2) {
                console.log(`    [DEBUG] 日時変換: ${row[timestampColumn]} -> ${timestamp}, 値: ${value}`);
              }
              
              dataPoints.push({
                timestamp,
                value
              });
            } catch (err) {
              console.warn(`    日時の解析に失敗しました: ${row[timestampColumn]}`);
            }
          }
        }
        
        // バッチでデータを挿入
        const stmtData = db.prepare(`
          INSERT OR REPLACE INTO tag_data (tag_id, timestamp, value)
          VALUES (?, ?, ?)
        `);
        
        // バッチ挿入用トランザクション
        const insertBatch = db.transaction((points) => {
          for (const point of points) {
            stmtData.run(tagIdInt, point.timestamp, point.value);
          }
        });
        
        // データポイントをチャンクに分割して挿入（メモリ消費を抑える）
        const CHUNK_SIZE = 1000;
        for (let i = 0; i < dataPoints.length; i += CHUNK_SIZE) {
          const chunk = dataPoints.slice(i, i + CHUNK_SIZE);
          insertBatch(chunk);
        }
        
        dataPointCount += dataPoints.length;
        console.log(`    ${dataPoints.length} データポイントを挿入しました`);
      }
      
      db.exec('COMMIT');
      console.log(`  ${fileInfo.name} の処理が完了しました（合計: ${tagCount}タグ, ${dataPointCount}データポイント）`);
      // インポート後にインデックスを再作成
      console.log(`  インポート完了後にインデックスを再作成します...`);
      db.exec('CREATE INDEX IF NOT EXISTS idx_tag_data_timestamp ON tag_data(timestamp)');
      return { tagCount, dataPointCount };
    } catch (error) {
      db.exec('ROLLBACK');
      console.error(`  ${fileInfo.name} の処理中にエラーが発生しました:`, error);
      throw error;
    }
  } catch (error) {
    console.error(`CSVファイル ${fileInfo.name} のインポート中にエラーが発生しました:`, error);
    throw error;
  }
}

module.exports = { importCsvToDatabase };
