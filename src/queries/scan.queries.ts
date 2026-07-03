export const FILE_SCAN_QUERIES = {
  FIND_EVENT_BY_ID: `
    SELECT event_id, file_id, s3_key, status, created_at
    FROM public.file_scan_events
    WHERE event_id = $1
  `,
  
  RECORD_EVENT: `
    INSERT INTO public.file_scan_events (event_id, file_id, s3_key, status, created_at)
    VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, NOW())
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id
  `,
} as const;

export const UPLOADED_FILE_QUERIES = {
  FIND_BY_ID: `
    SELECT id, storage_provider, s3_key, bucket_name, virtual_folder, 
           filename, file_content_type, file_size_bytes, uploaded_at_timestamp,
           scan_status, scan_result, virus_name, scanned_at
    FROM public.uploaded_files
    WHERE id = $1
  `,

  FIND_BY_S3_KEY: `
    SELECT id, storage_provider, s3_key, bucket_name, virtual_folder,
           filename, file_content_type, file_size_bytes, uploaded_at_timestamp,
           scan_status, scan_result, virus_name, scanned_at
    FROM public.uploaded_files
    WHERE s3_key = $1
    ORDER BY uploaded_at_timestamp DESC
    LIMIT 1
  `,
  
  UPDATE_SCAN_STATUS: `
    UPDATE public.uploaded_files
    SET scan_status = $2,
        scan_result = $3,
        virus_name = $4,
        scanned_at = $5,
        bucket_name = COALESCE($6, bucket_name)
    WHERE id = $1
  `,
} as const;
