// src/config.js
const path = require('path');

module.exports = {
  // 環境設定
  environment: process.env.NODE_ENV || 'development',
  
  // サーバー設定
  server: {
    port: process.env.PORT || 3000,
    externalPort: process.env.EXTERNAL_PORT || 3001,  // 追加：外部ポート
    corsOrigins: process.env.ALLOWED_ORIGINS || '*'
  },
  
  // API設定
  api: {
    maxRecordsPerRequest: parseInt(process.env.MAX_RECORDS_PER_REQUEST || '1000', 10), // 1リクエストあたりの最大レコード数
  },
  
  // PI System設定
  piSystem: {
    // 開発環境ではモックを使用、本番環境では実際のエンドポイントを使用
    apiUrl: process.env.NODE_ENV === 'production'
      ? process.env.PI_SYSTEM_API_URL
      : 'http://localhost:3000/api',
    
    // データソース設定
    dataSource: process.env.NODE_ENV === 'production'
      ? 'real'  // 本番環境では実際のPI System
      : 'mock', // 開発環境ではモックデータ
      
    // モックデータフォルダ（ドッカー環境に合わせたパス）
    mockDataPath: process.env.MOCK_DATA_PATH || '/app/pi_data',
    
    // ログ出力先
    logPath: process.env.LOG_PATH || '/app/logs'
  },
  
  // toor PIA設定
  toorPia: {
    // 異常検知設定
    anomalyDetection: {
      pollingInterval: process.env.POLLING_INTERVAL || 10000, // 10秒
      changeRateThreshold: process.env.CHANGE_RATE_THRESHOLD || 0.2, // 20%
      severityLevels: {
        low: 0.1,    // 10%
        medium: 0.2, // 20%
        high: 0.3    // 30%
      }
    }
  }
};
