// src/db.js
// Copyright (c) 2025 toorPIA / toor Inc.
/**
 * TimescaleDB/PostgreSQL Database Module
 * Direct replacement of SQLite implementation
 */
const { Pool } = require('pg');
const config = require('./config');

console.log('Initializing TimescaleDB connection...');
console.log(`  Host: ${config.database.host}`);
console.log(`  Port: ${config.database.port}`);
console.log(`  Database: ${config.database.database}`);
console.log(`  User: ${config.database.user}`);

// PostgreSQL connection pool
const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
  max: 20,                        // Max connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Error handling
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

// Connection success handling
pool.on('connect', () => {
  console.log('New database connection established');
});

// Test connection on startup
(async () => {
  try {
    const result = await pool.query('SELECT version() as version, current_database() as db');
    console.log('✓ TimescaleDB connection successful');
    console.log(`  PostgreSQL: ${result.rows[0].version.split(',')[0]}`);
    console.log(`  Current database: ${result.rows[0].db}`);

    // Check TimescaleDB extension
    const tsdbCheck = await pool.query(`
      SELECT extname, extversion
      FROM pg_extension
      WHERE extname = 'timescaledb'
    `);
    if (tsdbCheck.rows.length > 0) {
      console.log(`✓ TimescaleDB extension: v${tsdbCheck.rows[0].extversion}`);
    } else {
      console.warn('⚠ TimescaleDB extension not found');
    }
  } catch (error) {
    console.error('✗ TimescaleDB connection failed:', error.message);
    console.error('  Please ensure TimescaleDB is running and credentials are correct');
  }
})();

/**
 * Helper: Execute query and return all rows
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} - Array of result rows
 */
async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

/**
 * Helper: Execute query and return first row
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object|null>} - First result row or null
 */
async function get(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

/**
 * Helper: Execute statement (INSERT/UPDATE/DELETE)
 * @param {string} sql - SQL statement
 * @param {Array} params - Statement parameters
 * @returns {Promise<Object>} - Result with rowCount and rows
 */
async function run(sql, params = []) {
  const result = await pool.query(sql, params);
  return {
    rowCount: result.rowCount,
    rows: result.rows,
    // Compatibility with SQLite's lastID (returns first row's id if available)
    lastID: result.rows[0]?.id || null
  };
}

/**
 * Helper: Transaction wrapper
 * @param {Function} callback - Async function to execute within transaction
 * @returns {Promise<*>} - Result from callback
 */
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Helper: Prepare statement
 * Provides compatibility layer for SQLite-style prepared statements
 * Converts ? placeholders to PostgreSQL $1, $2, ... style
 * @param {string} sql - SQL query with ? placeholders
 * @returns {Object} - Prepared statement object with get/all/run methods
 */
function prepare(sql) {
  // Convert SQLite-style ? to PostgreSQL-style $1, $2, ...
  let paramIndex = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);

  return {
    get: async (...params) => get(pgSql, params),
    all: async (...params) => query(pgSql, params),
    run: async (...params) => run(pgSql, params)
  };
}

/**
 * Health check
 * @returns {Promise<boolean>} - True if connection is healthy
 */
async function healthCheck() {
  try {
    const result = await pool.query('SELECT 1 as ok');
    return result.rows[0].ok === 1;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

/**
 * Graceful shutdown
 * @returns {Promise<void>}
 */
async function close() {
  await pool.end();
  console.log('Database connection pool closed');
}

/**
 * Database initialization
 * Note: Schema is primarily initialized via Docker init-scripts/init-timescaledb.sql
 * This function ensures tables exist (useful for non-Docker environments)
 */
async function initDatabase() {
  try {
    // Check if tables exist
    const tableCheck = await pool.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('tags', 'tag_data', 'tag_translations', 'equipment_tags', 'gtags')
    `);

    const tableCount = parseInt(tableCheck.rows[0].count);
    if (tableCount === 5) {
      console.log('✓ All database tables verified');

      // Verify hypertable
      const hypertableCheck = await pool.query(`
        SELECT hypertable_name, num_chunks, compression_enabled
        FROM timescaledb_information.hypertables
        WHERE hypertable_name = 'tag_data'
      `);

      if (hypertableCheck.rows.length > 0) {
        const ht = hypertableCheck.rows[0];
        console.log(`✓ Hypertable 'tag_data' active (${ht.num_chunks} chunks, compression: ${ht.compression_enabled})`);
      }
    } else {
      console.warn(`⚠ Expected 5 tables, found ${tableCount}. Please run init-timescaledb.sql`);
    }
  } catch (error) {
    console.error('Database initialization check failed:', error.message);
  }
}

// Initialize database on module load
initDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
});

// Export both pool and compatibility wrapper
module.exports = {
  pool,           // Export pool for advanced usage
  db: {           // SQLite compatibility wrapper
    prepare,      // Prepared statement helper (async)
    exec: async (sql) => {
      await pool.query(sql);
    },
  },
  // New async API
  query,          // Execute query, return all rows
  get,            // Execute query, return first row
  run,            // Execute statement (INSERT/UPDATE/DELETE)
  transaction,    // Transaction wrapper
  prepare,        // Prepared statement helper
  healthCheck,
  close
};
