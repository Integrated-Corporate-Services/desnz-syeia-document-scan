-- Quick fix: Add missing created_at and updated_at columns
-- Copy and paste this into your PostgreSQL client

ALTER TABLE file_scan_events 
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Verify
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'file_scan_events' 
ORDER BY ordinal_position;
