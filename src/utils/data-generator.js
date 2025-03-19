// src/utils/data-generator.js
const fs = require('fs');
const path = require('path');
const config = require('../config');

// 設定
const OUTPUT_DIR = config.dataSource.staticDataPath;
const START_DATE = new Date('2023-01-01T00:00:00');
const END_DATE = new Date('2023-03-31T23:59:59');

const INTERVAL_MINS = 10; // 10分間隔
const EQUIPMENT_CONFIG = [
  {
    id: 'Pump01',
    tags: [
      { name: 'Temperature', min: 50, max: 80, unit: '°C' },
      { name: 'Pressure', min: 100, max: 150, unit: 'kPa' },
      { name: 'FlowRate', min: 200, max: 300, unit: 'L/min' },
      { name: 'RPM', min: 1000, max: 1200, unit: 'rpm' }
    ]
  },
  {
    id: 'Reactor01',
    tags: [
      { name: 'Temperature', min: 150, max: 200, unit: '°C' },
      { name: 'Pressure', min: 300, max: 400, unit: 'kPa' },
      { name: 'pH', min: 6.5, max: 7.5, unit: 'pH' },
      { name: 'Level', min: 70, max: 90, unit: '%' }
    ]
  },
  {
    id: 'Compressor01',
    tags: [
      { name: 'Temperature', min: 30, max: 50, unit: '°C' },
      { name: 'Pressure', min: 500, max: 600, unit: 'kPa' },
      { name: 'Current', min: 10, max: 15, unit: 'A' },
      { name: 'Vibration', min: 0, max: 5, unit: 'mm/s' }
    ]
  }
];

// 出力ディレクトリを作成
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 指定範囲の乱数を生成
function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

// 正規分布に従う乱数を生成
function randomNormal(mean, stdDev) {
  // Box-Muller変換
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stdDev + mean;
}

// 時系列データを生成（ランダムウォーク）
function generateTimeSeriesData(startDate, endDate, intervalMins, config) {
  const { min, max } = config;
  const result = [];
  const mean = (min + max) / 2;
  const stdDev = (max - min) / 6; // 6σの範囲内に収める

  let currentDate = new Date(startDate);
  let currentValue = randomInRange(min, max);

  while (currentDate <= endDate) {
    // 時系列として連続性のある値を生成
    const deltaValue = randomNormal(0, stdDev * 0.05);
    currentValue += deltaValue;

    // 値が範囲外に出たら範囲内に戻す
    if (currentValue < min) currentValue = min + Math.random() * (mean - min) * 0.5;
    if (currentValue > max) currentValue = max - Math.random() * (max - mean) * 0.5;

    // たまに異常値を混ぜる（全体の約1%）
    const isAnomaly = Math.random() < 0.01;
    let value = currentValue;

    if (isAnomaly) {
      // 上下どちらかに大きく外れた値を生成
      const direction = Math.random() < 0.5 ? -1 : 1;
      value = currentValue + direction * stdDev * (2 + Math.random() * 3);
    }

    result.push({
      timestamp: new Date(currentDate),
      value: parseFloat(value.toFixed(2))
    });

    // 次の時刻に進める
    currentDate = new Date(currentDate.getTime() + intervalMins * 60 * 1000);
  }

  return result;
}

// 各設備のCSVファイルを生成
EQUIPMENT_CONFIG.forEach(equipment => {
  console.log(`設備 ${equipment.id} のデータを生成中...`);

  // 全タグの時系列データを生成
  const tagData = {};
  equipment.tags.forEach(tag => {
    tagData[tag.name] = generateTimeSeriesData(START_DATE, END_DATE, INTERVAL_MINS, tag);
  });

  // 全タグのタイムスタンプを統合
  const allTimestamps = new Set();
  Object.values(tagData).forEach(series => {
    series.forEach(point => allTimestamps.add(point.timestamp.getTime()));
  });

  const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

  // CSVヘッダー
  let csvContent = 'Timestamp,' + equipment.tags.map(tag => tag.name).join(',') + '\n';

  // CSVデータ行
  sortedTimestamps.forEach(ts => {
    const row = [new Date(ts).toISOString()];

    equipment.tags.forEach(tag => {
      const point = tagData[tag.name].find(p => p.timestamp.getTime() === ts);
      row.push(point ? point.value : '');
    });

    csvContent += row.join(',') + '\n';
  });

  // CSVファイルに書き込み
  const filePath = path.join(OUTPUT_DIR, `${equipment.id}.csv`);
  fs.writeFileSync(filePath, csvContent);

  console.log(`  ${filePath} に ${sortedTimestamps.length} 行のデータを書き込みました`);
});

console.log('静的データの生成が完了しました');
