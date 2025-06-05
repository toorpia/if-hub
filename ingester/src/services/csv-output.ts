import * as fs from 'fs';
import * as path from 'path';

export class CSVOutputService {
  private outputBasePath: string;

  constructor(outputBasePath?: string) {
    // 環境変数から出力パスを取得、デフォルトは '/app/static_equipment_data'
    this.outputBasePath = outputBasePath || process.env.OUTPUT_BASE_PATH || '/app/static_equipment_data';
    
    console.log(`📁 CSV output path: ${this.outputBasePath}`);
  }

  /**
   * CSVデータをアトミックにファイルに書き込む
   */
  async writeCSVFile(filename: string, csvData: string): Promise<void> {
    const outputPath = path.join(this.outputBasePath, filename);
    
    try {
      // 出力ディレクトリが存在しない場合は作成
      if (!fs.existsSync(this.outputBasePath)) {
        fs.mkdirSync(this.outputBasePath, { recursive: true });
      }

      // 一時ファイルに書き込み
      const tempPath = `${outputPath}.tmp.${Date.now()}`;
      console.log(`Writing CSV data to temporary file: ${tempPath}`);
      
      fs.writeFileSync(tempPath, csvData, 'utf8');
      
      // アトミックに本ファイルにrename
      fs.renameSync(tempPath, outputPath);
      
      console.log(`CSV file written successfully: ${outputPath}`);
      
      // ファイルサイズと行数を報告
      const stats = fs.statSync(outputPath);
      const lineCount = csvData.split('\n').filter(line => line.trim().length > 0).length;
      console.log(`File size: ${stats.size} bytes, Lines: ${lineCount}`);
      
    } catch (error) {
      console.error(`Failed to write CSV file ${outputPath}:`, error);
      throw error;
    }
  }

  /**
   * CSVデータの形式を検証
   */
  validateCSVData(csvData: string): { valid: boolean; error?: string; lineCount: number } {
    try {
      const lines = csvData.split('\n').filter(line => line.trim().length > 0);
      
      if (lines.length === 0) {
        return { valid: false, error: 'Empty CSV data', lineCount: 0 };
      }

      // ヘッダー行があることを確認
      const headerLine = lines[0];
      if (!headerLine.includes(',')) {
        return { valid: false, error: 'Invalid CSV header format', lineCount: lines.length };
      }

      // timestampカラムが含まれているかチェック
      const headers = headerLine.split(',').map(h => h.trim().toLowerCase());
      if (!headers.includes('timestamp')) {
        return { valid: false, error: 'Missing timestamp column', lineCount: lines.length };
      }

      return { valid: true, lineCount: lines.length };
    } catch (error) {
      return { valid: false, error: `CSV validation error: ${error}`, lineCount: 0 };
    }
  }

  /**
   * 既存のCSVファイルが存在するかチェック
   */
  fileExists(filename: string): boolean {
    const outputPath = path.join(this.outputBasePath, filename);
    return fs.existsSync(outputPath);
  }

  /**
   * 既存のCSVファイルの情報を取得
   */
  getFileInfo(filename: string): { exists: boolean; size?: number; lastModified?: Date } {
    const outputPath = path.join(this.outputBasePath, filename);
    
    try {
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        return {
          exists: true,
          size: stats.size,
          lastModified: stats.mtime,
        };
      } else {
        return { exists: false };
      }
    } catch (error) {
      console.warn(`Failed to get file info for ${outputPath}:`, error);
      return { exists: false };
    }
  }

  /**
   * 既存のCSVファイルから最新のタイムスタンプを取得
   */
  getLastTimestampFromFile(filename: string): Date | null {
    const outputPath = path.join(this.outputBasePath, filename);
    
    try {
      if (!fs.existsSync(outputPath)) {
        return null;
      }

      const csvData = fs.readFileSync(outputPath, 'utf8');
      const lines = csvData.split('\n').filter(line => line.trim().length > 0);
      
      if (lines.length <= 1) {
        return null; // ヘッダーのみまたは空ファイル
      }

      // 最後のデータ行から時刻を取得
      const lastDataLine = lines[lines.length - 1];
      const columns = lastDataLine.split(',');
      
      if (columns.length === 0) {
        return null;
      }

      // 最初のカラムがtimestampと仮定
      const timestampStr = columns[0].trim();
      
      // 一般的な形式を試行
      const date = new Date(timestampStr);
      
      if (isNaN(date.getTime())) {
        console.warn(`Invalid timestamp format in file ${filename}: ${timestampStr}`);
        return null;
      }

      return date;
    } catch (error) {
      console.warn(`Failed to read last timestamp from ${outputPath}:`, error);
      return null;
    }
  }

  /**
   * 出力ディレクトリの情報を取得
   */
  getOutputDirectoryInfo(): { path: string; exists: boolean; writable: boolean } {
    try {
      const exists = fs.existsSync(this.outputBasePath);
      let writable = false;

      if (exists) {
        // 書き込み可能性をテスト
        const testFile = path.join(this.outputBasePath, '.write_test');
        try {
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
          writable = true;
        } catch (error) {
          writable = false;
        }
      }

      return {
        path: this.outputBasePath,
        exists,
        writable,
      };
    } catch (error) {
      return {
        path: this.outputBasePath,
        exists: false,
        writable: false,
      };
    }
  }
}
