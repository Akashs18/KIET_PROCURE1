import pg from 'pg';
import bcrypt from 'bcrypt';

const { Pool } = pg;
const pool = new Pool({
  user: "postgres",
  host: "13.234.3.0",
  database: "mydb",
  password: 'KIET@tech123',
  port: 5432,
});

try {
  const hash = await bcrypt.hash('password123', 10);
  const result = await pool.query(
    "UPDATE users SET password = $1 WHERE email = 'inventory@kietsindia.com'",
    [hash]
  );
  console.log('Password reset successful:', result.rowCount, 'row(s) updated.');
} catch (e) {
  console.error(e);
}
await pool.end();
