import * as fs from 'fs';
import * as path from 'path';
import { TagMetadataService, TagMetadata } from './tag-metadata';

export class CSVOutputService {
  private outputBasePath: string;
  private tagMetadataService: TagMetadataService;

  constructor(outputBasePath?: string) {
    // 環境変数から出力パスを取得、デフォルトは '/app/static_equipment_data'
    this.outputBasePath = outputBasePath || process.env.OUTPUT_BASE_PATH || '/app/static_equipment_data';
    this.tagMetadataService = new TagMetadataService();
    
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
   * PI-APIから取得した生データを処理してIF-HUB形式に変換し、メタデータを更新
   */
  async processAndWriteRawCSV(filename: string, rawCSVData: string): Promise<{ 
    success: boolean; 
    processedLineCount?: number;
    extractedMetadataCount?: number;
    error?: string;
  }> {
    try {
      console.log(`Processing raw CSV data for ${filename}...`);

      // メタデータディレクトリの確認
      const metadataInfo = this.tagMetadataService.getMetadataDirectoryInfo();
      console.log(`Metadata directory: ${metadataInfo.path} (exists: ${metadataInfo.exists}, writable: ${metadataInfo.writable})`);
      
      if (!metadataInfo.writable) {
        console.warn(`Metadata directory is not writable: ${metadataInfo.path}. Skipping metadata extraction.`);
      }

      // 1. メタデータを抽出（2行目と3行目から）
      let extractedMetadataCount = 0;
      if (metadataInfo.writable) {
        try {
          const metadata = this.tagMetadataService.extractMetadataFromCSV(rawCSVData);
          extractedMetadataCount = metadata.length;
          
          if (metadata.length > 0) {
            // translationsファイルを更新
            await this.tagMetadataService.updateTranslationsFile(metadata, 'ja');
            console.log(`✅ Updated translations file with ${extractedMetadataCount} metadata entries`);
          }
        } catch (metadataError) {
          console.warn(`Failed to extract/update metadata: ${metadataError}`);
          // メタデータの処理に失敗してもCSV処理は続行
        }
      }

      // 2. CSVデータをIF-HUB形式に変換（2行目と3行目を削除）
      const processedCSV = this.tagMetadataService.processRawCSVToIFHubFormat(rawCSVData);

      // 3. 変換後のCSVを検証
      const validation = this.validateProcessedCSV(processedCSV);
      if (!validation.valid) {
        throw new Error(`Invalid processed CSV data: ${validation.error}`);
      }

      // 4. ファイルに書き込み
      await this.writeCSVFile(filename, processedCSV);

      console.log(`✅ Successfully processed ${filename}: ${validation.lineCount} lines, ${extractedMetadataCount} metadata entries`);

      return {
        success: true,
        processedLineCount: validation.lineCount,
        extractedMetadataCount,
      };

    } catch (error: any) {
      const errorMessage = error.message || 'Unknown processing error';
      console.error(`❌ Failed to process raw CSV for ${filename}: ${errorMessage}`);
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 処理済みCSVデータの検証（IF-HUB形式用）
   */
  private validateProcessedCSV(csvData: string): { valid: boolean; error?: string; lineCount: number } {
    try {
      const lines = csvData.split('\n').filter(line => line.trim().length > 0);
      
      if (lines.length === 0) {
        return { valid: false, error: 'Empty CSV data', lineCount: 0 };
      }

      if (lines.length < 2) {
        return { valid: false, error: 'CSV must contain at least header and one data row', lineCount: lines.length };
      }

      // ヘッダー行があることを確認
      const headerLine = lines[0];
      if (!headerLine.includes(',')) {
        return { valid: false, error: 'Invalid CSV header format', lineCount: lines.length };
      }

      // datetime/timestampカラムが含まれているかチェック
      const headers = headerLine.split(',').map(h => h.trim().toLowerCase());
      if (!headers.includes('datetime') && !headers.includes('timestamp')) {
        return { valid: false, error: 'Missing datetime/timestamp column', lineCount: lines.length };
      }

      return { valid: true, lineCount: lines.length };
    } catch (error) {
      return { valid: false, error: `CSV validation error: ${error}`, lineCount: 0 };
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
