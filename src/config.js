// src/config.js
// Copyright (c) 2025 toorPIA / toor Inc.
const path = require('path');

module.exports = {
  // 環境設定
  environment: process.env.NODE_ENV || 'development',
  
  // サーバー設定
  server: {
    port: process.env.PORT || 3500,
    externalPort: process.env.EXTERNAL_PORT || 3501,  // 追加：外部ポート
    corsOrigins: process.env.ALLOWED_ORIGINS || '*'
  },
  
  // API設定
  api: {
    maxRecordsPerRequest: parseInt(process.env.MAX_RECORDS_PER_REQUEST || '1000', 10), // 1リクエストあたりの最大レコード数
  },
  
    // データソース設定
  dataSource: {
    // 開発環境では静的データを使用、本番環境では実際のエンドポイントを使用
    apiUrl: process.env.NODE_ENV === 'production'
      ? process.env.EXTERNAL_API_URL
      : 'http://localhost:3500/api',
    
    // データソースモード設定
    mode: process.env.NODE_ENV === 'production'
      ? 'external'  // 本番環境では外部システム
      : 'static', // 開発環境では静的データ
      
    // 静的データフォルダ（Docker環境と非Docker環境の両方に対応）
    staticDataPath: process.env.STATIC_DATA_PATH || 
      (process.env.NODE_ENV === 'production' 
        ? '/app/static_equipment_data' 
        : path.join(process.cwd(), 'static_equipment_data')),
    
    // ログ出力先
    logPath: process.env.LOG_PATH || '/app/logs'
  },
  
  // toorPIA設定
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
