// src/utils/file-watcher.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

// CSVフォルダパス
const CSV_FOLDER = config.dataSource.staticDataPath;
// タグメタデータフォルダパス
const TRANSLATIONS_FOLDER = path.join(process.cwd(), 'tag_metadata');

// チェックサム情報を保存するファイルパス
const CHECKSUM_STORE_PATH = path.join(process.cwd(), 'db', 'file_checksums.json');
// タグメタデータ用チェックサム情報を保存するファイルパス
const TRANSLATION_CHECKSUM_STORE_PATH = path.join(process.cwd(), 'db', 'tagmetadata_checksums.json');

// チェックサムデータの保存先ディレクトリを確保
function ensureChecksumDirectory() {
  const dir = path.dirname(CHECKSUM_STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// チェックサム情報をファイルに保存
function saveChecksums(checksums, filePath) {
  try {
    ensureChecksumDirectory();
    const data = Object.fromEntries(checksums);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`チェックサム情報をファイルに保存しました: ${filePath}`);
  } catch (error) {
    console.error('チェックサム情報の保存中にエラーが発生しました:', error);
  }
}

// チェックサム情報をファイルから読み込み（複数チェックサム履歴対応）
function loadChecksums(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      console.log(`チェックサム情報をファイルから読み込みました: ${filePath}`);
      
      // 新しい形式（チェックサム履歴）のMapを作成
      const checksumMap = new Map();
      
      // 各エントリを処理
      for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
          // 既に新形式の場合はそのまま使用
          checksumMap.set(key, value);
        } else {
          // 旧形式（単一チェックサム）から新形式（配列）への変換
          checksumMap.set(key, [value]);
        }
      }
      
      return checksumMap;
    }
  } catch (error) {
    console.error('チェックサム情報の読み込み中にエラーが発生しました:', error);
  }
  return new Map();
}

// CSVファイル用チェックサムマップ（ファイルパス -> チェックサム値）
const fileChecksums = loadChecksums(CHECKSUM_STORE_PATH);

// タグメタデータファイル用チェックサムマップ（ファイルパス -> チェックサム値）
const translationChecksums = loadChecksums(TRANSLATION_CHECKSUM_STORE_PATH);

/**
 * ファイルのチェックサムを計算
 * @param {string} filePath ファイルパス
 * @returns {string} チェックサム（SHA-256ハッシュ）
 */
function calculateChecksum(filePath) {
  try {
    // ファイルが存在するか確認
    if (!fs.existsSync(filePath)) {
      console.warn(`ファイル ${filePath} が存在しません`);
      return null;
    }
    
    // ファイルが読み取り可能か確認
    try {
      fs.accessSync(filePath, fs.constants.R_OK);
    } catch (err) {
      console.warn(`ファイル ${filePath} は読み取りできません`);
      return null;
    }
    
    // チェックサム計算
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  } catch (error) {
    console.error(`ファイル ${filePath} のチェックサム計算中にエラーが発生しました:`, error);
    return null;
  }
}

/**
 * チェックサム履歴を更新（新しいチェックサムを追加）
 * @param {Map} checksumMap チェックサムマップ
 * @param {string} filePath ファイルパス
 * @param {string} newChecksum 新しいチェックサム
 * @param {number} maxHistory 履歴の最大数 (デフォルト: 20)
 */
function updateChecksumHistory(checksumMap, filePath, newChecksum, maxHistory = 20) {
  let checksums = checksumMap.get(filePath) || [];
  
  // 既に同じチェックサムが履歴にある場合は追加しない
  if (!checksums.includes(newChecksum)) {
    // 新しいチェックサムを追加
    checksums.push(newChecksum);
    
    // 履歴が最大数を超えた場合、古いものから削除
    if (checksums.length > maxHistory) {
      checksums = checksums.slice(checksums.length - maxHistory);
    }
    
    // 更新された履歴を保存
    checksumMap.set(filePath, checksums);
  }
}

/**
 * フォルダ内のファイル変更を検出（チェックサム履歴ベース）
 * @returns {Array} 変更があったファイルの配列
 */
