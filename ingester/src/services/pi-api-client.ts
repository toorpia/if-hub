import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { CommonConfig, PIApiRequest, PIApiResponse } from '../types/config';

export class PIApiClient {
  private httpClient: AxiosInstance;
  private config: CommonConfig;

  constructor(config: CommonConfig) {
    this.config = config;
    this.httpClient = axios.create({
      baseURL: `http://${config.pi_api.host}:${config.pi_api.port}`,
      timeout: config.pi_api.timeout,
    });
  }

  /**
   * PI-Systemからプロセスデータを取得
   */
  async fetchData(request: PIApiRequest): Promise<PIApiResponse> {
    const maxRetries = this.config.pi_api.max_retries;
    const retryInterval = this.config.pi_api.retry_interval;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`PI-API request (attempt ${attempt}/${maxRetries}):`, {
          TagNames: request.TagNames,
          StartDate: request.StartDate,
          EndDate: request.EndDate,
        });

        // TagNamesのカンマはエンコードせず、その他のパラメータのみaxiosのparamsを使用
        const { TagNames: tagNames, ...otherParams } = request;

        const response: AxiosResponse<string> = await this.httpClient.get(`/PIData/?TagNames=${tagNames}`, {
          params: otherParams,
          headers: {
            'Accept': 'text/csv',
          },
        });

        if (response.status === 200) {
          console.log(`PI-API fetch successful: ${response.data.split('\n').length - 1} rows`);
          return {
            success: true,
            data: response.data,
          };
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

      } catch (error: any) {
        const errorMessage = this.extractErrorMessage(error);
        console.warn(`PI-API request failed (attempt ${attempt}/${maxRetries}): ${errorMessage}`);

        // 最後の試行の場合
        if (attempt === maxRetries) {
          return {
            success: false,
            error: `Failed after ${maxRetries} attempts: ${errorMessage}`,
          };
        }

        // リトライ間隔待機
        if (attempt < maxRetries) {
          console.log(`Retrying in ${retryInterval}ms...`);
          await this.sleep(retryInterval);
        }
      }
    }

    return {
      success: false,
      error: 'Unexpected error: max retries exceeded',
    };
  }

  /**
   * 日時をPI-API形式（yyyyMMddHHmmSS）にフォーマット
   */
  formatDateForPI(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  /**
   * タグ名配列をカンマ区切り文字列に変換
   */
  formatTagNames(tags: string[]): string {
    return tags.join(',');
  }

  /**
   * エラーメッセージを抽出
   */
  private extractErrorMessage(error: any): string {
    if (error.response) {
      // HTTPエラーレスポンス
      return `HTTP ${error.response.status}: ${error.response.data || error.response.statusText}`;
    } else if (error.request) {
      // リクエストが送信されたが応答がない
      return `No response from server: ${error.code || 'Connection error'}`;
    } else {
      // その他のエラー
      return error.message || 'Unknown error';
    }
  }

  /**
   * 指定時間待機
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 接続テスト
   */
  async testConnection(): Promise<boolean> {
    try {
      // 短時間の範囲で少数のタグでテスト
      const now = new Date();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

      const testRequest: PIApiRequest = {
        TagNames: 'TEST:TAG', // テスト用のダミータグ
        StartDate: this.formatDateForPI(tenMinutesAgo),
        EndDate: this.formatDateForPI(now),
      };

      const response = await this.httpClient.get('/PIData', {
        params: testRequest,
        timeout: 5000, // 短いタイムアウト
      });

      return response.status === 200;
    } catch (error) {
      console.warn(`PI-API connection test failed: ${this.extractErrorMessage(error)}`);
      return false;
    }
  }
}
