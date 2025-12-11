// src/utils/csv-importer.js
// Copyright (c) 2025 toorPIA / toor Inc.
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const moment = require('moment');
const { pool, transaction } = require('../db');
const config = require('../config');
const { applyMetadataToTag } = require('./tag-metadata-importer');

// CSVフォルダパス
const CSV_FOLDER = config.dataSource.staticDataPath;

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
 * CSVファイルをデータベースにインポート
 * @param {Object} fileInfo ファイル情報（path, name, equipmentId, checksum）
 * @returns {Promise<Object>} インポート結果
 */
async function importCsvToDatabase(fileInfo) {
  console.log(`CSVファイル ${fileInfo.name} のインポートを開始します...`);

  // インポート前にインデックスを削除（性能向上のため）
  console.log(`  インポート前にインデックスを削除します...`);
  try {
    await pool.query('DROP INDEX IF EXISTS idx_tag_data_timestamp');
  } catch (err) {
    console.warn(`  インデックス削除をスキップ: ${err.message}`);
  }

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

    // メインのインポート処理をトランザクションで実行
    const result = await transaction(async (client) => {
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

        // 最小値と最大値を計算
        const min = tagValues.reduce((min, val) => Math.min(min, val), Infinity);
        const max = tagValues.reduce((max, val) => Math.max(max, val), -Infinity);

        // タグレコードの挿入または更新（UPSERT using ON CONFLICT）
        const upsertTagResult = await client.query(`
          INSERT INTO tags (name, source_tag, unit, min, max)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (name)
          DO UPDATE SET
            source_tag = EXCLUDED.source_tag,
            unit = EXCLUDED.unit,
            min = EXCLUDED.min,
            max = EXCLUDED.max
          RETURNING id
        `, [tagId, header, guessUnit(header), min, max]);

        const tagIdInt = upsertTagResult.rows[0].id;
        console.log(`    タグID: ${tagIdInt}`);

        // タグにメタデータを適用
        await applyMetadataToTag(tagIdInt, header);

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

        // バッチでデータを挿入（PostgreSQLの方が効率的）
        // チャンクに分割して挿入（メモリ消費を抑える）
        const CHUNK_SIZE = 1000;
        for (let i = 0; i < dataPoints.length; i += CHUNK_SIZE) {
          const chunk = dataPoints.slice(i, i + CHUNK_SIZE);

          // Batch insert using VALUES
          if (chunk.length > 0) {
            const values = [];
            const placeholders = [];

            chunk.forEach((point, idx) => {
              const baseIdx = idx * 3;
              placeholders.push(`($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3})`);
              values.push(tagIdInt, point.timestamp, point.value);
            });

            const insertQuery = `
              INSERT INTO tag_data (tag_id, timestamp, value)
              VALUES ${placeholders.join(', ')}
              ON CONFLICT (tag_id, timestamp)
              DO UPDATE SET value = EXCLUDED.value
            `;

            await client.query(insertQuery, values);
          }
        }

        dataPointCount += dataPoints.length;
        console.log(`    ${dataPoints.length} データポイントを挿入しました`);
      }

      return { tagCount, dataPointCount };
    });

    console.log(`  ${fileInfo.name} の処理が完了しました（合計: ${result.tagCount}タグ, ${result.dataPointCount}データポイント）`);

    // インポート後にインデックスを再作成
    console.log(`  インポート完了後にインデックスを再作成します...`);
    try {
      await pool.query('CREATE INDEX IF NOT EXISTS idx_tag_data_timestamp ON tag_data(timestamp)');
    } catch (err) {
      console.warn(`  インデックス作成をスキップ: ${err.message}`);
    }

    return result;

  } catch (error) {
    console.error(`CSVファイル ${fileInfo.name} のインポート中にエラーが発生しました:`, error);
    throw error;
  }
}

module.exports = { importCsvToDatabase };
