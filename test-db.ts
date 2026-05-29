import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: false,
});

try {
  const res = await pool.query('SELECT current_user, current_database()');
  console.log('✓ Connection successful!');
  console.log('User:', res.rows[0]);pg
  await pool.end();
} catch (err) {
  console.error('✗ Connection failed:', err.message);
  console.error('Config:', { 
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD ? '***' : 'undefined'
  });
}
