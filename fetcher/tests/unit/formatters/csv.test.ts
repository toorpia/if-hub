/**
 * CSVフォーマッタのテスト
 * src/formatters/csv.tsの単体テスト
 */
import * as fs from 'fs';
import * as path from 'path';
import { CsvFormatter } from '../../../src/formatters/csv';
import { DataPoint } from '../../../src/types/data';
import { OutputConfig } from '../../../src/types/config';
import { pumpData, tankData } from '../../fixtures/test-data';

// ファイルシステム操作のモック
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockImplementation((path) => {
      // dataディレクトリは存在するとみなす
      if (path.includes('data')) {
        return Promise.resolve();
      }
      // 他のパスは存在しないとみなす
      return Promise.reject(new Error('ENOENT'));
    })
  }
}));

jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  dirname: jest.fn(filePath => {
    const parts = filePath.split('/');
    parts.pop();
    return parts.join('/');
  })
}));

// テスト後にモックをリセット
afterEach(() => {
  jest.clearAllMocks();
});

describe('CsvFormatter', () => {
  const testConfig: OutputConfig = {
    format: 'csv',
    directory: './data',
    max_rows_per_file: 5, // テスト用に小さい値に設定
    timestamp_format: 'YYYYMMDD_HHmmss'
  };
  
  const formatter = new CsvFormatter(testConfig);

  describe('writeData', () => {
    it('データが空の場合は空の配列を返す', async () => {
      const result = await formatter.writeData('Pump01', []);
      expect(result).toEqual([]);
      expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });

    it('小さいデータセットを単一ファイルに書き込む', async () => {
      // テスト用に一部のデータを使用
      const testData = pumpData.slice(0, 3);
      
      const result = await formatter.writeData('Pump01', testData);
      
      // 出力の検証
      expect(result.length).toBe(1); // 1つのファイルのみ
      expect(result[0]).toContain('data/Pump01');
      expect(fs.promises.mkdir).toHaveBeenCalledWith(expect.stringContaining('data/Pump01'), expect.any(Object));
      expect(fs.promises.writeFile).toHaveBeenCalledTimes(1);
      
      // 書き込まれたCSV内容の検証
      const writeCall = (fs.promises.writeFile as jest.Mock).mock.calls[0];
      const csvContent = writeCall[1]; // 第2引数がcontent
      
      // CSVヘッダーの確認
      expect(csvContent).toContain('timestamp,tag,value');
      
      // 各データポイントが含まれていることを確認
      testData.forEach(point => {
        expect(csvContent).toContain(`${point.timestamp},${point.tag},${point.value}`);
      });
    });

    it('大きいデータセットを複数ファイルに分割する', async () => {
      // max_rows_per_fileが5なので2つのファイルに分割されるはず
      const testData = pumpData.slice(0, 8);
      
      const result = await formatter.writeData('Pump01', testData);
      
      // 出力の検証
      expect(result.length).toBe(2); // 2つのファイル
      expect(fs.promises.writeFile).toHaveBeenCalledTimes(2);
      
      // ファイル名に開始・終了タイムスタンプが含まれているか確認
      const fileName1 = (fs.promises.writeFile as jest.Mock).mock.calls[0][0];
      const fileName2 = (fs.promises.writeFile as jest.Mock).mock.calls[1][0];
      
      expect(fileName1).toContain('Pump01_');
      expect(fileName2).toContain('Pump01_');
      
      // 異なるファイル名であることを確認
      expect(fileName1).not.toBe(fileName2);
    });

    it('複数のタグを持つデータをフォーマットする', async () => {
      // 異なるタグのデータ
      const testData: DataPoint[] = [
        { timestamp: '2023-01-01 00:00:00', value: 120.5, tag: 'Pump01.Flow', equipment: 'Pump01' },
        { timestamp: '2023-01-01 00:00:00', value: 30.2, tag: 'Pump01.PowerConsumption', equipment: 'Pump01' },
        { timestamp: '2023-01-01 00:00:00', value: 45.5, tag: 'Pump01.Temperature', equipment: 'Pump01' },
      ];
      
      await formatter.writeData('Pump01', testData);
      
      // 書き込まれたCSV内容の検証
      const writeCall = (fs.promises.writeFile as jest.Mock).mock.calls[0];
      const csvContent = writeCall[1]; // 第2引数がcontent
      
      // 各データポイントがCSVに含まれているか確認
      testData.forEach(point => {
        expect(csvContent).toContain(`${point.timestamp},${point.tag},${point.value}`);
      });
    });

    it('生成されるファイル名に設備名とタイムスタンプが含まれる', async () => {
      const testData = tankData.slice(0, 3);
      
      await formatter.writeData('Tank01', testData);
      
      // ファイル名の検証
      const filePath = (fs.promises.writeFile as jest.Mock).mock.calls[0][0];
      const fileName = filePath.split('/').pop();
      
      // ファイル名に設備名が含まれる
      expect(fileName).toContain('Tank01_');
      
      // タイムスタンプが含まれる（日付部分のみ）
      expect(fileName).toMatch(/\d{8}_\d{6}-\d{8}_\d{6}\.csv$/);
    });

    it('出力ディレクトリが存在しない場合は作成する', async () => {
      // ディレクトリチェックのモックを変更して存在しないケースをシミュレート
      (fs.promises.access as jest.Mock).mockRejectedValueOnce(new Error('ENOENT'));
      
      await formatter.writeData('Pump01', pumpData.slice(0, 3));
      
      // ディレクトリ作成が呼ばれたことを確認
      expect(fs.promises.mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });
  });
});
