const path = require('path');
const fs = require('fs');
const { fetchData } = require('./dist/src');

// 出力先の確認用関数
function checkDirectory(dir) {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    console.log(`ディレクトリ ${dir} の内容:`);
    if (files.length === 0) {
      console.log('  (空)');
    } else {
      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          console.log(`  - ${file}/`);
        } else {
          console.log(`  - ${file} (${stats.size} バイト)`);
          
          // CSVファイルの内容を表示
          if (file.endsWith('.csv')) {
            const content = fs.readFileSync(filePath, 'utf-8');
            console.log(`    内容の先頭部分: ${content.substring(0, 200)}...`);
          }
        }
      });
    }
  } else {
    console.log(`ディレクトリ ${dir} は存在しません`);
  }
}

// 各取得パターンのテスト
async function runAllTests() {
  try {
    // 基本設定
    const baseConfig = {
      equipment: [
        { 
          name: 'Pump01',
          tags: ['Pump01.Flow', 'Pump01.PowerConsumption', 'Pump01.Temperature'],
          conditions: { only_when: [] }
        }
      ],
      output: {
        format: 'csv',
        directory: '', // 各テストで上書き
        max_rows_per_file: 100000
      },
      if_hub_api: {
        base_url: 'http://localhost:3001',
        timeout: 10000,
        max_records_per_request: 1000,
        page_size: 100
      },
      tag_validation: {
        enabled: true,
        stop_on_missing_tag: true
      }
    };

    // ディレクトリをクリア＆作成する関数
    function prepareDirectory(dirPath) {
      console.log(`ディレクトリ準備: ${dirPath}`);
      if (fs.existsSync(dirPath)) {
        // ディレクトリ内のファイルを削除
        const files = fs.readdirSync(dirPath);
        files.forEach(file => {
          const filePath = path.join(dirPath, file);
          if (fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
          }
        });
      } else {
        // ディレクトリを作成
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }

    // テスト1: 基本的なデータ取得
    console.log('\n===== テスト1: 基本的なデータ取得 =====');
    const dir1 = path.resolve(__dirname, 'data/verify_test/basic_fetch');
    prepareDirectory(dir1);
    baseConfig.output.directory = dir1;
    
    console.log('設定:', JSON.stringify({
      config: {
        ...baseConfig,
        output: { ...baseConfig.output, directory: dir1 }
      },
      equipment: 'Pump01'
    }, null, 2));
    
    const result1 = await fetchData({
      config: {
        ...baseConfig,
        output: { ...baseConfig.output, directory: dir1 }
      },
      equipment: 'Pump01',
      options: {}
    });
    
    console.log('取得結果:', result1.success ? '成功' : '失敗');
    if (result1.error) console.error('エラー:', result1.error);
    console.log('出力ファイル:', result1.outputFiles);
    checkDirectory(dir1);

    // テスト2: 特定のタグのみ取得
    console.log('\n===== テスト2: 特定のタグのみ取得 =====');
    const dir2 = path.resolve(__dirname, 'data/verify_test/specific_tag');
    prepareDirectory(dir2);
    
    // 特定のタグのみを指定
    const tempConfig = JSON.parse(JSON.stringify(baseConfig));  // ディープコピー
    tempConfig.equipment[0].tags = ['Pump01.Temperature']; // Temperatureタグのみ
    tempConfig.output.directory = dir2;
    
    console.log('設定:', JSON.stringify({
      config: tempConfig,
      equipment: 'Pump01'
    }, null, 2));
    
    const result2 = await fetchData({
      config: tempConfig,
      equipment: 'Pump01',
      options: {}
    });
    
    console.log('取得結果:', result2.success ? '成功' : '失敗');
    if (result2.error) console.error('エラー:', result2.error);
    console.log('出力ファイル:', result2.outputFiles);
    checkDirectory(dir2);
    
    // ファイル内容を確認（Temperatureは含むが、Flowは含まないはず）
    if (result2.outputFiles && result2.outputFiles.length > 0) {
      const content = fs.readFileSync(result2.outputFiles[0], 'utf-8');
      console.log('ファイル内容検証:');
      console.log('  - Temperatureタグが含まれる:', content.includes('Temperature'));
      console.log('  - Flowタグが含まれない:', !content.includes('Flow'));
    }

    // テスト3: 期間指定でデータを取得
    console.log('\n===== テスト3: 期間指定でデータを取得 =====');
    const dir3 = path.resolve(__dirname, 'data/verify_test/period_specific');
    prepareDirectory(dir3);
    baseConfig.output.directory = dir3;
    
    const result3 = await fetchData({
      config: {
        ...baseConfig,
        output: { ...baseConfig.output, directory: dir3 }
      },
      equipment: 'Pump01',
      options: {
        start: '2023-01-01 00:10:00',
        end: '2023-01-01 00:20:00'
      }
    });
    
    console.log('取得結果:', result3.success ? '成功' : '失敗');
    if (result3.error) console.error('エラー:', result3.error);
    console.log('出力ファイル:', result3.outputFiles);
    checkDirectory(dir3);

    // テスト4: 条件によるフィルタリング（温度が48度より高いデータのみ取得）
    console.log('\n===== テスト4: 条件によるフィルタリング =====');
    const dir4 = path.resolve(__dirname, 'data/verify_test/condition_filter');
    prepareDirectory(dir4);

    // 温度条件を設定 - 正しい形式で条件を指定
    const conditionConfig = JSON.parse(JSON.stringify(baseConfig));
    conditionConfig.equipment[0].conditions = {
      only_when: [
        {
          tag: 'Pump01.Temperature',
          condition: '> 48'  // 演算子と値が一つの文字列
        }
      ]
    };
    conditionConfig.output.directory = dir4;

    console.log('設定:', JSON.stringify({
      config: conditionConfig,
      equipment: 'Pump01'
    }, null, 2));

    const result4 = await fetchData({
      config: conditionConfig,
      equipment: 'Pump01',
      options: {}
    });

    console.log('取得結果:', result4.success ? '成功' : '失敗');
    if (result4.error) console.error('エラー:', result4.error);
    console.log('出力ファイル:', result4.outputFiles);
    checkDirectory(dir4);

    // 条件フィルタリングの検証
    if (result4.outputFiles && result4.outputFiles.length > 0) {
      const content = fs.readFileSync(result4.outputFiles[0], 'utf-8');
      const lines = content.split('\n').filter(line => line.trim() !== '');
      
      // 各行を検証
      let allMatch = true;
      const dataLines = lines.slice(1); // ヘッダー行を除外
      
      console.log('条件フィルタリング検証:');
      console.log(`  - 総行数: ${dataLines.length}`);
      
      // サンプルとして最初の数行の温度値を表示
      for (let i = 0; i < Math.min(5, dataLines.length); i++) {
        const cols = dataLines[i].split(',');
        const tempValue = parseFloat(cols[cols.length - 1]); // 最後のカラムが温度と仮定
        console.log(`  - 行 ${i+1}: 温度値 = ${tempValue}`);
        if (tempValue <= 48) {
          allMatch = false;
        }
      }
      
      console.log(`  - すべての行が条件（温度 > 48）に一致: ${allMatch}`);
    }

    console.log('\n===== 全テスト完了 =====');
    
    // 各テストの出力先ディレクトリを一覧表示
    console.log('\n===== 出力先一覧 =====');
    console.log('基本的なデータ取得:', dir1);
    console.log('特定のタグのみ取得:', dir2);
    console.log('期間指定でデータを取得:', dir3);
    console.log('条件によるフィルタリング:', dir4);
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  }
}

// スクリプト実行
runAllTests();
