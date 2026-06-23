export interface UploadedFile {
  id: string;
  storage_provider: string;
  s3_key: string;
  bucket_name: string;
  virtual_folder: string | null;
  filename: string;
  file_content_type: string;
  file_size_bytes: number;
  uploaded_at_timestamp: Date;
  scan_status: string | null;
  scan_result: string | null;
  virus_name: string | null;
  scanned_at: Date | null;
}