function detectChangedFiles() {
  try {
    const files = fs.readdirSync(CSV_FOLDER)
      .filter(file => file.endsWith('.csv'))
      .map(file => {
        const filePath = path.join(CSV_FOLDER, file);
        return {
          path: filePath,
          name: file,
          equipmentId: path.basename(file, '.csv'),
          checksum: calculateChecksum(filePath)
        };
      })
      .filter(file => file.checksum !== null); // チェックサム計算に失敗したファイルを除外
    
    // 変更または新規のファイルを特定（チェックサム履歴との比較）
    const changedFiles = files.filter(file => {
      const checksumHistory = fileChecksums.get(file.path) || [];
      // 過去のどのチェックサムとも一致しない場合は変更あり
      return !checksumHistory.includes(file.checksum);
    });
    
    // 処理済みファイル情報を更新（チェックサム履歴に追加）
    files.forEach(file => {
      updateChecksumHistory(fileChecksums, file.path, file.checksum);
    });
    
    // 更新されたチェックサム情報を保存
    saveChecksums(fileChecksums, CHECKSUM_STORE_PATH);
    
    return changedFiles;
  } catch (error) {
    console.error('ファイル変更検出中にエラーが発生しました:', error);
    return [];
  }
}

/**
 * タグメタデータファイルの変更を検出（チェックサム履歴ベース）
 * @returns {Array} 変更があったタグメタデータファイルの配列
 */
function detectChangedTranslationFiles() {
  try {
    // タグメタデータディレクトリが存在するか確認
    if (!fs.existsSync(TRANSLATIONS_FOLDER)) {
      console.log(`タグメタデータディレクトリが見つかりません: ${TRANSLATIONS_FOLDER}`);
      return [];
    }
    
    const files = fs.readdirSync(TRANSLATIONS_FOLDER)
      .filter(file => file.endsWith('.csv') && file.includes('translations'))
      .map(file => {
        const filePath = path.join(TRANSLATIONS_FOLDER, file);
        const langMatch = file.match(/translations_([a-z]{2}(?:[-_][A-Z]{2})?)\.csv/);
        const language = langMatch ? langMatch[1] : 'default';
        
        return {
          path: filePath,
          name: file,
          language: language,
          checksum: calculateChecksum(filePath)
        };
      })
      .filter(file => file.checksum !== null); // チェックサム計算に失敗したファイルを除外
    
    // 変更または新規のタグメタデータファイルを特定（チェックサム履歴との比較）
    const changedFiles = files.filter(file => {
      const checksumHistory = translationChecksums.get(file.path) || [];
      // 過去のどのチェックサムとも一致しない場合は変更あり
      return !checksumHistory.includes(file.checksum);
    });
    
    // 処理済みタグメタデータファイル情報を更新（チェックサム履歴に追加）
    files.forEach(file => {
      updateChecksumHistory(translationChecksums, file.path, file.checksum);
    });
    
    // 更新されたタグメタデータファイルチェックサム情報を保存
    saveChecksums(translationChecksums, TRANSLATION_CHECKSUM_STORE_PATH);
    
    return changedFiles;
  } catch (error) {
    console.error('タグメタデータファイル変更検出中にエラーが発生しました:', error);
    return [];
  }
}

// プロセス終了時にチェックサム情報を保存
process.on('exit', () => {
  saveChecksums(fileChecksums, CHECKSUM_STORE_PATH);
  saveChecksums(translationChecksums, TRANSLATION_CHECKSUM_STORE_PATH);
});

// 予期せぬ終了時にもチェックサム情報を保存
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
  process.on(signal, () => {
    saveChecksums(fileChecksums, CHECKSUM_STORE_PATH);
    saveChecksums(translationChecksums, TRANSLATION_CHECKSUM_STORE_PATH);
    process.exit(0);
  });
});

module.exports = { 
  detectChangedFiles, 
  detectChangedTranslationFiles, 
  fileChecksums, 
  translationChecksums 
};
