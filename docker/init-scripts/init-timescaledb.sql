-- ============================================================================
-- IF-HUB TimescaleDB Initialization Script
-- ============================================================================
-- Version: 2.0
-- Created: 2025-12-11
-- Optimized for 1-minute sampling rate with 30-day chunks
--
-- This script initializes the IF-HUB database schema on TimescaleDB.
-- It creates all necessary tables, converts tag_data to a hypertable,
-- and configures compression policies for optimal time-series performance.
-- ============================================================================

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================================================
-- Table: tags (Source Tags)
-- ============================================================================
-- Stores metadata about source tags imported from CSV files
CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  source_tag TEXT NOT NULL,
  unit TEXT,
  min DOUBLE PRECISION,
  max DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_tags_source_tag ON tags(source_tag);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

-- ============================================================================
-- Table: tag_data (Time-Series Data) - HYPERTABLE
-- ============================================================================
-- Primary time-series data storage, optimized with TimescaleDB hypertable
CREATE TABLE IF NOT EXISTS tag_data (
  tag_id INTEGER NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  value DOUBLE PRECISION,
  PRIMARY KEY (tag_id, timestamp)
);

-- Convert to hypertable with 30-day chunks (optimized for 1-minute sampling)
-- ============================================================================
-- IMPORTANT: Adjust chunk_time_interval based on your sampling rate
--
-- Recommended chunk sizes (target: 5-10M rows per chunk):
--   0.1s sampling (10Hz), 200 tags: ~172M rows/day  → use '3 days'
--   1s sampling, 100 tags:          ~8.6M rows/day  → use '7 days' or '14 days'
--   1min sampling, 100 tags:        ~144K rows/day  → use '30 days' (default)
--   5min+ sampling, 100 tags:       ~29K rows/day   → use '60 days' or '90 days'
--
-- Formula: chunk_size = target_rows / (samples_per_day × num_tags)
-- See docs/ja/deployment_guide.md for detailed guidance
-- ============================================================================
SELECT create_hypertable('tag_data', 'timestamp',
  chunk_time_interval => INTERVAL '30 days',  -- Adjust for your sampling rate
  if_not_exists => TRUE
);

-- Enable compression for storage optimization (90%+ reduction)
ALTER TABLE tag_data SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'tag_id',
  timescaledb.compress_orderby = 'timestamp DESC'
);

-- Add compression policy (compress data older than 30 days)
-- Adjust based on data volume: high-frequency sampling → compress earlier (e.g., 7 days)
SELECT add_compression_policy('tag_data',
  compress_after => INTERVAL '30 days',  -- Change to '7 days' for high-frequency sampling
  if_not_exists => TRUE
);

-- Optional: Add retention policy (uncomment to enable)
-- Automatically delete data older than specified period
-- Recommended: 2 years for standard, 6 months for high-frequency sampling
-- SELECT add_retention_policy('tag_data',
--   drop_after => INTERVAL '2 years',  -- Adjust based on your retention requirements
--   if_not_exists => TRUE
-- );

-- ============================================================================
-- Table: tag_translations (Localization)
-- ============================================================================
-- Stores localized display names and units for tags
CREATE TABLE IF NOT EXISTS tag_translations (
  tag_id INTEGER NOT NULL,
  language TEXT NOT NULL,
  display_name TEXT NOT NULL,
  unit TEXT,
  PRIMARY KEY (tag_id, language),
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tag_translations_tag_id ON tag_translations(tag_id);

-- ============================================================================
-- Table: equipment_tags (Equipment-Tag Relationships)
-- ============================================================================
-- Many-to-many relationship between equipment and tags
CREATE TABLE IF NOT EXISTS equipment_tags (
  equipment_name TEXT NOT NULL,
  tag_name TEXT NOT NULL,
  tag_type TEXT NOT NULL CHECK (tag_type IN ('source', 'gtag')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (equipment_name, tag_name, tag_type)
);

CREATE INDEX IF NOT EXISTS idx_equipment_tags_equipment ON equipment_tags(equipment_name);
CREATE INDEX IF NOT EXISTS idx_equipment_tags_tag ON equipment_tags(tag_name);

-- ============================================================================
-- Table: gtags (Virtual/Calculated Tags)
-- ============================================================================
-- Stores definitions for virtual tags (gtags) with calculation formulas
CREATE TABLE IF NOT EXISTS gtags (
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

CREATE INDEX IF NOT EXISTS idx_gtags_equipment ON gtags(equipment);
CREATE INDEX IF NOT EXISTS idx_gtags_name ON gtags(name);

-- ============================================================================
-- Grant Permissions
-- ============================================================================
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO if_hub_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO if_hub_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO if_hub_user;

-- ============================================================================
-- Verification and Information Display
-- ============================================================================

-- Verify TimescaleDB extension
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'
  ) THEN
    RAISE NOTICE '✓ TimescaleDB extension installed successfully';
  ELSE
    RAISE EXCEPTION '✗ TimescaleDB extension installation failed';
  END IF;
END $$;

-- Verify hypertable creation
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM timescaledb_information.hypertables
    WHERE hypertable_name = 'tag_data'
  ) THEN
    RAISE NOTICE '✓ tag_data hypertable created successfully';
  ELSE
    RAISE WARNING '✗ tag_data hypertable was not created';
  END IF;
END $$;

-- Display hypertable information
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT
      h.table_name,
      h.num_dimensions,
      d.column_name AS time_column,
      d.interval_length,
      h.compression_state
    FROM timescaledb_information.hypertables h
    JOIN timescaledb_information.dimensions d
      ON h.hypertable_name = d.hypertable_name
    WHERE h.hypertable_name = 'tag_data'
  LOOP
    RAISE NOTICE '---';
    RAISE NOTICE 'Hypertable: %', rec.table_name;
    RAISE NOTICE 'Time column: %', rec.time_column;
    RAISE NOTICE 'Chunk interval: % (30 days)', rec.interval_length;
    RAISE NOTICE 'Compression: %', rec.compression_state;
  END LOOP;
END $$;

-- Display compression policy
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT
      proc_name,
      schedule_interval,
      config
    FROM timescaledb_information.jobs
    WHERE hypertable_name = 'tag_data'
      AND proc_name = 'policy_compression'
  LOOP
    RAISE NOTICE '---';
    RAISE NOTICE 'Compression Policy: Active';
    RAISE NOTICE 'Compress after: 30 days';
  END LOOP;
END $$;

-- Summary
RAISE NOTICE '===================================';
RAISE NOTICE 'IF-HUB Database Initialization Complete';
RAISE NOTICE '===================================';
