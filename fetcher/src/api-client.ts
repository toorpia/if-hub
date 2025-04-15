/**
 * IF-HUB APIクライアント
 * IF-HUBの各種APIエンドポイントへのアクセスを提供
 */
import { HttpClient } from './io/http';
import { ApiConfig } from './types/config';
import { 
  TagsListResponse, 
  TagDataResponse, 
  DataPoint,
  ApiResponse 
} from './types/data';

/**
 * データ取得パラメータ
 */
export interface FetchDataParams {
  equipment: string;
  tags: string[];
  start?: string;
  end?: string;
  pageSize?: number;
  limit?: number;
}

/**
 * IF-HUB APIクライアントクラス
 */
export class ApiClient {
  private httpClient: HttpClient;

  /**
   * @param config API設定
   */
  constructor(private config: ApiConfig) {
    this.httpClient = new HttpClient(config);
  }

  /**
   * 利用可能なタグのリストを取得
   * @param equipment 設備名
   * @returns タグリスト
   */
  async fetchAvailableTags(equipment: string): Promise<string[]> {
    try {
      // タグAPI呼び出し
      const tagsResponse = await this.httpClient.get<TagsListResponse>('/api/tags', {
        equipment,
        display: 'false',
        includeGtags: 'true'
      });

      // タグ名のリストを抽出
      const tagNames = tagsResponse.tags.map(tag => tag.name);
      return tagNames;
    } catch (error) {
      console.error(`設備 ${equipment} のタグ一覧取得に失敗しました:`, error);
      throw new Error(`タグ一覧の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 特定のタグのデータを取得
   * @param tagName タグ名
   * @param start 開始時刻（ISO 8601形式）
   * @param end 終了時刻（ISO 8601形式）
   * @returns タグデータ
   */
  async fetchTagData(tagName: string, start?: string, end?: string): Promise<DataPoint[]> {
    try {
      const params: Record<string, any> = {};
      if (start) params.start = start;
      if (end) params.end = end;

      // タグデータAPI呼び出し
      const response = await this.httpClient.get<TagDataResponse>(`/api/data/${tagName}`, params);

      // 返却形式を統一
      return response.data.map(point => ({
        timestamp: point.timestamp,
        value: point.value,
        tag: tagName
      }));
    } catch (error) {
      console.error(`タグ ${tagName} のデータ取得に失敗しました:`, error);
      throw new Error(`タグデータの取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 複数のタグデータを一括取得
   * @param equipment 設備名
   * @param tags タグ名リスト
   * @param start 開始時刻（ISO 8601形式）
   * @param end 終了時刻（ISO 8601形式）
   * @returns タグごとのデータポイント
   */
  async fetchBatchData(equipment: string, tags: string[], start?: string, end?: string): Promise<Record<string, DataPoint[]>> {
    try {
      const tagsStr = tags.join(',');
      const params: Record<string, any> = {
        tags: tagsStr,
      };
      
      if (start) params.start = start;
      if (end) params.end = end;

      // バッチAPI呼び出し
      const response = await this.httpClient.get<Record<string, { metadata: any, data: Array<{ timestamp: string, value: number | null }> }>>('/api/batch', params);

      // 返却形式を統一
      const result: Record<string, DataPoint[]> = {};
      
      for (const [tagName, tagData] of Object.entries(response)) {
        result[tagName] = tagData.data.map(point => ({
          timestamp: point.timestamp,
          value: point.value,
          tag: tagName,
          equipment
        }));
      }

      return result;
    } catch (error) {
      console.error(`設備 ${equipment} のバッチデータ取得に失敗しました:`, error);
      throw new Error(`バッチデータの取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * ページング処理付きでデータを取得
   * @param params 取得パラメータ
   * @returns すべてのデータポイント
   */
  async fetchWithPagination(params: FetchDataParams): Promise<DataPoint[]> {
    const { equipment, tags, start, end, pageSize = this.config.page_size } = params;
    let currentStart = start;
    let allData: DataPoint[] = [];
    let hasMoreData = true;
    let pageCount = 0;

    console.log(`設備 ${equipment} のデータ取得を開始します (ページサイズ: ${pageSize})`);
    
    // 進捗表示のための処理
    const progressInterval = setInterval(() => {
      if (allData.length > 0) {
        console.log(`${pageCount}ページ取得済み (${allData.length}レコード)`);
      }
    }, 5000);

    try {
      while (hasMoreData) {
        pageCount++;
        
        // 現在のページのデータを取得
        const batchData = await this.fetchBatchData(
          equipment,
          tags,
          currentStart,
          end
        );

        // すべてのタグのデータを統合
        const pageData: DataPoint[] = [];
        for (const tagData of Object.values(batchData)) {
          pageData.push(...tagData);
        }

        if (pageData.length === 0) {
          hasMoreData = false;
        } else {
          allData = [...allData, ...pageData];
          
          // 次のページの開始時刻を設定
          const sortedData = [...pageData].sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          
          const lastTimestamp = sortedData[sortedData.length - 1].timestamp;
          // ISO文字列をDateに変換して1ミリ秒進める
          const nextDate = new Date(new Date(lastTimestamp).getTime() + 1);
          currentStart = nextDate.toISOString();
          
          // 終了条件の確認
          if (pageData.length < pageSize || (end && currentStart >= end)) {
            hasMoreData = false;
          }
        }
      }
      
      return allData;
    } catch (error) {
      console.error('ページング処理中にエラーが発生しました:', error);
      throw new Error(`データ取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearInterval(progressInterval);
      console.log(`データ取得完了: ${allData.length}レコード (${pageCount}ページ)`);
    }
  }
}
