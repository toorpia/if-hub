// src/server.js
// Copyright (c) 2025 toorPIA / toor Inc.
const app = require('./app');
const config = require('./config');
const { initializeServer, setupFileWatchers } = require('./services/server-services');

const PORT = config.server.port;

// サーバー起動関数
async function startServer() {
  try {
    // サーバー初期化
    await initializeServer();

    // サーバー起動
    const server = app.listen(PORT, () => {
      console.log(`IF-HUB Server running on port ${PORT}`);
      console.log(`Environment: ${config.environment}`);
      console.log(`Storage: TimescaleDB (PostgreSQL)`);
      console.log(`Available endpoints:`);
      console.log(`  GET /api/system/info`);
      console.log(`  GET /api/tags`);
      console.log(`  GET /api/tags/sourceTag/:sourceTag`);
      console.log(`  GET /api/gtags`);
      console.log(`  GET /api/equipment`);
      console.log(`  GET /api/data/:tagId`);
      console.log(`  GET /api/batch`);
      console.log(`  GET /api/current`);
      console.log(`  GET /api/status`);
      console.log(`  GET /api/export/equipment/:equipmentId/csv`);
      console.log(`  GET /api/process/ma/:tagId`);
      console.log(`  GET /api/process/zscore/:tagId`);
      console.log(`  GET /api/process/deviation/:tagId`);
    });

    // エラーハンドリング
    server.on('error', (err) => {
      console.error('サーバーエラーが発生しました:', err);
      if (!server.listening) {
        console.error('サーバーを起動できませんでした。プロセスを終了します。');
        process.exit(1);
      }
    });

    // ファイル監視の設定
    setupFileWatchers();

    // プロセス終了のシグナルハンドリング
    ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
      process.on(signal, () => {
        console.log(`シグナル ${signal} を受信しました。サーバーをシャットダウンします...`);
        server.close(() => {
          console.log('サーバーを正常に終了しました');
          process.exit(0);
        });
        
        // 強制終了のためのタイムアウト
        setTimeout(() => {
          console.error('サーバーのシャットダウンがタイムアウトしました。強制終了します');
          process.exit(1);
        }, 5000); // 5秒後に強制終了
      });
    });

  } catch (error) {
    console.error('サーバー起動プロセス中に致命的なエラーが発生しました:', error);
    process.exit(1);
  }
}

// サーバー起動
startServer();
