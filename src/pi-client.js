// pi-client.js
class PIClient {
  constructor(baseUrl = 'http://localhost:3000/api') {
    this.baseUrl = baseUrl;
  }
  
  /**
   * システム情報を取得
   */
  async getSystemInfo() {
    const response = await fetch(`${this.baseUrl}/system/info`);
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    return await response.json();
  }
  
  /**
   * 利用可能なタグ一覧を取得
   */
  async getTags() {
    const response = await fetch(`${this.baseUrl}/tags`);
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    return await response.json();
  }
  
  /**
   * 設備一覧を取得
   */
  async getEquipment() {
    const response = await fetch(`${this.baseUrl}/equipment`);
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    return await response.json();
  }
  
  /**
   * 特定タグのデータを期間指定で取得
   * @param {string} tagId - タグID
   * @param {Object} options - オプション
   * @param {Date|string} [options.start] - 開始時刻
   * @param {Date|string} [options.end] - 終了時刻
   * @param {boolean} [options.timeshift=false] - タイムシフト適用するか
   */
  async getTagData(tagId, options = {}) {
    const { start, end, timeshift = false } = options;
    
    const params = new URLSearchParams();
    if (start) params.append('start', new Date(start).toISOString());
    if (end) params.append('end', new Date(end).toISOString());
    if (timeshift) params.append('timeshift', 'true');
    
    const url = `${this.baseUrl}/data/${tagId}${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Tag ${tagId} not found`);
      }
      throw new Error(`API error: ${response.statusText}`);
    }
    
    return await response.json();
  }
  
  /**
   * 複数タグのデータを一括取得
   * @param {string[]} tagIds - タグIDの配列
   * @param {Object} options - オプション
   * @param {Date|string} [options.start] - 開始時刻
   * @param {Date|string} [options.end] - 終了時刻
   * @param {boolean} [options.timeshift=false] - タイムシフト適用するか
   */
  async getBatchData(tagIds, options = {}) {
    const { start, end, timeshift = false } = options;
    
    const params = new URLSearchParams();
    params.append('tags', tagIds.join(','));
    if (start) params.append('start', new Date(start).toISOString());
    if (end) params.append('end', new Date(end).toISOString());
    if (timeshift) params.append('timeshift', 'true');
    
    const url = `${this.baseUrl}/batch?${params.toString()}`;
    const response = await fetch(url);
    
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    
    return await response.json();
  }
  
  /**
   * 複数タグの最新値を取得（ポーリングシミュレーション）
   * @param {string[]} tagIds - タグIDの配列
   */
  async getCurrentValues(tagIds) {
    const params = new URLSearchParams();
    params.append('tags', tagIds.join(','));
    
    const url = `${this.baseUrl}/current?${params.toString()}`;
    const response = await fetch(url);
    
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    
    return await response.json();
  }
  
  /**
   * ポーリングを開始
   * @param {string[]} tagIds - タグIDの配列
   * @param {number} interval - ポーリング間隔（ミリ秒）
   * @param {Function} callback - コールバック関数
   */
  startPolling(tagIds, interval, callback) {
    if (this.pollingInterval) {
      this.stopPolling();
    }
    
    const poll = async () => {
      try {
        const data = await this.getCurrentValues(tagIds);
        callback(null, data);
      } catch (error) {
        callback(error);
      }
    };
    
    // 初回ポーリング
    poll();
    
    // 定期ポーリング開始
    this.pollingInterval = setInterval(poll, interval);
    
    return {
      stop: () => this.stopPolling()
    };
  }
  
  /**
   * ポーリングを停止
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}

// Node.js環境とブラウザ環境の両方でエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PIClient;
} else {
  window.PIClient = PIClient;
}
