# TimescaleDB Migration Design Document

**Version**: 2.0
**Date**: 2025-12-11
**Author**: Claude Code
**Related Issue**: [GitHub Issue #23](https://github.com/toorpia/if-hub/issues/23)

**Revision History**:
- v2.0 (2025-12-11): **MAJOR SIMPLIFICATION** - Complete replacement strategy, removed abstraction layer
- v1.1 (2025-12-11): Optimized chunk size from 1 day to 30 days based on 1-minute sampling rate
- v1.0 (2025-12-11): Initial design document

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture Analysis](#current-architecture-analysis)
3. [Migration Strategy](#migration-strategy)
4. [Database Schema Design](#database-schema-design)
5. [Implementation Architecture](#implementation-architecture)
6. [Migration Timeline](#migration-timeline)
7. [Testing Strategy](#testing-strategy)
8. [Deployment Plan](#deployment-plan)
9. [Rollback Strategy](#rollback-strategy)
10. [Performance Expectations](#performance-expectations)
11. [Risk Assessment](#risk-assessment)

---

## 1. Executive Summary

### Objective
Migrate IF-HUB from SQLite to TimescaleDB (PostgreSQL extension) to improve time-series data management performance, scalability, and enable advanced time-series features.

### Approach
- **Complete replacement** - Direct SQLite → TimescaleDB code replacement (no abstraction layer)
- **Separate branch development** (`feature/timescaledb-migration`)
- **Simple parallel deployment** - Run both branches in separate directories on different ports
- **Scratch database build** using existing CSV auto-import functionality
- **No data migration** from existing SQLite database
- **No backward compatibility** - SQLite code will be completely removed in the new branch

### Key Benefits
- **10-100x query performance** improvement for time-series data
- **Automatic data compression** reducing storage by 90%+
- **Advanced time-series functions** (continuous aggregates, time bucketing)
- **Better scalability** for production workloads
- **Native PostgreSQL ecosystem** integration

---

## 2. Current Architecture Analysis

### 2.1 Database Overview

| Metric | Value |
|--------|-------|
| **Database Size** | ~1.1 GB |
| **Driver** | better-sqlite3 (synchronous) |
| **Location** | `db/if_hub.db` |
| **Tables** | 5 (tags, tag_data, tag_translations, equipment_tags, gtags) |
| **Primary Workload** | Read-heavy API queries + periodic bulk CSV imports |
| **Sampling Rate** | 1 minute (1,440 rows/day/tag) |
| **Data Growth** | ~60 rows/hour/tag, ~1,440 rows/day/tag |

### 2.2 Current Schema

#### Table: `tags` (Source Tags)
```sql
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  source_tag TEXT NOT NULL,
  unit TEXT,
  min REAL,
  max REAL
);
-- Indexes: idx_tags_source_tag, idx_tags_name
```

#### Table: `tag_data` (Time-Series Data) ⭐ PRIMARY TARGET
```sql
CREATE TABLE tag_data (
  tag_id INTEGER NOT NULL,
  timestamp TEXT NOT NULL,              -- ISO 8601 format
  value REAL,
  PRIMARY KEY (tag_id, timestamp),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);
-- Index: idx_tag_data_timestamp (dropped during import, recreated after)
```

#### Table: `tag_translations` (Localization)
```sql
CREATE TABLE tag_translations (
  tag_id INTEGER NOT NULL,
  language TEXT NOT NULL,
  display_name TEXT NOT NULL,
  unit TEXT,
  PRIMARY KEY (tag_id, language),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);
-- Index: idx_tag_translations_tag_id
```

#### Table: `equipment_tags` (Equipment-Tag Relationships)
```sql
CREATE TABLE equipment_tags (
  equipment_name TEXT NOT NULL,
  tag_name TEXT NOT NULL,
  tag_type TEXT NOT NULL CHECK (tag_type IN ('source', 'gtag')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (equipment_name, tag_name, tag_type)
);
-- Indexes: idx_equipment_tags_equipment, idx_equipment_tags_tag
```

#### Table: `gtags` (Virtual/Calculated Tags)
```sql
CREATE TABLE gtags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  equipment TEXT NOT NULL,
  description TEXT,
  unit TEXT,
  type TEXT NOT NULL,
  definition TEXT NOT NULL,           -- JSON definition
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Indexes: idx_gtags_equipment, idx_gtags_name
```

### 2.3 Key Database Operations

#### CSV Import Process (`src/utils/csv-importer.js`)
1. Read CSV files from `static_equipment_data/`
2. Parse and validate data
3. **Drop** `idx_tag_data_timestamp` index
4. Begin transaction
5. Insert/update tags in batches (500-1000 records)
6. Bulk insert into `tag_data` using `INSERT OR REPLACE`
7. Commit transaction
8. **Recreate** `idx_tag_data_timestamp` index
9. Apply metadata from `tag_translations`

#### API Query Patterns (`src/routes/data.js`)
```javascript
// Most common query pattern
SELECT timestamp, value
FROM tag_data
WHERE tag_id = ?
  AND timestamp >= ?
  AND timestamp <= ?
ORDER BY timestamp
LIMIT ?
```

### 2.4 SQLite Optimizations (Current)
```javascript
db.pragma('journal_mode = WAL')           // Write-Ahead Logging
db.pragma('cache_size = -64000')          // 64MB cache
db.pragma('mmap_size = 268435456')        // 256MB memory-map
```

---

## 3. Migration Strategy

### 3.1 Overall Approach - SIMPLIFIED

```
┌─────────────────────────────────────────────────────────┐
│ COMPLETE REPLACEMENT STRATEGY                           │
├─────────────────────────────────────────────────────────┤
│ 1. Develop on feature branch                            │
│ 2. REMOVE SQLite code completely (better-sqlite3 → pg)  │
│ 3. NO abstraction layer - direct PostgreSQL/TimescaleDB │
│ 4. Synchronous → Asynchronous code conversion           │
│ 5. Fresh database build via CSV auto-import             │
│ 6. Parallel run: separate directories + different ports │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Branch Strategy

```bash
main (SQLite version - unchanged)
  └── feature/timescaledb-migration (TimescaleDB version - complete rewrite)
        ├── Phase 1: Infrastructure & db.js replacement
        ├── Phase 2: Code conversion to async/await
        ├── Phase 3: Testing & optimization
        └── Phase 4: Documentation
```

**Key Point**: `main` branch stays untouched. `feature/timescaledb-migration` is a complete rewrite of database layer.

### 3.3 Simple Parallel Deployment Model

```
┌─────────────────────────────────────────────────────────┐
│ SIMPLE PARALLEL DEPLOYMENT (Separate Directories)      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Directory 1:                Directory 2:               │
│  /path/to/if-hub-sqlite      /path/to/if-hub-timescale │
│                                                         │
│  ┌──────────────┐            ┌──────────────┐          │
│  │ main branch  │            │ feature/...  │          │
│  │ SQLite       │            │ TimescaleDB  │          │
│  │ Port 3000    │            │ Port 3001    │          │
│  │ better-sqlite│            │ pg driver    │          │
│  └──────────────┘            └──────────────┘          │
│         │                            │                 │
│         ▼                            ▼                 │
│  ┌──────────────┐            ┌──────────────┐          │
│  │ if_hub.db    │            │ TimescaleDB  │          │
│  │ (SQLite)     │            │ (PostgreSQL) │          │
│  └──────────────┘            └──────────────┘          │
│                                                         │
│  git checkout main           git checkout feature/...   │
│  npm start                   npm start                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Deployment Steps**:
```bash
# SQLite version (existing)
cd /path/to/if-hub-sqlite
git checkout main
PORT=3000 npm start

# TimescaleDB version (new)
cd /path/to/if-hub-timescale
git checkout feature/timescaledb-migration
PORT=3001 npm start
```

**No need for**:
- ❌ Environment variable switching (`DB_TYPE=...`)
- ❌ Abstraction layer or factory pattern
- ❌ Complex configuration logic
- ❌ Runtime database selection

### 3.4 Configuration (TimescaleDB only)

```javascript
// src/config.js (simplified)
module.exports = {
  database: {
    host: process.env.TIMESCALE_HOST || 'localhost',
    port: parseInt(process.env.TIMESCALE_PORT || '5432', 10),
    database: process.env.TIMESCALE_DB || 'if_hub',
    user: process.env.TIMESCALE_USER || 'if_hub_user',
    password: process.env.TIMESCALE_PASSWORD || ''
  },
  // ... rest of config
};
```

---

## 4. Database Schema Design

### 4.1 Data Type Mapping

| SQLite Type | TimescaleDB Type | Rationale |
|-------------|------------------|-----------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` | PostgreSQL standard |
| `TEXT` (timestamp) | `TIMESTAMPTZ` | Native time-series support, timezone aware |
| `TEXT` (strings) | `TEXT` / `VARCHAR(n)` | PostgreSQL native types |
| `REAL` | `DOUBLE PRECISION` | Higher precision for industrial data |
| `INTEGER` | `INTEGER` / `BIGINT` | Maintain compatibility |

### 4.2 TimescaleDB Schema

#### Table: `tags` (No major changes)
```sql
CREATE TABLE tags (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  source_tag TEXT NOT NULL,
  unit TEXT,
  min DOUBLE PRECISION,
  max DOUBLE PRECISION
);

CREATE INDEX idx_tags_source_tag ON tags(source_tag);
CREATE INDEX idx_tags_name ON tags(name);
```

#### Table: `tag_data` (Hypertable) ⭐ KEY OPTIMIZATION
```sql
CREATE TABLE tag_data (
  tag_id INTEGER NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  value DOUBLE PRECISION,
  PRIMARY KEY (tag_id, timestamp)
);

-- Convert to hypertable (30-day chunks - optimized for 1-minute sampling)
-- Rationale: 1-minute sampling = 1,440 rows/day/tag
--            With 100-200 tags: ~4.3M rows/month = optimal chunk size
SELECT create_hypertable('tag_data', 'timestamp',
  chunk_time_interval => INTERVAL '30 days',
  if_not_exists => TRUE
);

-- Enable compression (90%+ storage reduction)
ALTER TABLE tag_data SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'tag_id',
  timescaledb.compress_orderby = 'timestamp DESC'
);

-- Auto-compress data older than 30 days (after 1 month)
SELECT add_compression_policy('tag_data', INTERVAL '30 days');

-- Retention policy (optional - delete data older than 1 year)
-- SELECT add_retention_policy('tag_data', INTERVAL '1 year');
```

#### Table: `tag_translations` (No major changes)
```sql
CREATE TABLE tag_translations (
  tag_id INTEGER NOT NULL,
  language TEXT NOT NULL,
  display_name TEXT NOT NULL,
  unit TEXT,
  PRIMARY KEY (tag_id, language),
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX idx_tag_translations_tag_id ON tag_translations(tag_id);
```

#### Table: `equipment_tags` (Timestamp type change)
```sql
CREATE TABLE equipment_tags (
  equipment_name TEXT NOT NULL,
  tag_name TEXT NOT NULL,
  tag_type TEXT NOT NULL CHECK (tag_type IN ('source', 'gtag')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (equipment_name, tag_name, tag_type)
);

CREATE INDEX idx_equipment_tags_equipment ON equipment_tags(equipment_name);
CREATE INDEX idx_equipment_tags_tag ON equipment_tags(tag_name);
```

#### Table: `gtags` (Timestamp type change)
```sql
CREATE TABLE gtags (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  equipment TEXT NOT NULL,
  description TEXT,
  unit TEXT,
  type TEXT NOT NULL,
  definition TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_gtags_equipment ON gtags(equipment);
CREATE INDEX idx_gtags_name ON gtags(name);
```

### 4.3 Chunk Size Optimization Analysis

#### Data Characteristics
- **Sampling Rate**: 1 minute interval
- **Daily Growth**: 1,440 rows/day/tag (60 min × 24 hours)
- **Monthly Growth**: ~43,200 rows/month/tag

#### Chunk Size Comparison

| Chunk Interval | Rows/Tag | Rows (100 tags) | Est. Size | Assessment |
|----------------|----------|-----------------|-----------|------------|
| 1 day | 1,440 | 144,000 | ~4 MB | ❌ Too small - excessive chunk count |
| 7 days | 10,080 | 1,008,000 | ~30 MB | ⚠️ Small - acceptable for <50 tags |
| **30 days** | 43,200 | 4,320,000 | ~130 MB | ✅ **OPTIMAL** - recommended |
| 90 days | 129,600 | 12,960,000 | ~390 MB | ✅ Good for long-term archival |

#### Why 30 Days?

**TimescaleDB Best Practices**:
- Target: 100K - 10M rows per chunk
- Target: 10-50 GB memory per chunk (for larger deployments)

**IF-HUB Specific**:
- 100-200 tags × 43,200 rows/month = **4.3M - 8.6M rows/chunk** ✅
- Estimated size: ~130-260 MB per chunk ✅
- Optimal for query patterns spanning weeks to months
- Better compression efficiency with larger chunks
- Reasonable chunk count (12 chunks/year vs 365 chunks/year for 1-day)

#### Tag Count Adjustments

If your tag count differs significantly:

| Tag Count | Recommended Chunk Size |
|-----------|------------------------|
| < 50 tags | 60-90 days |
| 50-200 tags | **30 days** (default) |
| 200-500 tags | 14-30 days |
| > 500 tags | 7-14 days |

**To adjust after deployment**:
```sql
-- Check current chunk interval
SELECT * FROM timescaledb_information.dimensions
WHERE hypertable_name = 'tag_data';

-- Change chunk interval (affects only new chunks)
SELECT set_chunk_time_interval('tag_data', INTERVAL '14 days');
```

### 4.4 TimescaleDB-Specific Features

#### Continuous Aggregates (Future Enhancement)
```sql
-- Automatically maintain 1-hour averages
CREATE MATERIALIZED VIEW tag_data_hourly
WITH (timescaledb.continuous) AS
SELECT
  tag_id,
  time_bucket('1 hour', timestamp) AS bucket,
  avg(value) AS avg_value,
  min(value) AS min_value,
  max(value) AS max_value,
  count(*) AS count
FROM tag_data
GROUP BY tag_id, bucket;

-- Auto-refresh policy
SELECT add_continuous_aggregate_policy('tag_data_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour'
);
```

#### Time-Bucket Queries (Downsampling)
```sql
-- Get 5-minute averages for the last 24 hours
SELECT
  time_bucket('5 minutes', timestamp) AS bucket,
  avg(value) AS avg_value
FROM tag_data
WHERE tag_id = 123
  AND timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY bucket
ORDER BY bucket;
```

---

## 5. Implementation Architecture - SIMPLIFIED

### 5.1 Module Structure (No Abstraction Layer)

```
src/
├── db.js                        # REPLACED: Direct PostgreSQL/TimescaleDB implementation
├── utils/
│   ├── csv-importer.js          # Update: sync → async/await
│   ├── tag-metadata-importer.js # Update: sync → async/await
│   └── gtag-utils.js            # Update: sync → async/await
├── routes/
│   ├── data.js                  # Update: sync → async/await handlers
│   ├── tags.js                  # Update: sync → async/await handlers
│   └── ...                      # All routes → async/await
├── services/
│   └── server-services.js       # Update: sync → async/await
└── config.js                    # Update: Add TimescaleDB config
```

**Key Changes**:
- ❌ **Removed**: `src/db/` directory with abstraction layer
- ✅ **Simplified**: Direct `src/db.js` replacement
- ✅ **Cleaner**: No factory pattern, no adapters

### 5.2 New Database Module (Direct PostgreSQL)

#### File: `src/db.js` (Complete Replacement)
```javascript
/**
 * TimescaleDB/PostgreSQL Database Module
 * Direct replacement of SQLite implementation
 */
const { Pool } = require('pg');
const config = require('./config');
const path = require('path');
const fs = require('fs');

// PostgreSQL connection pool
const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
  max: 20,                        // Max connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Error handling
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

// Helper: Execute query and return all rows
async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

// Helper: Execute query and return first row
async function get(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

// Helper: Execute statement (INSERT/UPDATE/DELETE)
async function run(sql, params = []) {
  const result = await pool.query(sql, params);
  return {
    rowCount: result.rowCount,
    rows: result.rows
  };
}

// Helper: Transaction wrapper
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

// Helper: Prepare statement (PostgreSQL uses parameterized queries)
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

// Initialize database schema (if needed - usually done via init.sql)
async function initializeSchema() {
  const schemaPath = path.join(__dirname, '../init.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
    console.log('Database schema initialized');
  }
}

// Health check
async function healthCheck() {
  try {
    const result = await pool.query('SELECT 1 as ok');
    return result.rows[0].ok === 1;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

// Graceful shutdown
async function close() {
  await pool.end();
  console.log('Database connection pool closed');
}

module.exports = {
  pool,           // Export pool for advanced usage
  query,          // Execute query, return all rows
  get,            // Execute query, return first row
  run,            // Execute statement (INSERT/UPDATE/DELETE)
  transaction,    // Transaction wrapper
  prepare,        // Prepared statement helper
  initializeSchema,
  healthCheck,
  close
};
```

**Total lines**: ~100 (vs ~1000+ with abstraction layer)

#### Before (SQLite - synchronous):
```javascript
const db = require('./db');

function getTagData(tagId, startTime, endTime) {
  const stmt = db.prepare(`
    SELECT timestamp, value
    FROM tag_data
    WHERE tag_id = ? AND timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp
  `);
  return stmt.all(tagId, startTime, endTime);
}
```

#### After (TimescaleDB - asynchronous):
```javascript
const db = require('./db');  // Direct PostgreSQL/TimescaleDB module

async function getTagData(tagId, startTime, endTime) {
  // Convert SQLite ? to PostgreSQL $1, $2, $3
  const sql = `
    SELECT timestamp, value
    FROM tag_data
    WHERE tag_id = $1 AND timestamp >= $2 AND timestamp <= $3
    ORDER BY timestamp
  `;
  return await db.query(sql, [tagId, startTime, endTime]);
}
```

**Key Changes**:
- ✅ Add `async` keyword to function
- ✅ Add `await` to database calls
- ✅ Change `?` placeholders to `$1, $2, $3`
- ✅ Use `db.query()` instead of prepared statements (or use `db.prepare()` helper)

---

## 6. Migration Timeline - SIMPLIFIED

### Phase 1: Infrastructure & Direct Replacement (Week 1-2)

#### Tasks:
1. **Branch Setup**
   - Create `feature/timescaledb-migration` branch
   - Update `.gitignore` for TimescaleDB files

2. **Docker Infrastructure**
   - Create `docker-compose.timescaledb.yml`
   - Create `init.sql` for schema initialization
   - Test TimescaleDB container startup

3. **Direct Database Replacement**
   - Replace `src/db.js` with PostgreSQL implementation (~100 lines)
   - Remove `better-sqlite3` from `package.json`
   - Add `pg` to `package.json`
   - No abstraction layer needed!

4. **Configuration**
   - Update `src/config.js` with TimescaleDB connection settings
   - Create `.env.timescaledb.example`
   - Document environment variables

#### Deliverables:
- Working TimescaleDB Docker container
- New `src/db.js` with PostgreSQL implementation
- Updated `package.json`
- Configuration documented

### Phase 2: Feature Implementation (Week 2-3)

#### Tasks:
1. **CSV Importer Migration**
   - Update `csv-importer.js` to use abstraction layer
   - Convert synchronous code to async/await
   - Implement TimescaleDB-specific bulk insert
   - Test with real CSV files

2. **Metadata Importer Migration**
   - Update `tag-metadata-importer.js` to use abstraction
   - Convert to async/await
   - Test metadata loading

3. **gTag System Migration**
   - Update `gtag-utils.js` to use abstraction
   - Convert to async/await
   - Test virtual tag calculations

4. **API Routes Migration**
   - Update all routes (`data.js`, `tags.js`, `equipment.js`, etc.)
   - Convert to async/await handlers
   - Update error handling for async operations
   - Test all API endpoints

5. **Server Services Migration**
   - Update `server-services.js` initialization
   - Update file watchers
   - Test auto-import functionality

#### Deliverables:
- All modules using abstraction layer
- Async/await conversion complete
- Integration tests passing
- CSV auto-import working with TimescaleDB

### Phase 3: Testing & Optimization (Week 3-4)

#### Tasks:
1. **Functional Testing**
   - Test CSV import (small, medium, large files)
   - Test all API endpoints
   - Test gTag calculations
   - Test metadata loading
   - Test file watchers

2. **Performance Testing**
   - Benchmark query performance (SQLite vs TimescaleDB)
   - Optimize slow queries
   - Tune TimescaleDB settings
   - Load testing with realistic data

3. **TimescaleDB Optimizations**
   - Configure compression policies
   - Create continuous aggregates (if needed)
   - Optimize chunk intervals
   - Configure retention policies (optional)

4. **Error Handling**
   - Test connection failures
   - Test transaction rollbacks
   - Test invalid data handling
   - Test concurrent operations

#### Deliverables:
- Comprehensive test suite
- Performance benchmarks
- Optimization documentation
- Bug fixes completed

### Phase 4: Documentation & Deployment Prep (Week 4)

#### Tasks:
1. **Documentation**
   - Update README.md
   - Create TIMESCALEDB.md deployment guide
   - Document configuration options
   - Create troubleshooting guide
   - Update API documentation (if affected)

2. **Deployment Scripts**
   - Create database initialization scripts
   - Create backup/restore scripts
   - Create health check scripts
   - Update monitoring configs

3. **Example Configurations**
   - `.env.timescaledb.example`
   - `docker-compose.timescaledb.yml`
   - Sample nginx reverse proxy config

4. **Migration Checklist**
   - Pre-deployment checklist
   - Deployment steps
   - Post-deployment validation
   - Rollback procedures

#### Deliverables:
- Complete documentation
- Deployment scripts
- Example configurations
- Ready for production deployment

---

## 7. Testing Strategy

### 7.1 Unit Tests

#### Database Abstraction Layer
```javascript
describe('Database Abstraction Layer', () => {
  describe('SQLiteAdapter', () => {
    it('should connect and initialize schema', async () => { ... });
    it('should insert and retrieve tags', async () => { ... });
    it('should handle transactions', async () => { ... });
    it('should bulk insert time-series data', async () => { ... });
  });

  describe('TimescaleDBAdapter', () => {
    it('should connect to TimescaleDB', async () => { ... });
    it('should create hypertables', async () => { ... });
    it('should insert and retrieve tags', async () => { ... });
    it('should handle transactions', async () => { ... });
    it('should bulk insert time-series data', async () => { ... });
    it('should query with time bucketing', async () => { ... });
  });
});
```

### 7.2 Integration Tests

#### CSV Import
- Small file (100 rows)
- Medium file (10,000 rows)
- Large file (1,000,000 rows)
- Malformed CSV handling
- Duplicate timestamp handling

#### API Endpoints
- GET `/api/tags` - List all tags
- GET `/api/data/:tagId` - Query time-series data
- GET `/api/equipment/:name` - Equipment data
- POST `/api/gtags` - Create virtual tag
- Error handling (404, 500, etc.)

### 7.3 Performance Benchmarks

| Operation | SQLite (baseline) | TimescaleDB (target) |
|-----------|-------------------|----------------------|
| Insert 1M rows | ~X seconds | < X/2 seconds |
| Query 100K rows (no filter) | ~Y ms | < Y/10 ms |
| Query 10K rows (time range) | ~Z ms | < Z/5 ms |
| Query with aggregation (1-hour buckets) | ~A ms | < A/10 ms |

### 7.4 Load Testing

```bash
# Use Apache Bench or similar
ab -n 10000 -c 100 http://localhost:3001/api/data/123?start=2024-01-01&end=2024-12-31
```

---

## 8. Deployment Plan

### 8.1 Docker Compose Setup

#### File: `docker-compose.timescaledb.yml`
```yaml
version: '3.8'

services:
  timescaledb:
    image: timescale/timescaledb:latest-pg16
    container_name: if-hub-timescaledb
    environment:
      POSTGRES_DB: if_hub
      POSTGRES_USER: if_hub_user
      POSTGRES_PASSWORD: ${TIMESCALE_PASSWORD:-change_this_password}
      POSTGRES_INITDB_ARGS: "-c shared_preload_libraries=timescaledb"
    ports:
      - "5432:5432"
    volumes:
      - timescale_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/01-init.sql
      - ./timescaledb.conf:/etc/postgresql/postgresql.conf
    networks:
      - if-hub-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U if_hub_user -d if_hub"]
      interval: 10s
      timeout: 5s
      retries: 5

  if-hub-app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: if-hub-app-timescaledb
    environment:
      DB_TYPE: timescaledb
      TIMESCALE_HOST: timescaledb
      TIMESCALE_PORT: 5432
      TIMESCALE_DB: if_hub
      TIMESCALE_USER: if_hub_user
      TIMESCALE_PASSWORD: ${TIMESCALE_PASSWORD:-change_this_password}
      PORT: 3001
    ports:
      - "3001:3001"
    volumes:
      - ./static_equipment_data:/app/static_equipment_data
      - ./tag_metadata:/app/tag_metadata
      - ./gtags:/app/gtags
      - ./configs:/app/configs
      - ./logs:/app/logs
    depends_on:
      timescaledb:
        condition: service_healthy
    networks:
      - if-hub-network
    restart: unless-stopped

volumes:
  timescale_data:
    driver: local

networks:
  if-hub-network:
    driver: bridge
```

### 8.2 Database Initialization Script

#### File: `init.sql`
```sql
-- IF-HUB TimescaleDB Initialization Script
-- Version: 1.1
-- Updated: 2025-12-11 - Optimized chunk size to 30 days for 1-minute sampling

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Table: tags
CREATE TABLE tags (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  source_tag TEXT NOT NULL,
  unit TEXT,
  min DOUBLE PRECISION,
  max DOUBLE PRECISION
);

CREATE INDEX idx_tags_source_tag ON tags(source_tag);
CREATE INDEX idx_tags_name ON tags(name);

-- Table: tag_data (will be converted to hypertable)
CREATE TABLE tag_data (
  tag_id INTEGER NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  value DOUBLE PRECISION,
  PRIMARY KEY (tag_id, timestamp)
);

-- Convert to hypertable (30-day chunks - optimized for 1-minute sampling)
-- Rationale: 1-minute sampling = 1,440 rows/day/tag
--            With 100-200 tags: ~4.3M rows/month = optimal chunk size
SELECT create_hypertable('tag_data', 'timestamp',
  chunk_time_interval => INTERVAL '30 days',
  if_not_exists => TRUE
);

-- Enable compression
ALTER TABLE tag_data SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'tag_id',
  timescaledb.compress_orderby = 'timestamp DESC'
);

-- Add compression policy (compress data older than 30 days)
SELECT add_compression_policy('tag_data', INTERVAL '30 days');

-- Optional: Add retention policy (delete data older than 1 year)
-- SELECT add_retention_policy('tag_data', INTERVAL '1 year');

-- Table: tag_translations
CREATE TABLE tag_translations (
  tag_id INTEGER NOT NULL,
  language TEXT NOT NULL,
  display_name TEXT NOT NULL,
  unit TEXT,
  PRIMARY KEY (tag_id, language),
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX idx_tag_translations_tag_id ON tag_translations(tag_id);

-- Table: equipment_tags
CREATE TABLE equipment_tags (
  equipment_name TEXT NOT NULL,
  tag_name TEXT NOT NULL,
  tag_type TEXT NOT NULL CHECK (tag_type IN ('source', 'gtag')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (equipment_name, tag_name, tag_type)
);

CREATE INDEX idx_equipment_tags_equipment ON equipment_tags(equipment_name);
CREATE INDEX idx_equipment_tags_tag ON equipment_tags(tag_name);

-- Table: gtags
CREATE TABLE gtags (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  equipment TEXT NOT NULL,
  description TEXT,
  unit TEXT,
  type TEXT NOT NULL,
  definition TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_gtags_equipment ON gtags(equipment);
CREATE INDEX idx_gtags_name ON gtags(name);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO if_hub_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO if_hub_user;
```

### 8.3 Environment Configuration

#### File: `.env.timescaledb.example`
```bash
# Database Configuration
DB_TYPE=timescaledb

# TimescaleDB Connection
TIMESCALE_HOST=localhost
TIMESCALE_PORT=5432
TIMESCALE_DB=if_hub
TIMESCALE_USER=if_hub_user
TIMESCALE_PASSWORD=your_secure_password_here

# Application Configuration
PORT=3001
NODE_ENV=production

# Data Paths
STATIC_DATA_PATH=./static_equipment_data
TAG_METADATA_PATH=./tag_metadata
GTAG_PATH=./gtags

# Logging
LOG_LEVEL=info
```

### 8.4 Startup Procedure

```bash
# 1. Clone repository and checkout feature branch
git clone <repo>
cd if-hub
git checkout feature/timescaledb-migration

# 2. Copy and configure environment
cp .env.timescaledb.example .env
# Edit .env with your settings

# 3. Start TimescaleDB
docker-compose -f docker-compose.timescaledb.yml up -d timescaledb

# 4. Wait for database to be ready
docker-compose -f docker-compose.timescaledb.yml logs -f timescaledb
# Wait for "database system is ready to accept connections"

# 5. Install dependencies
npm install

# 6. Place CSV files in static_equipment_data/
cp /path/to/your/csvs/*.csv static_equipment_data/

# 7. Start IF-HUB application
npm start
# Or with Docker:
# docker-compose -f docker-compose.timescaledb.yml up -d if-hub-app

# 8. Monitor auto-import
tail -f logs/if-hub.log

# 9. Verify data
curl http://localhost:3001/api/tags
curl http://localhost:3001/api/data/1?start=2024-01-01&end=2024-12-31
```

---

## 9. Rollback Strategy

### Approach: External Version Management

Since the user manages parallel versions externally:

1. **Keep SQLite version running** on port 3000
2. **Run TimescaleDB version** on port 3001
3. **Client applications** switch between ports as needed
4. **No automated rollback** - user manually switches back to port 3000 if needed

### If TimescaleDB version has issues:

```bash
# Stop TimescaleDB version
docker-compose -f docker-compose.timescaledb.yml down

# Continue using SQLite version (port 3000)
# No data loss - both versions independent
```

---

## 10. Performance Expectations

### 10.1 Query Performance

| Query Type | SQLite (current) | TimescaleDB (expected) | Improvement |
|------------|------------------|------------------------|-------------|
| Simple time range (10K rows) | ~50ms | ~5ms | 10x |
| Large time range (100K rows) | ~500ms | ~50ms | 10x |
| Aggregation (hourly avg) | ~200ms | ~20ms | 10x |
| Multi-tag query | ~1000ms | ~100ms | 10x |
| Insert 1M rows (bulk) | ~30s | ~5s | 6x |

### 10.2 Storage Efficiency

| Metric | SQLite | TimescaleDB | Savings |
|--------|--------|-------------|---------|
| Raw data (1M rows) | ~80 MB | ~80 MB | 0% |
| Compressed data (7+ days old) | N/A | ~8 MB | 90% |
| Index overhead | ~20% | ~10% | 50% reduction |

### 10.3 Scalability

| Aspect | SQLite | TimescaleDB |
|--------|--------|-------------|
| Max concurrent reads | ~10 | ~100+ |
| Max concurrent writes | 1 | 10+ |
| Max database size (practical) | ~10 GB | ~1 TB+ |
| Query response time (growth) | Linear | Logarithmic |

---

## 11. Risk Assessment

### 11.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Async conversion issues** | Medium | High | Thorough testing, gradual rollout |
| **TimescaleDB connection failures** | Low | Medium | Connection pooling, retry logic |
| **Performance regression in specific queries** | Low | Medium | Benchmark tests, query optimization |
| **Data type incompatibilities** | Low | Low | Schema validation, data migration tests |
| **CSV import failures** | Low | High | Extensive testing with real CSV files |

### 11.2 Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Increased infrastructure complexity** | High | Low | Docker Compose simplifies deployment |
| **Database backup/restore procedures** | Medium | Medium | Document pg_dump/pg_restore procedures |
| **Monitoring and alerting gaps** | Medium | Medium | Implement health checks, logging |
| **Team knowledge gap** | Medium | Medium | Documentation, training |

### 11.3 Risk Mitigation Summary

✅ **Parallel deployment** eliminates rollback risk
✅ **Scratch build** eliminates data migration risk
✅ **Separate branch** allows thorough testing before merge
✅ **CSV auto-import** simplifies data initialization
✅ **Abstraction layer** allows easy bug fixes in either backend

---

## Appendix A: SQL Differences Cheat Sheet

| Operation | SQLite | TimescaleDB (PostgreSQL) |
|-----------|--------|--------------------------|
| Auto-increment | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` |
| Placeholder | `?` | `$1, $2, $3` |
| Date/time | `TEXT` or `INTEGER` | `TIMESTAMPTZ` |
| Boolean | `INTEGER (0/1)` | `BOOLEAN` |
| String concat | `||` | `||` or `CONCAT()` |
| Limit | `LIMIT n` | `LIMIT n` |
| Upsert | `INSERT OR REPLACE` | `INSERT ... ON CONFLICT ... DO UPDATE` |
| Transaction | `BEGIN; ... COMMIT;` | `BEGIN; ... COMMIT;` |
| Pragma | `PRAGMA xxx` | `SET xxx` or config file |

---

## Appendix B: Useful TimescaleDB Functions

```sql
-- Time bucketing (downsampling)
SELECT time_bucket('5 minutes', timestamp) AS bucket, avg(value)
FROM tag_data
WHERE tag_id = 123
GROUP BY bucket;

-- Last observation carried forward (LOCF)
SELECT timestamp,
       locf(value) AS value
FROM tag_data
WHERE tag_id = 123;

-- Interpolation
SELECT time_bucket_gapfill('1 hour', timestamp) AS bucket,
       interpolate(avg(value)) AS value
FROM tag_data
WHERE tag_id = 123
GROUP BY bucket;

-- Time-weighted average
SELECT time_weight('LOCF', timestamp, value) AS twa
FROM tag_data
WHERE tag_id = 123;

-- Hypertable info
SELECT * FROM timescaledb_information.hypertables;

-- Chunk info
SELECT * FROM timescaledb_information.chunks
WHERE hypertable_name = 'tag_data';

-- Compression stats
SELECT * FROM timescaledb_information.compression_settings
WHERE hypertable_name = 'tag_data';
```

---

## Appendix C: Monitoring & Health Checks

### Database Health Check Script
```bash
#!/bin/bash
# timescaledb-health.sh

echo "=== TimescaleDB Health Check ==="

# 1. Connection test
psql -h localhost -U if_hub_user -d if_hub -c "SELECT 1;" > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✓ Database connection: OK"
else
  echo "✗ Database connection: FAILED"
  exit 1
fi

# 2. TimescaleDB extension
psql -h localhost -U if_hub_user -d if_hub -c "SELECT extversion FROM pg_extension WHERE extname='timescaledb';"

# 3. Hypertable status
psql -h localhost -U if_hub_user -d if_hub -c "SELECT * FROM timescaledb_information.hypertables;"

# 4. Compression stats
psql -h localhost -U if_hub_user -d if_hub -c "
SELECT
  pg_size_pretty(before_compression_total_bytes) as uncompressed,
  pg_size_pretty(after_compression_total_bytes) as compressed,
  round((1 - after_compression_total_bytes::numeric / before_compression_total_bytes::numeric) * 100, 2) as compression_ratio
FROM timescaledb_information.hypertable_compression_stats
WHERE hypertable_name = 'tag_data';
"

# 5. Recent data
psql -h localhost -U if_hub_user -d if_hub -c "
SELECT
  count(*) as total_rows,
  min(timestamp) as earliest,
  max(timestamp) as latest
FROM tag_data;
"

echo "=== Health Check Complete ==="
```

---

## Appendix D: Backup & Restore

### Backup
```bash
# Full database backup
pg_dump -h localhost -U if_hub_user -d if_hub -F c -f if_hub_backup_$(date +%Y%m%d).dump

# Schema only
pg_dump -h localhost -U if_hub_user -d if_hub -s -f if_hub_schema.sql

# Data only (specific table)
pg_dump -h localhost -U if_hub_user -d if_hub -t tag_data -a -f tag_data.sql
```

### Restore
```bash
# Full restore
pg_restore -h localhost -U if_hub_user -d if_hub_new if_hub_backup_20241211.dump

# Schema restore
psql -h localhost -U if_hub_user -d if_hub_new -f if_hub_schema.sql

# Data restore
psql -h localhost -U if_hub_user -d if_hub_new -f tag_data.sql
```

---

## Conclusion

This design document provides a comprehensive roadmap for migrating IF-HUB from SQLite to TimescaleDB. The approach emphasizes:

1. **Clean implementation** without legacy baggage
2. **Parallel deployment** for risk-free testing
3. **Database abstraction** for maintainability
4. **Scratch build** leveraging existing CSV auto-import
5. **Performance optimization** through TimescaleDB features

Next steps:
1. **Review this document** with stakeholders
2. **Create feature branch** and begin Phase 1
3. **Iterative development** following the 4-phase plan
4. **Continuous testing** throughout development

Questions or concerns should be addressed before proceeding to implementation.
