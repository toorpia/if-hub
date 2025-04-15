/**
 * テスト用のサンプルデータ
 * IF-HUBのstatic_equipment_dataディレクトリのCSVファイル内容に基づく
 */

import { DataPoint } from '../../src/types/data';

/**
 * Pump01のテストデータ
 */
export const pumpData: DataPoint[] = [
  // timestamp, Flow
  { timestamp: '2023-01-01 00:00:00', value: 120.5, tag: 'Pump01.Flow', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:05:00', value: 122.3, tag: 'Pump01.Flow', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:10:00', value: 124.5, tag: 'Pump01.Flow', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:15:00', value: 125.8, tag: 'Pump01.Flow', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:20:00', value: 127.0, tag: 'Pump01.Flow', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:25:00', value: 128.3, tag: 'Pump01.Flow', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:29:00', value: 129.2, tag: 'Pump01.Flow', equipment: 'Pump01' },

  // timestamp, PowerConsumption
  { timestamp: '2023-01-01 00:00:00', value: 30.2, tag: 'Pump01.PowerConsumption', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:05:00', value: 31.2, tag: 'Pump01.PowerConsumption', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:10:00', value: 32.3, tag: 'Pump01.PowerConsumption', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:15:00', value: 32.8, tag: 'Pump01.PowerConsumption', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:20:00', value: 33.6, tag: 'Pump01.PowerConsumption', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:25:00', value: 34.2, tag: 'Pump01.PowerConsumption', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:29:00', value: 34.6, tag: 'Pump01.PowerConsumption', equipment: 'Pump01' },

  // timestamp, Temperature
  { timestamp: '2023-01-01 00:00:00', value: 45.5, tag: 'Pump01.Temperature', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:05:00', value: 46.8, tag: 'Pump01.Temperature', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:10:00', value: 48.0, tag: 'Pump01.Temperature', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:15:00', value: 49.0, tag: 'Pump01.Temperature', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:20:00', value: 50.0, tag: 'Pump01.Temperature', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:25:00', value: 51.2, tag: 'Pump01.Temperature', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:29:00', value: 52.2, tag: 'Pump01.Temperature', equipment: 'Pump01' },
];

/**
 * Tank01のテストデータ
 */
export const tankData: DataPoint[] = [
  // timestamp, Level
  { timestamp: '2023-01-01 00:00:00', value: 75.5, tag: 'Tank01.Level', equipment: 'Tank01' },
  { timestamp: '2023-01-01 00:05:00', value: 76.8, tag: 'Tank01.Level', equipment: 'Tank01' },
  { timestamp: '2023-01-01 00:10:00', value: 78.0, tag: 'Tank01.Level', equipment: 'Tank01' },
  { timestamp: '2023-01-01 00:15:00', value: 79.3, tag: 'Tank01.Level', equipment: 'Tank01' },
  { timestamp: '2023-01-01 00:19:00', value: 80.0, tag: 'Tank01.Level', equipment: 'Tank01' },
  { timestamp: '2023-01-01 00:20:00', value: 80.2, tag: 'Tank01.Level', equipment: 'Tank01' },
  { timestamp: '2023-01-01 00:21:00', value: 80.5, tag: 'Tank01.Level', equipment: 'Tank01' },
  { timestamp: '2023-01-01 00:22:00', value: 85.0, tag: 'Tank01.Level', equipment: 'Tank01' },
  { timestamp: '2023-01-01 00:23:00', value: 87.5, tag: 'Tank01.Level', equipment: 'Tank01' },
  { timestamp: '2023-01-01 00:24:00', value: 86.0, tag: 'Tank01.Level', equipment: 'Tank01' },
  { timestamp: '2023-01-01 00:25:00', value: 81.0, tag: 'Tank01.Level', equipment: 'Tank01' },
  { timestamp: '2023-01-01 00:29:00', value: 79.8, tag: 'Tank01.Level', equipment: 'Tank01' },
];

/**
 * Pump01の効率指標gtagのテストデータ
 * 計算式: (Flow / PowerConsumption) * 100
 */
export const pumpEfficiencyGtagData: DataPoint[] = [
  { timestamp: '2023-01-01 00:00:00', value: 399.0, tag: 'Pump01.EfficiencyIndex', equipment: 'Pump01' }, // 120.5/30.2*100
  { timestamp: '2023-01-01 00:05:00', value: 392.0, tag: 'Pump01.EfficiencyIndex', equipment: 'Pump01' }, // 122.3/31.2*100
  { timestamp: '2023-01-01 00:10:00', value: 385.4, tag: 'Pump01.EfficiencyIndex', equipment: 'Pump01' }, // 124.5/32.3*100
  { timestamp: '2023-01-01 00:15:00', value: 383.5, tag: 'Pump01.EfficiencyIndex', equipment: 'Pump01' }, // 125.8/32.8*100
  { timestamp: '2023-01-01 00:20:00', value: 377.9, tag: 'Pump01.EfficiencyIndex', equipment: 'Pump01' }, // 127.0/33.6*100
  { timestamp: '2023-01-01 00:25:00', value: 375.1, tag: 'Pump01.EfficiencyIndex', equipment: 'Pump01' }, // 128.3/34.2*100
  { timestamp: '2023-01-01 00:29:00', value: 373.4, tag: 'Pump01.EfficiencyIndex', equipment: 'Pump01' }, // 129.2/34.6*100
];

/**
 * Pump01の温度移動平均gtagのテストデータ
 * 計算式: 5ポイント移動平均
 */
export const pumpTempMAGtagData: DataPoint[] = [
  { timestamp: '2023-01-01 00:00:00', value: null, tag: 'Pump01.TempMA', equipment: 'Pump01' }, // 初期値はnull
  { timestamp: '2023-01-01 00:01:00', value: null, tag: 'Pump01.TempMA', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:02:00', value: null, tag: 'Pump01.TempMA', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:03:00', value: null, tag: 'Pump01.TempMA', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:04:00', value: 45.98, tag: 'Pump01.TempMA', equipment: 'Pump01' }, // 5ポイント平均
  { timestamp: '2023-01-01 00:15:00', value: 48.06, tag: 'Pump01.TempMA', equipment: 'Pump01' },
  { timestamp: '2023-01-01 00:25:00', value: 50.08, tag: 'Pump01.TempMA', equipment: 'Pump01' },
];

/**
 * テスト用すべてのタグデータを結合
 */
export const allTestData: DataPoint[] = [
  ...pumpData,
  ...tankData,
  ...pumpEfficiencyGtagData,
  ...pumpTempMAGtagData
];
