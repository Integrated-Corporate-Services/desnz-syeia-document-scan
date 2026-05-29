import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'appdb',
  user: 'postgres',
  password: 'postgres',
  ssl: false,
});

const migrations = [
  `ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS scan_status text`,
  `ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS scan_result text`,
  `ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS virus_name text`,
  `ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS scanned_at timestamp with time zone`,
  `CREATE TABLE IF NOT EXISTS file_scan_events(
    event_id uuid PRIMARY KEY,
    file_id uuid NOT NULL,
    s3_key text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_file_scan_events_file_id ON file_scan_events(file_id)`,
  `CREATE INDEX IF NOT EXISTS idx_file_scan_events_created_at ON file_scan_events(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_uploaded_files_scan_status ON uploaded_files(scan_status)`
];

try {
  console.log('Adding virus scan columns to appdb...');
  for (const sql of migrations) {
    await pool.query(sql);
  }
  console.log('✓ Migration completed successfully!');
  
  const result = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'uploaded_files' AND column_name IN ('scan_status', 'scan_result', 'virus_name', 'scanned_at')`);
  console.log('Columns added:', result.rows.map(r => r.column_name));
  
  const tables = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'file_scan_events'`);
  console.log('Tables created:', tables.rows.map(r => r.tablename));
  
  await pool.end();
} catch (err) {
  console.error('✗ Migration failed:', err.message);
  process.exit(1);
}
