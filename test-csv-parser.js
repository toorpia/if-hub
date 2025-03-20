const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// テストするCSVファイルのパス
const TEST_CSV_PATH = path.join(__dirname, 'static_equipment_data', 'sample.csv');

// 方法1: デフォルトのcsvパーサー設定でテスト
console.log('=== テスト1: デフォルト設定のcsvパーサー ===');
fs.createReadStream(TEST_CSV_PATH)
  .pipe(csv())
  .on('data', (row) => {
    console.log('行データ:', row);
    console.log('オブジェクトキー:', Object.keys(row));
  })
  .on('end', () => {
    console.log('--- テスト1完了 ---\n');
    
    // 方法2: rawオプションを使用したcsvパーサー
    console.log('=== テスト2: rawオプション付きcsvパーサー ===');
    fs.createReadStream(TEST_CSV_PATH)
      .pipe(csv({ raw: true }))
      .on('data', (row) => {
        console.log('行データ:', row);
        console.log('オブジェクトキー:', Object.keys(row));
      })
      .on('end', () => {
        console.log('--- テスト2完了 ---\n');
        
        // 方法3: headerオプションを使用したcsvパーサー
        console.log('=== テスト3: 明示的なheaderオプション付きcsvパーサー ===');
        // まずヘッダー行を読み取る
        const fileContent = fs.readFileSync(TEST_CSV_PATH, 'utf8');
        const lines = fileContent.split('\n');
        const headers = lines[0].split(',');
        
        fs.createReadStream(TEST_CSV_PATH)
          .pipe(csv({ headers }))
          .on('data', (row) => {
            console.log('行データ:', row);
            console.log('オブジェクトキー:', Object.keys(row));
          })
          .on('end', () => {
            console.log('--- テスト3完了 ---\n');
            
            // 方法4: fs.readFileでCSVを直接パース
            console.log('=== テスト4: fs.readFileを使った手動パース ===');
            const csvData = fs.readFileSync(TEST_CSV_PATH, 'utf8');
            const csvLines = csvData.trim().split('\n');
            const csvHeaders = csvLines[0].split(',');
            
            console.log('手動パースしたヘッダー:', csvHeaders);
            
            const csvRows = csvLines.slice(1).map(line => {
              const values = line.split(',');
              const row = {};
              csvHeaders.forEach((header, index) => {
                row[header] = values[index];
              });
              return row;
            });
            
            console.log('手動パースした最初の行:', csvRows[0]);
            console.log('手動パースしたオブジェクトキー:', Object.keys(csvRows[0]));
            console.log('--- テスト4完了 ---');
          });
      });
  });
