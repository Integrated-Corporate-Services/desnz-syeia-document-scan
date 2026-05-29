-- Fix file_scan_events table schema
-- Run this in PostgreSQL (database: appdb)

\c appdb

-- Add missing columns to existing table
ALTER TABLE file_scan_events 
  ADD COLUMN IF NOT EXISTS s3_key TEXT,
  ADD COLUMN IF NOT EXISTS clamav_version TEXT;

-- Rename columns if they have different names
DO $$ 
BEGIN
  -- Check if scan_status exists and rename to status
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='file_scan_events' AND column_name='scan_status'
  ) THEN
    ALTER TABLE file_scan_events RENAME COLUMN scan_status TO status;
  END IF;
  
  -- Add status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='file_scan_events' AND column_name='status'
  ) THEN
    ALTER TABLE file_scan_events ADD COLUMN status TEXT;
  END IF;
  
  -- Add other columns if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='file_scan_events' AND column_name='scan_result'
  ) THEN
    ALTER TABLE file_scan_events ADD COLUMN scan_result TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='file_scan_events' AND column_name='scan_started_at'
  ) THEN
    ALTER TABLE file_scan_events ADD COLUMN scan_started_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='file_scan_events' AND column_name='scan_completed_at'
  ) THEN
    ALTER TABLE file_scan_events ADD COLUMN scan_completed_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='file_scan_events' AND column_name='error_message'
  ) THEN
    ALTER TABLE file_scan_events ADD COLUMN error_message TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='file_scan_events' AND column_name='virus_name'
  ) THEN
    ALTER TABLE file_scan_events ADD COLUMN virus_name TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='file_scan_events' AND column_name='moved_to_bucket'
  ) THEN
    ALTER TABLE file_scan_events ADD COLUMN moved_to_bucket TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='file_scan_events' AND column_name='moved_to_s3_key'
  ) THEN
    ALTER TABLE file_scan_events ADD COLUMN moved_to_s3_key TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='file_scan_events' AND column_name='created_at'
  ) THEN
    ALTER TABLE file_scan_events ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='file_scan_events' AND column_name='updated_at'
  ) THEN
    ALTER TABLE file_scan_events ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Show the updated schema
\d file_scan_events

-- Show current data
SELECT event_id, file_id, status, s3_key FROM file_scan_events LIMIT 5;
