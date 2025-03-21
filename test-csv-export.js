/**
 * CSVエクスポート機能のテストスクリプト
 * 
 * このスクリプトは、不定値処理オプション（skipInvalidValues）の動作を検証します。
 * - 3つの異なるケースでCSVをエクスポート
 * - 結果を分析し、不定値（Infinity、NaN）の処理が正しいかを確認
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const csv = require('csv-parser');

// 設定
const host = 'localhost';
const port = 3500;
const equipment = 'Test';

// 出力ファイル名
const outputFiles = {
  default: 'test_default.csv',
  skipTrue: 'test_skip_true.csv', 
  skipFalse: 'test_skip_false.csv'
};

// CSVエクスポートAPI呼び出し
function exportCSV(filename, params = {}) {
  return new Promise((resolve, reject) => {
    // クエリパラメータの構築
    const queryParams = Object.entries(params)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    
    const path = `/api/export/equipment/${equipment}/csv${queryParams ? '?' + queryParams : ''}`;
    
    console.log(`リクエスト: GET ${path}`);
    
    const options = {
      hostname: host,
      port: port,
      path: path,
      method: 'GET'
    };
    
    const req = http.request(options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`リクエストエラー: ${res.statusCode}`));
        return;
      }
      
      const file = fs.createWriteStream(filename);
      res.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`ファイル保存: ${filename}`);
        resolve(filename);
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.end();
  });
}

// CSVファイルを解析して検証
function analyzeCSV(filename, expectEmptyCells) {
  return new Promise((resolve, reject) => {
    const results = [];
    
    fs.createReadStream(filename)
      .pipe(csv())
      .on('data', (data) => {
        results.push(data);
      })
      .on('end', () => {
        console.log(`\n===== ${filename} の分析 =====`);
        console.log(`合計レコード数: ${results.length}`);
        
        // 列を抽出
        if (results.length > 0) {
          const columns = Object.keys(results[0]);
          console.log(`列: ${columns.join(', ')}`);
          
          // テスト用gtagのカラムが含まれているかチェック
          const hasZeroDiv = columns.includes('Test.ZeroDivision');
          const hasNaNGen = columns.includes('Test.NaNGen');
          const hasValidCalc = columns.includes('Test.ValidCalc');
          
          if (!hasZeroDiv || !hasNaNGen || !hasValidCalc) {
            console.warn('警告: テスト用のgtag列が見つかりません');
          }
          
          // サンプルデータを検査
          console.log('\nサンプルデータ:');
          const sampleRow = results[0];
          
          for (const [column, value] of Object.entries(sampleRow)) {
            if (column === 'datetime') continue;
            
            console.log(`${column}: "${value}"`);
            
            // 特定列のチェック
            if (expectEmptyCells) {
              if (column === 'Test.ZeroDivision' || column === 'Test.NaNGen') {
                if (value === '') {
                  console.log('✓ 正しく空セルが出力されています');
                } else {
                  console.log('✗ 空セルではありません');
                }
              }
            } else {
              if (column === 'Test.ZeroDivision' && (value === 'Infinity' || value === 'Inf')) {
                console.log('✓ 正しくInfinityが出力されています');
              } else if (column === 'Test.NaNGen' && (value === 'NaN')) {
                console.log('✓ 正しくNaNが出力されています');
              }
            }
          }
        }
        
        resolve(results);
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

// メイン実行関数
async function runTest() {
  try {
    console.log('CSVエクスポート機能テスト開始...');
    
    // テスト1: デフォルト設定（skipInvalidValues未指定）
    await exportCSV(outputFiles.default);
    
    // テスト2: skipInvalidValues=true（明示的に指定）
    await exportCSV(outputFiles.skipTrue, { skipInvalidValues: 'true' });
    
    // テスト3: skipInvalidValues=false
    await exportCSV(outputFiles.skipFalse, { skipInvalidValues: 'false' });
    
    // 結果分析
    console.log('\n結果分析開始:');
    
    await analyzeCSV(outputFiles.default, true); // デフォルトは空セル期待
    await analyzeCSV(outputFiles.skipTrue, true); // skipInvalidValues=trueは空セル期待
    await analyzeCSV(outputFiles.skipFalse, false); // skipInvalidValues=falseは不定値をそのまま期待
    
    console.log('\nテスト完了');
  } catch (error) {
    console.error('テスト実行エラー:', error);
  }
}

// テスト実行
runTest();
