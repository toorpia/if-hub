// src/db.js
// Copyright (c) 2025 toorPIA / toor Inc.
const sqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');
const config = require('./config');

// データベースファイルのパス
const DB_PATH = process.env.DB_PATH || path.join(config.dataSource.staticDataPath, '../db/if_hub.db');

// データディレクトリの確保
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

console.log(`データベースファイル: ${DB_PATH}`);

// データベース接続の初期化
const db = sqlite3(DB_PATH);

// SQLite最適化設定
db.pragma('journal_mode = WAL');
db.pragma('cache_size = -64000');
db.pragma('mmap_size = 268435456');

console.log('SQLite最適化設定を適用しました:');
console.log(`  - journal_mode: ${db.pragma('journal_mode', { simple: true })}`);
console.log(`  - cache_size: ${db.pragma('cache_size', { simple: true })} pages`);
console.log(`  - mmap_size: ${db.pragma('mmap_size', { simple: true })} bytes`);

// テーブルの作成
function initDatabase() {
  // タグメタデータテーブル（equipment列を削除）
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      source_tag TEXT NOT NULL,
      unit TEXT,
      min REAL,
      max REAL
    )
  `);
  
  // 時系列データテーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS tag_data (
      tag_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      value REAL,
      PRIMARY KEY (tag_id, timestamp),
      FOREIGN KEY (tag_id) REFERENCES tags(id)
    )
  `);
  
  // タグ表示名テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS tag_translations (
      tag_id INTEGER NOT NULL,
      language TEXT NOT NULL,
      display_name TEXT NOT NULL,
      unit TEXT,
      PRIMARY KEY (tag_id, language),
      FOREIGN KEY (tag_id) REFERENCES tags(id)
    )
  `);
  
  // 設備とタグの関連付けテーブル（多対多関係）
  db.exec(`
    CREATE TABLE IF NOT EXISTS equipment_tags (
      equipment_name TEXT NOT NULL,
      tag_name TEXT NOT NULL,
      tag_type TEXT NOT NULL CHECK (tag_type IN ('source', 'gtag')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (equipment_name, tag_name, tag_type)
    )
  `);

  // インデックス作成（検索高速化のため）
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tag_data_timestamp ON tag_data(timestamp)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tags_source_tag ON tags(source_tag)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tag_translations_tag_id ON tag_translations(tag_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_equipment_tags_equipment ON equipment_tags(equipment_name)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_equipment_tags_tag ON equipment_tags(tag_name)`);

  console.log('データベーステーブルの初期化が完了しました');
}

// データベースを初期化
initDatabase();

module.exports = { db };
