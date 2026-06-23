export interface FileScanEvent {
  event_id: string;
  file_id: string;
  s3_key: string;
  status: string;
  created_at: Date;
}
