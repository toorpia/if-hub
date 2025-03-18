// src/utils/external-processor.js
const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

// プロセッサディレクトリへのパス
const PROCESSOR_DIR = path.join(__dirname, '../../processors');
const PROCESSOR_RUNNER = path.join(PROCESSOR_DIR, 'run_processor.sh');

class ExternalProcessor {
  constructor() {
    // 初期化時にスクリプトの存在確認
    this.verifyProcessorRunnerExists();
  }
  
  /**
   * プロセッサランナーの存在確認
   */
  verifyProcessorRunnerExists() {
    try {
      const exists = fs.existsSync(PROCESSOR_RUNNER);
      if (!exists) {
        console.error(`警告: プロセッサランナーが見つかりません: ${PROCESSOR_RUNNER}`);
      } else {
        console.log(`プロセッサランナーを確認: ${PROCESSOR_RUNNER}`);
      }
    } catch (error) {
      console.error(`警告: プロセッサランナーの確認中にエラーが発生しました: ${error.message}`);
    }
  }

  /**
   * 外部プロセッサで移動平均を計算
   * @param {Array} data - 処理対象のデータ配列
   * @param {Object} options - 処理オプション
   * @returns {Promise<Array>} 処理結果のデータ配列
   */
  async movingAverage(data, options = {}) {
    const { windowSize = 5, timeshift = false } = options;
    
    // 一時ファイルパスを生成
    const tempInputFile = path.join(os.tmpdir(), `pi_data_${Date.now()}.json`);
    const tempOutputFile = path.join(os.tmpdir(), `pi_result_${Date.now()}.json`);
    
    try {
      // 入力データをJSONファイルに書き込む
      await fs.writeJson(tempInputFile, {
        data,
        options: {
          windowSize,
          timeshift
        }
      });
      
      // 外部プロセッサを実行
      await this.runProcess('moving_average', [
        '--input', tempInputFile,
        '--output', tempOutputFile,
        '--window', windowSize.toString()
      ]);
      
      // 結果を読み込む
      const result = await fs.readJson(tempOutputFile);
      
      return result;
    } finally {
      // 一時ファイルを削除
      await fs.remove(tempInputFile).catch(() => {});
      await fs.remove(tempOutputFile).catch(() => {});
    }
  }
  
  /**
   * 外部プロセスを実行
   * @param {string} processor - プロセッサ名
   * @param {Array} args - コマンドライン引数
   * @returns {Promise<void>}
   */
  async runProcess(processor, args) {
    return new Promise((resolve, reject) => {
      // プロセスを起動
      console.log(`外部プロセッサを実行: ${processor}`);
      const proc = spawn(PROCESSOR_RUNNER, [processor, ...args], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      // 標準出力を収集
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      // 標準エラー出力を収集
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      // プロセス終了時のハンドリング
      proc.on('close', (code) => {
        if (code === 0) {
          console.log(`プロセッサ ${processor} が正常終了しました`);
          console.log(`出力: ${stdout.trim()}`);
          resolve();
        } else {
          console.error(`プロセッサ ${processor} がエラーコード ${code} で終了しました`);
          console.error(`エラー: ${stderr.trim()}`);
          reject(new Error(`外部プロセッサエラー: ${stderr.trim()}`));
        }
      });
      
      // エラーハンドリング
      proc.on('error', (err) => {
        console.error(`プロセッサ起動エラー: ${err.message}`);
        reject(err);
      });
    });
  }
}

module.exports = new ExternalProcessor();
