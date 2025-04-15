/**
 * APIクライアントのモック
 */
import { pumpData, tankData, pumpEfficiencyGtagData, pumpTempMAGtagData } from '../fixtures/test-data';
import { DataPoint, TagsListResponse, TagDataResponse } from '../../src/types/data';

/**
 * モックAPIレスポンスの作成
 */
export const mockAPIResponses = {
  /**
   * 利用可能なタグのモックリスト
   */
  tags: {
    'Pump01': [
      'Pump01.Flow',
      'Pump01.PowerConsumption',
      'Pump01.Temperature',
      'Pump01.EfficiencyIndex',
      'Pump01.TempMA'
    ],
    'Tank01': [
      'Tank01.Level'
    ]
  },
  
  /**
   * タグデータのモック
   */
  tagData: {
    'Pump01.Flow': pumpData.filter(p => p.tag === 'Pump01.Flow'),
    'Pump01.PowerConsumption': pumpData.filter(p => p.tag === 'Pump01.PowerConsumption'),
    'Pump01.Temperature': pumpData.filter(p => p.tag === 'Pump01.Temperature'),
    'Pump01.EfficiencyIndex': pumpEfficiencyGtagData,
    'Pump01.TempMA': pumpTempMAGtagData,
    'Tank01.Level': tankData
  }
};

/**
 * マップキーに該当する値があれば返し、なければ空配列を返す
 */
function safeGet<T>(map: Record<string, T[]>, key: string): T[] {
  return map[key] || [];
}

// 型安全なバージョンのsafeGet
function safeGetDataPoints(map: Record<string, DataPoint[]>, key: string): DataPoint[] {
  return map[key] || [];
}

/**
 * APIクライアントのモック作成関数
 * @param customResponses カスタムレスポンス（オプション）
 * @returns モックAPIクライアント
 */
export function createMockApiClient(customResponses?: any) {
  // デフォルトのレスポンスとカスタムレスポンスをマージ
  const responses = {
    ...mockAPIResponses,
    ...customResponses
  };
  
  return {
    // モックメソッド: タグ一覧を取得
    fetchAvailableTags: jest.fn().mockImplementation((equipment: string) => {
      return Promise.resolve(responses.tags[equipment] || []);
    }),
    
    // モックメソッド: 特定のタグのデータを取得
    fetchTagData: jest.fn().mockImplementation((tagName: string, start?: string, end?: string) => {
      const data = safeGetDataPoints(responses.tagData, tagName);
      
      // 時間範囲でフィルタリング
      let filteredData = data;
      if (start) {
        filteredData = filteredData.filter(p => p.timestamp >= start);
      }
      if (end) {
        filteredData = filteredData.filter(p => p.timestamp <= end);
      }
      
      return Promise.resolve(filteredData);
    }),
    
    // モックメソッド: 複数タグのデータを一括取得
    fetchBatchData: jest.fn().mockImplementation((equipment: string, tags: string[], start?: string, end?: string) => {
      const result: Record<string, DataPoint[]> = {};
      
      tags.forEach(tag => {
        const data = safeGetDataPoints(responses.tagData, tag);
        
        // 時間範囲でフィルタリング
        let filteredData = data;
        if (start) {
          filteredData = filteredData.filter(p => p.timestamp >= start);
        }
        if (end) {
          filteredData = filteredData.filter(p => p.timestamp <= end);
        }
        
        result[tag] = filteredData;
      });
      
      return Promise.resolve(result);
    }),
    
    // モックメソッド: ページング処理付きでデータを取得
    fetchWithPagination: jest.fn().mockImplementation(({ equipment, tags, start, end }) => {
      const allDataPoints: DataPoint[] = [];
      
      tags.forEach(tag => {
        const data = safeGetDataPoints(responses.tagData, tag);
        
        // 時間範囲でフィルタリング
        let filteredData = data;
        if (start) {
          filteredData = filteredData.filter(p => p.timestamp >= start);
        }
        if (end) {
          filteredData = filteredData.filter(p => p.timestamp <= end);
        }
        
        allDataPoints.push(...filteredData);
      });
      
      return Promise.resolve(allDataPoints);
    })
  };
}

/**
 * HttpClientのモック作成
 */
export function createMockHttpClient() {
  return {
    get: jest.fn().mockImplementation((url: string, params?: Record<string, any>) => {
      // タグ一覧APIのモック
      if (url === '/api/tags') {
        const equipment = params?.equipment;
        if (equipment) {
          const tags = mockAPIResponses.tags[equipment] || [];
          return Promise.resolve({
            tags: tags.map(name => ({
              id: Math.floor(Math.random() * 1000),
              name,
              equipment,
              is_gtag: name.includes('EfficiencyIndex') || name.includes('TempMA')
            }))
          } as TagsListResponse);
        }
      }
      
      // タグデータAPIのモック
      if (url.startsWith('/api/data/')) {
        const tagName = url.replace('/api/data/', '');
        const data = safeGetDataPoints(mockAPIResponses.tagData, tagName);
        const filteredData = data.filter(p => {
          let match = true;
          if (params?.start) match = match && p.timestamp >= params.start;
          if (params?.end) match = match && p.timestamp <= params.end;
          return match;
        });
        
        return Promise.resolve({
          tagId: tagName,
          metadata: {
            id: Math.floor(Math.random() * 1000),
            name: tagName,
            equipment: tagName.split('.')[0],
            unit: tagName.includes('Temperature') ? '°C' : 
                  tagName.includes('Flow') ? 'm³/h' : 
                  tagName.includes('Level') ? '%' : '',
            is_gtag: tagName.includes('EfficiencyIndex') || tagName.includes('TempMA')
          },
          data: filteredData.map(p => ({
            timestamp: p.timestamp,
            value: p.value
          }))
        } as TagDataResponse);
      }
      
      // バッチAPIのモック
      if (url === '/api/batch') {
        const tagNames = (params?.tags || '').split(',');
        const result: Record<string, { metadata: any, data: Array<{ timestamp: string, value: number | null }> }> = {};
        
        tagNames.forEach(tagName => {
          const data = safeGetDataPoints(mockAPIResponses.tagData, tagName);
          const filteredData = data.filter(p => {
            let match = true;
            if (params?.start) match = match && p.timestamp >= params.start;
            if (params?.end) match = match && p.timestamp <= params.end;
            return match;
          });
          
          result[tagName] = {
            metadata: {
              id: Math.floor(Math.random() * 1000),
              name: tagName,
              equipment: tagName.split('.')[0],
              unit: tagName.includes('Temperature') ? '°C' : 
                    tagName.includes('Flow') ? 'm³/h' : 
                    tagName.includes('Level') ? '%' : '',
              is_gtag: tagName.includes('EfficiencyIndex') || tagName.includes('TempMA')
            },
            data: filteredData.map(p => ({
              timestamp: p.timestamp,
              value: p.value
            }))
          };
        });
        
        return Promise.resolve(result);
      }
      
      return Promise.reject(new Error(`Unhandled mock URL: ${url}`));
    }),
    
    post: jest.fn().mockImplementation((url: string, data: any) => {
      return Promise.reject(new Error(`Unhandled mock URL for POST: ${url}`));
    })
  };
}

// モック化のためのJestモジュールファクトリ
export const mockApiClientModule = () => {
  const mockClient = createMockApiClient();
  
  return {
    ApiClient: jest.fn().mockImplementation(() => mockClient)
  };
};

export const mockHttpClientModule = () => {
  const mockClient = createMockHttpClient();
  
  return {
    HttpClient: jest.fn().mockImplementation(() => mockClient)
  };
};
