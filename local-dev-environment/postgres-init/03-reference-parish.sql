/**
 * Parish Production Table Schema
 * 
 * Contains pre-populated parish→LPA mappings loaded from seed SQL.
 * 
 * Staging tables (reference_parish_lad, reference_parish_lpa_override)
 * are defined in reference-parish-staging.sql (local maintenance only).
 * 
 * Indexes are defined in: src/database/indexes/parish-indexes.sql
 */


CREATE TABLE IF NOT EXISTS reference_parish (
  parish_code VARCHAR(12) PRIMARY KEY,
  parish_name TEXT NOT NULL,
  lpa_code VARCHAR(10) NOT NULL,
  country VARCHAR(50) NOT NULL DEFAULT 'England',
  active_flag BOOLEAN DEFAULT true,
  effective_from DATE,
  effective_to DATE,
  
  -- ONS-specific columns
  derived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source TEXT NOT NULL,
  
  last_refreshed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT check_parish_code CHECK (parish_code ~ '^E04\d{6}$'),
  CONSTRAINT check_parish_lpa_code CHECK (lpa_code ~ '^[EWS]\d+$'),
  CONSTRAINT fk_parish_lpa FOREIGN KEY (lpa_code) 
  REFERENCES reference_lpa(lpa_code) ON DELETE RESTRICT
);

