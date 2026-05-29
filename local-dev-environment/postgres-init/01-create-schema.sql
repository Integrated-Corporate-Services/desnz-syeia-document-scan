-- Scan status enum
CREATE TYPE scan_status_enum AS ENUM (
  'PENDING_SCAN',
  'AVAILABLE',
  'QUARANTINED',
  'REJECTED'
);

-- Commit status enum
CREATE TYPE commit_status_enum AS ENUM (
  'DRAFT',
  'COMMITTED',
  'DELETE_PENDING'
);

-- Documents table for backend document tracking
CREATE TABLE IF NOT EXISTS public.documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id      UUID NOT NULL,
  section_id    VARCHAR(100) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  s3_bucket     VARCHAR(255),
  s3_key        VARCHAR(500),
  scan_status   scan_status_enum NOT NULL DEFAULT 'PENDING_SCAN',
  commit_status commit_status_enum NOT NULL DEFAULT 'DRAFT',
  file_size     INTEGER,
  mime_type     VARCHAR(100),
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- Indexes for documents table
CREATE INDEX IF NOT EXISTS idx_documents_tasklist 
  ON public.documents(draft_id, section_id, scan_status, commit_status);

CREATE INDEX IF NOT EXISTS idx_documents_cleanup 
  ON public.documents(commit_status, updated_at);

CREATE INDEX IF NOT EXISTS idx_documents_s3_key 
  ON public.documents(s3_key);

-- Uploaded files table for virus scan tracking (legacy/compatibility)
CREATE TABLE IF NOT EXISTS public.uploaded_files(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    storage_provider text NOT NULL,
    s3_key text,
    bucket_name text,
    virtual_folder text,
    filename text NOT NULL,
    file_content_type text NOT NULL,
    file_size_bytes bigint NOT NULL,
    uploaded_at_timestamp timestamp with time zone NOT NULL,
    scan_status text,
    scan_result text,
    virus_name text,
    scanned_at timestamp with time zone,
    PRIMARY KEY (id)
);

-- File scan events table
CREATE TABLE IF NOT EXISTS public.file_scan_events(
    event_id uuid PRIMARY KEY,
    file_id uuid NOT NULL,
    s3_key text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_file_scan_events_file_id ON public.file_scan_events(file_id);
CREATE INDEX IF NOT EXISTS idx_file_scan_events_created_at ON public.file_scan_events(created_at);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_scan_status ON public.uploaded_files(scan_status);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_s3_key ON public.uploaded_files(s3_key);

-- Sample test data for uploaded_files (optional)
INSERT INTO public.uploaded_files (
    id,
    storage_provider,
    s3_key,
    bucket_name,
    virtual_folder,
    filename,
    file_content_type,
    file_size_bytes,
    uploaded_at_timestamp
) VALUES (
    'a0b1c2d3-e4f5-6789-0abc-def123456789',
    's3',
    'test-file.txt',
    'uploads-pre-scan',
    'uploads',
    'test-file.txt',
    'text/plain',
    1024,
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Schema initialization completed successfully';
  RAISE NOTICE '  - documents table (backend)';
  RAISE NOTICE '  - uploaded_files table (scan worker)';
  RAISE NOTICE '  - file_scan_events table';
END $$;
