
-- Create reference_lpa table
CREATE TABLE IF NOT EXISTS reference_lpa (
  lpa_code VARCHAR(20) PRIMARY KEY,
  lpa_name VARCHAR(255) NOT NULL,
  organisation_type VARCHAR(100),
  country VARCHAR(100) NOT NULL,
  active_flag BOOLEAN DEFAULT true,
  effective_from TIMESTAMP,
  effective_to TIMESTAMP,
  last_refreshed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
