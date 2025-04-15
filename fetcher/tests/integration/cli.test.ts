/**
 * CLIの結合テスト
 */
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// 実際のファイルシステムを使うため長めのタイムアウトを設定
jest.setTimeout(30000);

describe('CLI統合テスト', () => {
  // テスト出力ディレクトリ
  const testOutputDir = path.join(__dirname, '../../test_output');
  
  beforeAll(() => {
    // テスト前にディレクトリを作成
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
  });

  afterEach(() => {
    // 各テスト後にディレクトリをクリーンアップ
    const pumpDir = path.join(testOutputDir, 'Pump01');
    if (fs.existsSync(pumpDir)) {
      // ファイルの削除
      const files = fs.readdirSync(pumpDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(pumpDir, file));
      });
    }
  });

  // ヘルパー関数: CLIコマンドを実行
  const runCli = (args: string): Promise<{ stdout: string; stderr: string; }> => {
    const cliPath = path.join(__dirname, '../../dist/cli/index.js');
    return new Promise((resolve, reject) => {
      exec(`node ${cliPath} ${args}`, (error, stdout, stderr) => {
        if (error && error.code !== 0) {
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  };

  // ヘルパー関数: 生成されたCSVファイルを取得
  const getLatestCsvFile = (): string | null => {
    const pumpDir = path.join(testOutputDir, 'Pump01');
    if (!fs.existsSync(pumpDir)) {
      return null;
    }

    const files = fs.readdirSync(pumpDir)
      .filter(file => file.endsWith('.csv'))
      .map(file => path.join(pumpDir, file));

    if (files.length === 0) {
      return null;
    }

    // 最新のファイルを取得（作成日時でソート）
    return files.sort((a, b) => {
      return fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime();
    })[0];
  };

  // 注意: 以下のテストはIF-HUBサーバーが実行中であることを前提としています
  // これらのテストは自動的に実行されるのではなく、手動で実行するためのサンプルです

  test.skip('基本的なデータ取得', async () => {
    // テスト設定ファイルを指定してコマンドを実行
    await runCli('--equipment Pump01 --config-file ./test.config.yaml');

    // 生成されたCSVファイルを確認
    const csvFile = getLatestCsvFile();
    expect(csvFile).not.toBeNull();

    // ファイルの内容を確認
    if (csvFile) {
      const content = fs.readFileSync(csvFile, 'utf-8');
      expect(content).toContain('timestamp');
      expect(content).toContain('Flow');
      expect(content).toContain('Temperature');
    }
  });

  test.skip('特定のタグのみ取得', async () => {
    // 特定のタグのみを指定
    await runCli('--equipment Pump01 --tags Pump01.Temperature --config-file ./test.config.yaml');

    // 生成されたCSVファイルを確認
    const csvFile = getLatestCsvFile();
    expect(csvFile).not.toBeNull();

    // ファイルの内容を確認
    if (csvFile) {
      const content = fs.readFileSync(csvFile, 'utf-8');
      expect(content).toContain('Temperature');
      expect(content).not.toContain('Flow'); // 他のタグは含まれていないはず
    }
  });

  test.skip('温度条件付きフィルタリング', async () => {
    // 温度が48度より高い条件を指定
    await runCli('--equipment Pump01 --only-when "Pump01.Temperature > 48" --config-file ./test.config.yaml');

    // 生成されたCSVファイルを確認
    const csvFile = getLatestCsvFile();
    expect(csvFile).not.toBeNull();

    // ファイルの内容を確認
    if (csvFile) {
      const content = fs.readFileSync(csvFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim() !== '');
      
      // ヘッダー行を除くデータ行数
      const dataRows = lines.length - 1;
      expect(dataRows).toBeGreaterThan(0);
      
      // 本来はフィルタリングが正しく機能しているか
      // より詳細に検証すべきですが、実際のIF-HUB環境に依存するため省略
    }
  });

  test.skip('期間指定でデータを取得', async () => {
    // 期間を指定
    await runCli('--equipment Pump01 --start "2023-01-01 00:10:00" --end "2023-01-01 00:20:00" --config-file ./test.config.yaml');

    // 生成されたCSVファイルを確認
    const csvFile = getLatestCsvFile();
    expect(csvFile).not.toBeNull();

    // ファイルの内容を確認
    if (csvFile) {
      const content = fs.readFileSync(csvFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim() !== '');
      
      // データが存在することを確認
      expect(lines.length).toBeGreaterThan(1);
      
      // 期間外のデータがないことを検証するには、実際のデータを分析する必要がある
      // ここでは簡略化のため、単にファイルが生成されることを確認
    }
  });
});
