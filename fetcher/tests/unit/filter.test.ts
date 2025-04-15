/**
 * フィルタリング機能のテスト
 * src/filter.tsの単体テスト
 */
import { 
  filterDataByConditions, 
  groupDataByTimestamp, 
  evaluateExpression 
} from '../../src/filter';
import { ConditionsConfig } from '../../src/types/config';
import { DataPoint } from '../../src/types/data';
import { pumpData, tankData } from '../fixtures/test-data';

describe('filterモジュール', () => {
  describe('evaluateExpression', () => {
    it('等号の条件式を正しく評価する', () => {
      expect(evaluateExpression(10, '== 10')).toBe(true);
      expect(evaluateExpression(10, '== 5')).toBe(false);
    });

    it('不等号の条件式を正しく評価する', () => {
      expect(evaluateExpression(10, '!= 5')).toBe(true);
      expect(evaluateExpression(10, '!= 10')).toBe(false);
    });

    it('大なり小なりの条件式を正しく評価する', () => {
      expect(evaluateExpression(10, '> 5')).toBe(true);
      expect(evaluateExpression(10, '> 10')).toBe(false);
      expect(evaluateExpression(10, '> 15')).toBe(false);

      expect(evaluateExpression(10, '>= 5')).toBe(true);
      expect(evaluateExpression(10, '>= 10')).toBe(true);
      expect(evaluateExpression(10, '>= 15')).toBe(false);

      expect(evaluateExpression(10, '< 15')).toBe(true);
      expect(evaluateExpression(10, '< 10')).toBe(false);
      expect(evaluateExpression(10, '< 5')).toBe(false);

      expect(evaluateExpression(10, '<= 15')).toBe(true);
      expect(evaluateExpression(10, '<= 10')).toBe(true);
      expect(evaluateExpression(10, '<= 5')).toBe(false);
    });

    it('空白を含む条件式を正しく評価する', () => {
      expect(evaluateExpression(10, ' > 5 ')).toBe(true);
      expect(evaluateExpression(10, '>= 10')).toBe(true);
    });

    it('無効な条件式でエラーをスローする', () => {
      expect(() => evaluateExpression(10, 'invalid')).toThrow();
      expect(() => evaluateExpression(10, '>> 5')).toThrow();
    });
  });

  describe('groupDataByTimestamp', () => {
    it('データポイントをタイムスタンプでグループ化する', () => {
      // テストデータの作成
      const data: DataPoint[] = [
        { timestamp: '2023-01-01 00:00:00', value: 120.5, tag: 'Pump01.Flow' },
        { timestamp: '2023-01-01 00:00:00', value: 30.2, tag: 'Pump01.PowerConsumption' },
        { timestamp: '2023-01-01 00:00:00', value: 45.5, tag: 'Pump01.Temperature' },
        { timestamp: '2023-01-01 00:05:00', value: 122.3, tag: 'Pump01.Flow' },
        { timestamp: '2023-01-01 00:05:00', value: 31.2, tag: 'Pump01.PowerConsumption' },
      ];

      const result = groupDataByTimestamp(data);

      // 結果の検証
      expect(Object.keys(result)).toHaveLength(2); // 2つのタイムスタンプ
      expect(Object.keys(result)).toEqual(['2023-01-01 00:00:00', '2023-01-01 00:05:00']);

      // 各タイムスタンプのデータを検証
      expect(Object.keys(result['2023-01-01 00:00:00'])).toHaveLength(3); // 3つのタグ
      expect(result['2023-01-01 00:00:00']['Pump01.Flow'].value).toBe(120.5);
      expect(result['2023-01-01 00:00:00']['Pump01.PowerConsumption'].value).toBe(30.2);
      expect(result['2023-01-01 00:00:00']['Pump01.Temperature'].value).toBe(45.5);

      expect(Object.keys(result['2023-01-01 00:05:00'])).toHaveLength(2); // 2つのタグ
      expect(result['2023-01-01 00:05:00']['Pump01.Flow'].value).toBe(122.3);
      expect(result['2023-01-01 00:05:00']['Pump01.PowerConsumption'].value).toBe(31.2);
    });

    it('空のデータ配列を処理できる', () => {
      const result = groupDataByTimestamp([]);
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('タグが指定されていないデータを処理できる', () => {
      const data: DataPoint[] = [
        { timestamp: '2023-01-01 00:00:00', value: 120.5 },
        { timestamp: '2023-01-01 00:05:00', value: 122.3 },
      ];

      const result = groupDataByTimestamp(data);
      
      // 空の文字列をキーとして使用
      expect(result['2023-01-01 00:00:00'][''].value).toBe(120.5);
      expect(result['2023-01-01 00:05:00'][''].value).toBe(122.3);
    });
  });

  describe('filterDataByConditions', () => {
    it('条件がない場合はデータをそのまま返す', () => {
      const data = pumpData.slice(0, 5); // 最初の5件だけ使用
      expect(filterDataByConditions(data, undefined)).toEqual(data);
      expect(filterDataByConditions(data, {})).toEqual(data);
      expect(filterDataByConditions(data, { only_when: [] })).toEqual(data);
    });

    it('温度が48度以上の条件でフィルタリングする', () => {
      // Pump01の温度データと流量データを準備
      const tempData = pumpData.filter(p => p.tag === 'Pump01.Temperature');
      const flowData = pumpData.filter(p => p.tag === 'Pump01.Flow');
      const data = [...tempData, ...flowData];
      
      // 温度が48度以上の条件
      const conditions: ConditionsConfig = {
        only_when: [{ tag: 'Pump01.Temperature', condition: '>= 48' }]
      };
      
      const result = filterDataByConditions(data, conditions);
      
      // 結果の検証
      // 48度以上のタイムスタンプは '2023-01-01 00:10:00'以降
      const expectedTimestamps = [
        '2023-01-01 00:10:00',
        '2023-01-01 00:15:00',
        '2023-01-01 00:20:00',
        '2023-01-01 00:25:00',
        '2023-01-01 00:29:00'
      ];
      
      // 各タイムスタンプについて、温度と流量の両方のデータポイントが含まれる
      // (2つのタグ) x (5つのタイムスタンプ) = 10データポイント
      expect(result.length).toBe(10);
      
      // 全てのタイムスタンプが期待値に含まれることを確認
      const resultTimestamps = [...new Set(result.map(p => p.timestamp))];
      expect(resultTimestamps.sort()).toEqual(expectedTimestamps.sort());
      
      // 最初のデータポイントは48度以上であることを確認
      const temps = result.filter(p => p.tag === 'Pump01.Temperature');
      expect(temps[0].value).toBeGreaterThanOrEqual(48);
    });

    it('Tank01のLevelが85以上の条件でフィルタリングする', () => {
      // タンクのレベルデータを準備
      const data = tankData;
      
      // レベルが85以上の条件
      const conditions: ConditionsConfig = {
        only_when: [{ tag: 'Tank01.Level', condition: '>= 85' }]
      };
      
      const result = filterDataByConditions(data, conditions);
      
      // 結果の検証
      // レベルが85以上のタイムスタンプは3つのみ
      expect(result.length).toBe(3);
      
      // タイムスタンプを確認
      const resultTimestamps = result.map(p => p.timestamp);
      expect(resultTimestamps).toEqual([
        '2023-01-01 00:22:00',
        '2023-01-01 00:23:00',
        '2023-01-01 00:24:00'
      ]);
      
      // すべてのデータが85以上であることを確認
      result.forEach(p => {
        expect(p.value).toBeGreaterThanOrEqual(85);
      });
    });

    it('複合条件（温度と流量）でフィルタリングする', () => {
      // 温度と流量のデータを準備
      const tempData = pumpData.filter(p => p.tag === 'Pump01.Temperature');
      const flowData = pumpData.filter(p => p.tag === 'Pump01.Flow');
      const data = [...tempData, ...flowData];
      
      // 温度が50度以上かつ流量が127以上の条件
      const conditions: ConditionsConfig = {
        only_when: [
          { tag: 'Pump01.Temperature', condition: '>= 50' },
          { tag: 'Pump01.Flow', condition: '>= 127' }
        ]
      };
      
      const result = filterDataByConditions(data, conditions);
      
      // 結果の検証
      // 両方の条件を満たすのは00:20:00以降のみ
      const expectedTimestamps = [
        '2023-01-01 00:20:00',
        '2023-01-01 00:25:00',
        '2023-01-01 00:29:00'
      ];
      
      // (2つのタグ) x (3つのタイムスタンプ) = 6データポイント
      expect(result.length).toBe(6);
      
      // 全てのタイムスタンプが期待値に含まれることを確認
      const resultTimestamps = [...new Set(result.map(p => p.timestamp))];
      expect(resultTimestamps.sort()).toEqual(expectedTimestamps.sort());
      
      // 各タイムスタンプについて条件を満たすことを確認
      for (const timestamp of expectedTimestamps) {
        const tempPoint = result.find(p => p.timestamp === timestamp && p.tag === 'Pump01.Temperature');
        const flowPoint = result.find(p => p.timestamp === timestamp && p.tag === 'Pump01.Flow');
        
        expect(tempPoint).toBeDefined();
        expect(flowPoint).toBeDefined();
        expect(tempPoint?.value).toBeGreaterThanOrEqual(50);
        expect(flowPoint?.value).toBeGreaterThanOrEqual(127);
      }
    });

    it('対象のタグが存在しない場合は条件をスキップする', () => {
      // 流量データのみを用意
      const flowData = pumpData.filter(p => p.tag === 'Pump01.Flow');
      
      // 存在しないタグの条件
      const conditions: ConditionsConfig = {
        only_when: [
          { tag: 'NonExistentTag', condition: '> 0' }
        ]
      };
      
      const result = filterDataByConditions(flowData, conditions);
      
      // 条件が無視されて全データが返る
      expect(result).toEqual(flowData);
    });

    it('nullの値を持つデータポイントは条件を満たさない', () => {
      // nullの値を含むテストデータ
      const data: DataPoint[] = [
        { timestamp: '2023-01-01 00:00:00', value: null, tag: 'Pump01.Flow' },
        { timestamp: '2023-01-01 00:05:00', value: 122.3, tag: 'Pump01.Flow' },
      ];
      
      const conditions: ConditionsConfig = {
        only_when: [
          { tag: 'Pump01.Flow', condition: '> 0' }
        ]
      };
      
      const result = filterDataByConditions(data, conditions);
      
      // nullの値を持つデータポイントはフィルタリングされる
      expect(result).toHaveLength(1);
      expect(result[0].timestamp).toBe('2023-01-01 00:05:00');
    });
  });
});
