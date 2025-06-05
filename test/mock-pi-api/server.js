const express = require('express');
const moment = require('moment');

const app = express();
const PORT = 3011;

// PI-APIの実際のレスポンス形式を模倣
function generateMockCSVData(tagNames, startDate, endDate) {
  console.log(`📊 Generating mock data for tags: ${tagNames}`);
  console.log(`📅 Period: ${startDate} to ${endDate}`);
  
  const tags = tagNames.split(',');
  const start = moment(startDate, 'YYYYMMDDHHmmss');
  const end = moment(endDate, 'YYYYMMDDHHmmss');
  
  // CSVヘッダー: Timestamp + 各タグ
  let csv = 'Timestamp,' + tags.join(',') + '\n';
  
  // 10分間隔でデータを生成
  const current = start.clone();
  let rowCount = 0;
  
  while (current <= end && rowCount < 1000) { // 最大1000行
    const timestamp = current.format('YYYY-MM-DD HH:mm:ss');
    const values = [];
    
    // 各タグの模擬データを生成
    for (const tag of tags) {
      let value;
      if (tag.includes('711034')) {
        // POW:711034.PV: 50-80の範囲で変動
        value = (60 + Math.sin(current.unix() / 3600) * 15 + Math.random() * 10).toFixed(2);
      } else if (tag.includes('7T105B1')) {
        // POW:7T105B1.PV: 100-150の範囲で変動
        value = (125 + Math.cos(current.unix() / 1800) * 20 + Math.random() * 15).toFixed(2);
      } else {
        // その他のタグ: ランダム値
        value = (Math.random() * 100).toFixed(2);
      }
      values.push(value);
    }
    
    csv += `${timestamp},${values.join(',')}\n`;
    current.add(10, 'minutes');
    rowCount++;
  }
  
  console.log(`✅ Generated ${rowCount} rows of mock data`);
  return csv;
}

// PI-API エンドポイント
app.get('/PIData', (req, res) => {
  const { TagNames, StartDate, EndDate } = req.query;
  
  console.log('\n🔄 Mock PI-API Request Received:');
  console.log(`  TagNames: ${TagNames}`);
  console.log(`  StartDate: ${StartDate}`);
  console.log(`  EndDate: ${EndDate}`);
  
  // パラメータ検証
  if (!TagNames || !StartDate || !EndDate) {
    console.log('❌ Missing required parameters');
    return res.status(400).json({
      error: 'Missing required parameters: TagNames, StartDate, EndDate'
    });
  }
  
  try {
    // CSVデータを生成
    const csvData = generateMockCSVData(TagNames, StartDate, EndDate);
    
    // Content-Typeをtext/csvに設定
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="pidata.csv"');
    
    console.log('📤 Sending CSV response');
    res.send(csvData);
    
  } catch (error) {
    console.error('❌ Error generating mock data:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Mock PI-API Server'
  });
});

// サーバー情報
app.get('/', (req, res) => {
  res.json({
    service: 'Mock PI-API Server',
    version: '1.0.0',
    endpoints: {
      'GET /PIData': 'Get PI data (TagNames, StartDate, EndDate)',
      'GET /health': 'Health check',
      'GET /': 'This information'
    },
    sampleRequest: '/PIData?TagNames=POW:711034.PV,POW:7T105B1.PV&StartDate=20250604120000&EndDate=20250604130000'
  });
});

// サーバー起動
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log('🏭 Mock PI-API Server Started');
  console.log(`📡 Listening on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`📋 API info: http://localhost:${PORT}/`);
  console.log('='.repeat(60));
});

// グレースフルシャットダウン
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Mock PI-API Server...');
  process.exit(0);
});
