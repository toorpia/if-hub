import { DataIngestionScheduler } from './scheduler';

class PIIngesterMain {
  private scheduler: DataIngestionScheduler;
  private isShuttingDown = false;

  constructor() {
    this.scheduler = new DataIngestionScheduler();
  }

  /**
   * アプリケーションを開始
   */
  async start(): Promise<void> {
    console.log('🚀 Starting PI Data Ingester...');
    console.log(`📅 Start time: ${new Date().toISOString()}`);
    console.log(`🌏 Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    
    try {
      // シグナルハンドラーを設定
      this.setupSignalHandlers();
      
      // スケジューラーを開始
      await this.scheduler.startScheduler();
      
      console.log('✅ PI Data Ingester started successfully');
      console.log('ℹ️  Press Ctrl+C to stop gracefully');
      
      // プロセスを継続実行
      this.keepAlive();
      
    } catch (error) {
      console.error('❌ Failed to start PI Data Ingester:', error);
      process.exit(1);
    }
  }

  /**
   * アプリケーションをグレースフルに停止
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) {
      console.log('⚠️  Shutdown already in progress...');
      return;
    }

    this.isShuttingDown = true;
    console.log('\n🛑 Shutting down PI Data Ingester...');
    
    try {
      // スケジューラーを停止
      this.scheduler.stopScheduler();
      
      console.log('✅ PI Data Ingester stopped gracefully');
      process.exit(0);
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * シグナルハンドラーを設定
   */
  private setupSignalHandlers(): void {
    // SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      console.log('\n📨 Received SIGINT (Ctrl+C)');
      this.stop();
    });

    // SIGTERM (docker stop, etc.)
    process.on('SIGTERM', () => {
      console.log('\n📨 Received SIGTERM');
      this.stop();
    });

    // 未処理の例外
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught Exception:', error);
      this.stop();
    });

    // 未処理のPromise拒否
    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      this.stop();
    });
  }

  /**
   * プロセスを継続実行
   */
  private keepAlive(): void {
    // 定期的にスケジューラーの状態を報告
    const statusInterval = setInterval(() => {
      if (this.isShuttingDown) {
        clearInterval(statusInterval);
        return;
      }

      const status = this.scheduler.getSchedulerStatus();
      console.log(`📊 Status: ${status.equipmentCount} equipment(s) scheduled, running tasks: [${status.runningTasks.join(', ')}]`);
    }, 300000); // 5分間隔

    // プロセスを無限に実行
    const keepAliveInterval = setInterval(() => {
      if (this.isShuttingDown) {
        clearInterval(keepAliveInterval);
      }
    }, 1000);
  }

  /**
   * ヘルスチェック用のステータス取得
   */
  getStatus(): any {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      scheduler: this.scheduler.getSchedulerStatus(),
      timestamp: new Date().toISOString(),
    };
  }
}

// アプリケーション開始
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('🏭 IF-HUB PI Data Ingester');
  console.log('   Data acquisition from PI System to IF-HUB');
  console.log(`   Node.js ${process.version}`);
  console.log(`   PID: ${process.pid}`);
  console.log('='.repeat(60));

  const app = new PIIngesterMain();
  await app.start();
}

// エラーハンドリング付きでメイン関数を実行
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Fatal error during startup:', error);
    process.exit(1);
  });
}

export { PIIngesterMain };
