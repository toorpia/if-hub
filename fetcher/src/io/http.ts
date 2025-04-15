/**
 * HTTP通信モジュール
 * APIリクエストの共通処理を提供
 */
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ApiConfig } from '../types/config';
import { ApiResponse } from '../types/data';

/**
 * HTTP通信クライアントクラス
 */
export class HttpClient {
  private client: AxiosInstance;

  /**
   * @param config API設定
   */
  constructor(private config: ApiConfig) {
    this.client = axios.create({
      baseURL: config.base_url,
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // レスポンスインターセプタ
    this.client.interceptors.response.use(
      this.handleSuccess,
      this.handleError
    );
  }

  /**
   * GETリクエストを送信
   * @param url エンドポイントURL
   * @param params クエリパラメータ
   * @returns レスポンスデータ
   */
  async get<T>(url: string, params?: Record<string, any>): Promise<T> {
    const config: AxiosRequestConfig = { params };
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  /**
   * POSTリクエストを送信
   * @param url エンドポイントURL
   * @param data リクエストボディ
   * @returns レスポンスデータ
   */
  async post<T>(url: string, data: any): Promise<T> {
    const response = await this.client.post<T>(url, data);
    return response.data;
  }

  /**
   * 成功時のレスポンス処理
   * @param response レスポンス
   * @returns 処理されたレスポンス
   */
  private handleSuccess(response: AxiosResponse): AxiosResponse {
    return response;
  }

  /**
   * エラー時のレスポンス処理
   * @param error エラー
   * @throws 整形されたエラー
   */
  private handleError(error: any): never {
    if (axios.isAxiosError(error)) {
      const { response, request, message } = error;

      // レスポンスがある場合（サーバーからのエラー）
      if (response) {
        const status = response.status;
        const data = response.data;

        let errorMessage = `サーバーエラー (${status})`;
        if (typeof data === 'object' && data && 'error' in data) {
          errorMessage += `: ${data.error}`;
        }

        throw new Error(errorMessage);
      }
      
      // リクエスト送信後にレスポンスがない場合
      if (request) {
        throw new Error('応答なし: サーバーに到達できませんでした');
      }
      
      // リクエスト設定時のエラー
      throw new Error(`リクエスト設定エラー: ${message}`);
    }

    // その他のエラー
    throw error;
  }
}
