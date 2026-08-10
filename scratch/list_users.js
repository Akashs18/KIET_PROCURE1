import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  user: "postgres",
  host: "13.234.3.0",
  database: "mydb",
  password: 'KIET@tech123',
  port: 5432,
});
try {
  const { rows } = await pool.query('SELECT id, email, role FROM users');
  console.log('USERS:', rows);
} catch (e) {
  console.error(e);
}
await pool.end();
