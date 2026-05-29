ALTER TABLE public.uploaded_files
ADD COLUMN IF NOT EXISTS scan_status text,
ADD COLUMN IF NOT EXISTS scan_result text,
ADD COLUMN IF NOT EXISTS virus_name text,
ADD COLUMN IF NOT EXISTS scanned_at timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.file_scan_events(
    event_id uuid PRIMARY KEY,
    file_id uuid NOT NULL,
    s3_key text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_file_scan_events_file_id ON public.file_scan_events(file_id);
CREATE INDEX IF NOT EXISTS idx_file_scan_events_created_at ON public.file_scan_events(created_at);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_scan_status ON public.uploaded_files(scan_status);
