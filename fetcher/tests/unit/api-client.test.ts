/**
 * APIクライアントのテスト
 * src/api-client.tsの単体テスト
 */
import { ApiClient } from '../../src/api-client';
import { createMockHttpClient } from '../mocks/api-client.mock';
import { ApiConfig } from '../../src/types/config';

// HttpClientモジュールのモック
jest.mock('../../src/io/http', () => {
  // createMockHttpClientを事前にインポートするのではなく
  // モック内で定義して初期化の問題を回避
  return {
    HttpClient: jest.fn(() => ({
      get: jest.fn().mockImplementation((url, params) => {
        // タグ一覧API
        if (url === '/api/tags') {
          // 重要な修正: 設備名によって分岐
          const equipment = params?.equipment;
          if (equipment === 'Pump01') {
            return Promise.resolve({
              tags: [
                { id: 1, name: 'Pump01.Flow', equipment: 'Pump01' },
                { id: 2, name: 'Pump01.Temperature', equipment: 'Pump01' },
                { id: 3, name: 'Pump01.EfficiencyIndex', equipment: 'Pump01', is_gtag: true }
              ]
            });
          } else {
            // 存在しない設備の場合は空の配列を返す
            return Promise.resolve({ tags: [] });
          }
        } 
        // タグデータAPI
        else if (url.startsWith('/api/data/')) {
          return Promise.resolve({
            tagId: 'Pump01.Temperature',
            metadata: { id: 1, name: 'Pump01.Temperature', equipment: 'Pump01' },
            data: [
              { timestamp: '2023-01-01 00:15:00', value: 49.0 },
              { timestamp: '2023-01-01 00:20:00', value: 50.0 }
            ]
          });
        }
        // バッチAPIの追加 - これが欠けていた
        else if (url === '/api/batch') {
          const tagNames = (params?.tags || '').split(',');
          const result: Record<string, any> = {};
          
          tagNames.forEach((tag: string) => {
            result[tag] = {
              metadata: { id: 1, name: tag, equipment: 'Pump01' },
              data: [
                { timestamp: '2023-01-01 00:15:00', value: 49.0 },
                { timestamp: '2023-01-01 00:20:00', value: 50.0 }
              ]
            };
          });
          
          return Promise.resolve(result);
        }
        return Promise.reject(new Error('Unexpected URL'));
      }),
      post: jest.fn().mockResolvedValue({})
    }))
  };
});

describe('ApiClient', () => {
  // APIクライアント設定
  const apiConfig: ApiConfig = {
    base_url: 'http://localhost:3001',
    timeout: 5000,
    max_records_per_request: 10000,
    page_size: 1000
  };
  
  let apiClient: ApiClient;
  
  beforeEach(() => {
    // テスト前にモックをクリア
    jest.clearAllMocks();
    apiClient = new ApiClient(apiConfig);
  });
  
  describe('fetchAvailableTags', () => {
    it('Pump01の利用可能なタグリストを取得できる', async () => {
      // 実行
      const tags = await apiClient.fetchAvailableTags('Pump01');
      
      // 検証
      expect(tags).toContain('Pump01.Flow');
      expect(tags).toContain('Pump01.Temperature');
      expect(tags).toContain('Pump01.EfficiencyIndex');
    });
    
    it('存在しない設備でも空配列が返る', async () => {
      // 実行
      const tags = await apiClient.fetchAvailableTags('NonExistentEquipment');
      
      // 検証
      expect(tags).toEqual([]);
    });
  });
  
  describe('fetchTagData', () => {
    it('特定のタグデータを取得できる', async () => {
      // 実行
      const data = await apiClient.fetchTagData('Pump01.Temperature');
      
      // 検証
      expect(data.length).toBeGreaterThan(0);
      
      // 各データポイントの構造を確認
      const point = data[0];
      expect(point).toHaveProperty('timestamp');
      expect(point).toHaveProperty('value');
      expect(point).toHaveProperty('tag', 'Pump01.Temperature');
    });
    
    it('時間範囲でデータをフィルタリングできる', async () => {
      // 時間範囲の指定
      const start = '2023-01-01 00:15:00';
      const end = '2023-01-01 00:20:00';
      
      // 実行
      const data = await apiClient.fetchTagData('Pump01.Temperature', start, end);
      
      // 検証
      expect(data.length).toBeGreaterThan(0);
      
      // すべてのデータポイントが時間範囲内であることを確認
      data.forEach(point => {
        expect(point.timestamp >= start).toBe(true);
        expect(point.timestamp <= end).toBe(true);
      });
    });
  });
  
  describe('fetchBatchData', () => {
    it('複数タグのデータを一括取得できる', async () => {
      // 実行
      const result = await apiClient.fetchBatchData(
        'Pump01',
        ['Pump01.Flow', 'Pump01.Temperature']
      );
      
      // 検証
      expect(Object.keys(result)).toContain('Pump01.Flow');
      expect(Object.keys(result)).toContain('Pump01.Temperature');
      
      // 各タグのデータが正しく取得できていることを確認
      expect(result['Pump01.Flow'].length).toBeGreaterThan(0);
      expect(result['Pump01.Temperature'].length).toBeGreaterThan(0);
    });
    
    it('時間範囲でデータをフィルタリングできる', async () => {
      // 時間範囲の指定
      const start = '2023-01-01 00:15:00';
      const end = '2023-01-01 00:20:00';
      
      // 実行
      const result = await apiClient.fetchBatchData(
        'Pump01',
        ['Pump01.Flow', 'Pump01.Temperature'],
        start,
        end
      );
      
      // すべてのデータポイントが時間範囲内であることを確認
      Object.values(result).forEach(dataPoints => {
        dataPoints.forEach(point => {
          expect(point.timestamp >= start).toBe(true);
          expect(point.timestamp <= end).toBe(true);
        });
      });
    });
  });
  
  describe('fetchWithPagination', () => {
    it('ページング処理でデータを取得できる', async () => {
      // 実行
      const data = await apiClient.fetchWithPagination({
        equipment: 'Pump01',
        tags: ['Pump01.Flow', 'Pump01.Temperature'],
        pageSize: 10
      });
      
      // 検証
      expect(data.length).toBeGreaterThan(0);
      
      // 取得したデータにすべてのタグが含まれていることを確認
      const uniqueTags = [...new Set(data.map(p => p.tag))];
      expect(uniqueTags).toContain('Pump01.Flow');
      expect(uniqueTags).toContain('Pump01.Temperature');
    });
    
    it('時間範囲でデータをフィルタリングできる', async () => {
      // 時間範囲の指定
      const start = '2023-01-01 00:15:00';
      const end = '2023-01-01 00:20:00';
      
      // 実行
      const data = await apiClient.fetchWithPagination({
        equipment: 'Pump01',
        tags: ['Pump01.Flow', 'Pump01.Temperature'],
        start,
        end,
        pageSize: 10
      });
      
      // すべてのデータポイントが時間範囲内であることを確認
      data.forEach(point => {
        expect(point.timestamp >= start).toBe(true);
        expect(point.timestamp <= end).toBe(true);
      });
    });
  });
});
