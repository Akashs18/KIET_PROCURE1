import { Pool } from 'pg';

const pool = new Pool({
  user: 'postgres',
  host: '13.234.3.0',
  database: 'mydb',
  password: 'KIET@tech123',
  port: 5432,
});

async function testQuery() {
  try {
    const catId = 1;
    const itemsRes = await pool.query(
      `SELECT i.*, c.name as category_name 
       FROM items i 
       LEFT JOIN categories c ON i.category_id = c.id 
       WHERE (i.department ILIKE 'ELCAB' OR i.department ILIKE 'EC%LAB' OR i.department IS NULL) 
       AND (i.category_id = $1 OR i.category_id IS NULL OR c.id = $1)`,
      [catId]
    );
    console.log('QUERY RESULT COUNT:', itemsRes.rows.length);
    console.log('QUERY RESULT:', itemsRes.rows);
  } catch(e) {
    console.error('QUERY ERROR:', e);
  } finally {
    pool.end();
  }
}
testQuery();
