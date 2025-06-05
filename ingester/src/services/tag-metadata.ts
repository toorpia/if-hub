import * as fs from 'fs';
import * as path from 'path';

export interface TagMetadata {
  source_tag: string;
  display_name: string;
  unit: string;
}

export class TagMetadataService {
  private metadataBasePath: string;

  constructor(metadataBasePath?: string) {
    // 環境変数から出力パスを取得、デフォルトは '/app/tag_metadata'
    this.metadataBasePath = metadataBasePath || process.env.TAG_METADATA_PATH || '/app/tag_metadata';
    
    console.log(`📋 Tag metadata path: ${this.metadataBasePath}`);
  }

  /**
   * PI-APIから取得したCSVデータからメタデータを抽出
   */
  extractMetadataFromCSV(csvData: string): TagMetadata[] {
    const lines = csvData.split('\n').filter(line => line.trim().length > 0);
    
    if (lines.length < 3) {
      throw new Error('CSV data does not contain required metadata rows');
    }

    const sourceTags = lines[0].split(',').map(tag => tag.trim());
    const displayNames = lines[1].split(',').map(name => name.trim());
    const units = lines[2].split(',').map(unit => unit.trim());

    // 最初のカラム（datetime）をスキップ
    const metadata: TagMetadata[] = [];
    
    for (let i = 1; i < sourceTags.length; i++) {
      if (sourceTags[i] && displayNames[i] && units[i]) {
        metadata.push({
          source_tag: sourceTags[i],
          display_name: displayNames[i],
          unit: units[i]
        });
      }
    }

    console.log(`Extracted metadata for ${metadata.length} tags`);
    return metadata;
  }

  /**
   * PI-APIから取得したCSVデータを加工してIF-HUB形式に変換
   */
  processRawCSVToIFHubFormat(csvData: string): string {
    const lines = csvData.split('\n');
    
    if (lines.length < 4) {
      throw new Error('CSV data does not contain enough rows for processing');
    }

    // 1行目（ヘッダー）と4行目以降（データ）のみを保持
    const processedLines = [lines[0], ...lines.slice(3)];
    
    // 空行を除去
    const filteredLines = processedLines.filter(line => line.trim().length > 0);
    
    console.log(`Processed CSV: ${filteredLines.length} lines (removed metadata rows)`);
    return filteredLines.join('\n');
  }

  /**
   * 既存のtranslationsファイルを読み込み
   */
  loadExistingTranslations(languageCode: string = 'ja'): TagMetadata[] {
    const filename = `translations_${languageCode}.csv`;
    const filePath = path.join(this.metadataBasePath, filename);
    
    try {
      if (!fs.existsSync(filePath)) {
        console.log(`Translations file does not exist: ${filePath}`);
        return [];
      }

      const csvData = fs.readFileSync(filePath, 'utf8');
      const lines = csvData.split('\n').filter(line => line.trim().length > 0);
      
      if (lines.length <= 1) {
        return []; // ヘッダーのみまたは空ファイル
      }

      const metadata: TagMetadata[] = [];
      
      // ヘッダー行をスキップして読み込み
      for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split(',').map(col => col.trim());
        if (columns.length >= 3) {
          metadata.push({
            source_tag: columns[0],
            display_name: columns[1],
            unit: columns[2]
          });
        }
      }

      console.log(`Loaded ${metadata.length} existing translations from ${filename}`);
      return metadata;
      
    } catch (error) {
      console.warn(`Failed to load existing translations from ${filePath}:`, error);
      return [];
    }
  }

  /**
   * 新しいメタデータを既存のtranslationsファイルに追記
   */
  async updateTranslationsFile(newMetadata: TagMetadata[], languageCode: string = 'ja'): Promise<void> {
    const filename = `translations_${languageCode}.csv`;
    const filePath = path.join(this.metadataBasePath, filename);
    
    try {
      // 出力ディレクトリが存在しない場合は作成
      if (!fs.existsSync(this.metadataBasePath)) {
        fs.mkdirSync(this.metadataBasePath, { recursive: true });
      }

      // 既存のメタデータを読み込み
      const existingMetadata = this.loadExistingTranslations(languageCode);
      
      // 重複チェック：既存のsource_tagセットを作成
      const existingTags = new Set(existingMetadata.map(meta => meta.source_tag));
      
      // 新規のメタデータのみを抽出
      const newEntries = newMetadata.filter(meta => !existingTags.has(meta.source_tag));
      
      if (newEntries.length === 0) {
        console.log(`No new metadata to add to ${filename}`);
        return;
      }

      console.log(`Adding ${newEntries.length} new entries to ${filename}`);

      // 全体のメタデータを結合
      const allMetadata = [...existingMetadata, ...newEntries];

      // CSVファイルを生成
      const csvLines = [
        'source_tag,display_name,unit', // ヘッダー
        ...allMetadata.map(meta => 
          `${meta.source_tag},${meta.display_name},${meta.unit}`
        )
      ];

      const csvContent = csvLines.join('\n') + '\n';

      // 一時ファイルに書き込み、その後アトミックにrename
      const tempPath = `${filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, csvContent, 'utf8');
      fs.renameSync(tempPath, filePath);

      console.log(`Successfully updated ${filename} with ${newEntries.length} new entries`);
      
      // ファイル情報を報告
      const stats = fs.statSync(filePath);
      console.log(`File size: ${stats.size} bytes, Total entries: ${allMetadata.length}`);

    } catch (error) {
      console.error(`Failed to update translations file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * メタデータディレクトリの情報を取得
   */
  getMetadataDirectoryInfo(): { path: string; exists: boolean; writable: boolean } {
    try {
      const exists = fs.existsSync(this.metadataBasePath);
      let writable = false;

      if (exists) {
        // 書き込み可能性をテスト
        const testFile = path.join(this.metadataBasePath, '.write_test');
        try {
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
          writable = true;
        } catch (error) {
          writable = false;
        }
      } else {
        // ディレクトリが存在しない場合は作成を試みる
        try {
          fs.mkdirSync(this.metadataBasePath, { recursive: true });
          writable = true;
        } catch (error) {
          writable = false;
        }
      }

      return {
        path: this.metadataBasePath,
        exists: fs.existsSync(this.metadataBasePath),
        writable,
      };
    } catch (error) {
      return {
        path: this.metadataBasePath,
        exists: false,
        writable: false,
      };
    }
  }
}
