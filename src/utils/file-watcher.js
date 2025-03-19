// src/utils/file-watcher.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

// CSVフォルダパス
const CSV_FOLDER = config.piSystem.mockDataPath;

// チェックサム情報を保存するファイルパス
const CHECKSUM_STORE_PATH = path.join(process.cwd(), 'db', 'file_checksums.json');

// チェックサムデータの保存先ディレクトリを確保
function ensureChecksumDirectory() {
  const dir = path.dirname(CHECKSUM_STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// チェックサム情報をファイルに保存
function saveChecksums(checksums) {
  try {
    ensureChecksumDirectory();
    const data = Object.fromEntries(checksums);
    fs.writeFileSync(CHECKSUM_STORE_PATH, JSON.stringify(data, null, 2));
    console.log(`チェックサム情報をファイルに保存しました: ${CHECKSUM_STORE_PATH}`);
  } catch (error) {
    console.error('チェックサム情報の保存中にエラーが発生しました:', error);
  }
}

// チェックサム情報をファイルから読み込み
function loadChecksums() {
  try {
    if (fs.existsSync(CHECKSUM_STORE_PATH)) {
      const data = JSON.parse(fs.readFileSync(CHECKSUM_STORE_PATH, 'utf8'));
      console.log(`チェックサム情報をファイルから読み込みました: ${CHECKSUM_STORE_PATH}`);
      return new Map(Object.entries(data));
    }
  } catch (error) {
    console.error('チェックサム情報の読み込み中にエラーが発生しました:', error);
  }
  return new Map();
}

// チェックサムマップ（ファイルパス -> チェックサム値）
const fileChecksums = loadChecksums();

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
 * フォルダ内のファイル変更を検出（チェックサムベース）
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
    
    // 変更または新規のファイルを特定（チェックサムの比較）
    const changedFiles = files.filter(file => {
      const lastChecksum = fileChecksums.get(file.path);
      return lastChecksum === undefined || lastChecksum !== file.checksum;
    });
    
    // 処理済みファイル情報を更新
    files.forEach(file => {
      fileChecksums.set(file.path, file.checksum);
    });
    
    // 更新されたチェックサム情報を保存
    saveChecksums(fileChecksums);
    
    return changedFiles;
  } catch (error) {
    console.error('ファイル変更検出中にエラーが発生しました:', error);
    return [];
  }
}

// プロセス終了時にチェックサム情報を保存
process.on('exit', () => {
  saveChecksums(fileChecksums);
});

// 予期せぬ終了時にもチェックサム情報を保存
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
  process.on(signal, () => {
    saveChecksums(fileChecksums);
    process.exit(0);
  });
});

module.exports = { detectChangedFiles, fileChecksums };
