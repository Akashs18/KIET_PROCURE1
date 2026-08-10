import { fileURLToPath } from "url";
import path from "path";
import XLSX from 'xlsx';

export default function initInventoryExtended(app, pool) {
  const normalizeDepartment = (value) => {
    const input = String(value || '').trim();
    if (!input) return 'ELCAB';
    const normalized = input.toLowerCase();
    if (['elcab', 'ec lab', 'ec-lab', 'ec_lab'].includes(normalized)) return 'ELCAB';
    if (['mechanical', 'mech'].includes(normalized)) return 'Mechanical';
    if (['electrical', 'elec'].includes(normalized)) return 'Electrical';
    return input;
  };

  const makeSerialNo = (prefix) => {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    return `${prefix}-${stamp}-${String(Date.now() % 100000).padStart(5, '0')}`;
  };

  // Schema creation and migration
  (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS categories (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          department TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      await pool.query(`
        ALTER TABLE items
        ADD COLUMN IF NOT EXISTS item_code TEXT UNIQUE,
        ADD COLUMN IF NOT EXISTS department TEXT,
        ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS min_stock NUMERIC(12,3) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS max_stock NUMERIC(12,3) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS rack_number TEXT,
        ADD COLUMN IF NOT EXISTS bin_number TEXT,
        ADD COLUMN IF NOT EXISTS unit TEXT,
        ADD COLUMN IF NOT EXISTS available_qty NUMERIC(12,3) DEFAULT 0;
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS inward_register (
          id SERIAL PRIMARY KEY,
          serial_no TEXT,
          date DATE NOT NULL,
          item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
          supplier_name TEXT,
          po_no TEXT,
          grn_number TEXT,
          invoice_number TEXT,
          quantity_received NUMERIC(12,3) NOT NULL,
          unit_price NUMERIC(12,2) DEFAULT 0,
          total_value NUMERIC(12,2) DEFAULT 0,
          batch_number TEXT,
          rack_location TEXT,
          received_by TEXT,
          remarks TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS outward_register (
          id SERIAL PRIMARY KEY,
          serial_no TEXT,
          date DATE NOT NULL,
          item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
          opening_balance NUMERIC(12,3) NOT NULL,
          quantity_issued NUMERIC(12,3) NOT NULL,
          closing_balance NUMERIC(12,3) NOT NULL,
          issued_to TEXT,
          department TEXT,
          purpose TEXT,
          approved_by TEXT,
          issue_slip_number TEXT,
          remarks TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id SERIAL PRIMARY KEY,
          action TEXT,
          table_name TEXT,
          record_id INTEGER,
          details JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await pool.query(`
        UPDATE items SET category_id = c.id
        FROM categories c
        WHERE items.category_id IS NULL
        AND (items.name ILIKE '%' || c.name || '%' OR c.name ILIKE '%' || items.name || '%');
      `);
      console.log('✅ Extended inventory schema ready');
    } catch (err) {
      console.error('❌ Failed to create extended inventory schema:', err.message);
    }
  })();

  // 1. Categories API
  app.get('/api/inventory/categories', async (req, res) => {
    try {
      const { department } = req.query;
      let query = 'SELECT * FROM categories';
      const params = [];
      if (department) {
        const dept = normalizeDepartment(department);
        if (dept === 'ELCAB') {
          query += ` WHERE (department ILIKE 'ELCAB' OR department ILIKE 'EC%LAB')`;
        } else if (dept === 'Mechanical') {
          query += ` WHERE (department ILIKE 'Mechanical' OR department ILIKE 'mech%')`;
        } else if (dept === 'Electrical') {
          query += ` WHERE (department ILIKE 'Electrical' OR department ILIKE 'elec%')`;
        } else {
          query += ` WHERE department = $1`;
          params.push(dept);
        }
      }
      query += ' ORDER BY name';
      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/inventory/categories', async (req, res) => {
    try {
      const { name, department } = req.body;
      if (!name || !department) return res.status(400).json({ error: 'Name and department required' });
      const normalizedDept = normalizeDepartment(department);
      const existing = await pool.query('SELECT id FROM categories WHERE name ILIKE $1 AND department = $2', [name.trim(), normalizedDept]);
      if (existing.rows.length) return res.status(400).json({ error: 'Category already exists for that department' });
      const { rows } = await pool.query(
        'INSERT INTO categories (name, department) VALUES ($1, $2) RETURNING *',
        [name.trim(), normalizedDept]
      );
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/inventory/categories/:id', async (req, res) => {
    try {
      const { name, department } = req.body;
      if (!name || !department) return res.status(400).json({ error: 'Name and department required' });
      const normalizedDept = normalizeDepartment(department);
      const { rows } = await pool.query(
        'UPDATE categories SET name=$1, department=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
        [name.trim(), normalizedDept, req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Category not found' });
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/inventory/categories/:id', async (req, res) => {
    try {
      await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Items API Extended
  app.get('/api/inventory/items', async (req, res) => {
    try {
      const { department, category_id, search, stock_filter, page = 1, per_page = 10 } = req.query;
      const normalizedDept = department ? normalizeDepartment(department) : null;
      let query = `
        SELECT i.*, c.name as category_name
        FROM items i
        LEFT JOIN categories c ON i.category_id = c.id
        WHERE 1=1
      `;
      const params = [];
      let count = 1;

      if (normalizedDept) {
        if (normalizedDept === 'ELCAB') {
          query += ` AND (i.department ILIKE 'ELCAB' OR i.department ILIKE 'EC%LAB' OR i.department IS NULL)`;
        } else if (normalizedDept === 'Mechanical') {
          query += ` AND (i.department ILIKE 'Mechanical' OR i.department ILIKE 'mech%' OR i.department IS NULL)`;
        } else if (normalizedDept === 'Electrical') {
          query += ` AND (i.department ILIKE 'Electrical' OR i.department ILIKE 'elec%' OR i.department IS NULL)`;
        } else {
          query += ` AND (i.department = $${count} OR i.department IS NULL)`;
          params.push(normalizedDept);
          count++;
        }
      }

      if (category_id) {
        const catIdNum = parseInt(category_id, 10);
        if (!isNaN(catIdNum)) {
          query += ` AND (i.category_id = $${count} OR i.category_id IS NULL OR c.id = $${count})`;
          params.push(catIdNum);
          count++;
        }
      }

      if (search) {
        query += ` AND (i.name ILIKE $${count} OR i.item_code ILIKE $${count} OR i.department ILIKE $${count} OR i.rack_number ILIKE $${count} OR COALESCE(c.name, '') ILIKE $${count})`;
        params.push('%' + search + '%');
        count++;
      }

      if (stock_filter === 'low') {
        query += ` AND i.available_qty <= COALESCE(i.min_stock, 0)`;
      } else if (stock_filter === 'out') {
        query += ` AND i.available_qty <= 0`;
      }

      const pageNumber = parseInt(page, 10) > 0 ? parseInt(page, 10) : 1;
      const perPage = parseInt(per_page, 10) > 0 ? parseInt(per_page, 10) : 10;
      const offset = (pageNumber - 1) * perPage;
      const countQuery = `SELECT COUNT(*)::int AS total FROM (${query}) AS q`;
      const dataQuery = `${query} ORDER BY i.name LIMIT $${count++} OFFSET $${count++}`;
      params.push(perPage, offset);

      const [countRes, dataRes] = await Promise.all([
        pool.query(countQuery, params.slice(0, params.length - 2)),
        pool.query(dataQuery, params)
      ]);
      res.json({ items: dataRes.rows, total_count: countRes.rows[0].total, page: pageNumber, per_page: perPage });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/inventory/items/:id', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT i.*, c.name as category_name
        FROM items i
        LEFT JOIN categories c ON i.category_id = c.id
        WHERE i.id = $1
      `, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Item not found' });
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/inventory/items/extended', async (req, res) => {
    try {
      const { name, item_code, department, category_id, min_stock, max_stock, rack_number, bin_number, unit } = req.body;
      if (!name || !item_code) return res.status(400).json({ error: 'Item code and name are required' });
      const normalizedDept = normalizeDepartment(department || 'ELCAB');
      const { rows } = await pool.query(
        `INSERT INTO items (name, item_code, department, category_id, min_stock, max_stock, rack_number, bin_number, unit, opening_qty, closing_qty, available_qty)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, 0) RETURNING *`,
        [name.trim(), item_code.trim(), normalizedDept, category_id || null, min_stock || 0, max_stock || 0, rack_number, bin_number, unit || null]
      );
      res.json(rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: 'Item code already exists' });
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/inventory/items/extended/:id', async (req, res) => {
    try {
      const { item_code, department, category_id, min_stock, max_stock, rack_number, bin_number, unit } = req.body;
      if (!item_code || !req.body.name) return res.status(400).json({ error: 'Item code and name are required' });
      const normalizedDept = normalizeDepartment(department || 'ELCAB');
      const { rows } = await pool.query(
        `UPDATE items SET item_code=$1, department=$2, category_id=$3, min_stock=$4, max_stock=$5, rack_number=$6, bin_number=$7, unit=$8, name=$9
         WHERE id=$10 RETURNING *`,
        [item_code.trim(), normalizedDept, category_id || null, min_stock || 0, max_stock || 0, rack_number, bin_number, unit || null, req.body.name.trim(), req.params.id]
      );
      res.json(rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: 'Item code already exists' });
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Inward Register
  app.get('/api/inventory/inward', async (req, res) => {
    try {
      const { item_id } = req.query;
      let query = `
        SELECT ir.*, i.name as item_name, i.item_code 
        FROM inward_register ir
        JOIN items i ON ir.item_id = i.id
      `;
      const params = [];
      if (item_id) {
        query += ' WHERE ir.item_id = $1';
        params.push(item_id);
      }
      query += ' ORDER BY ir.created_at DESC';
      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/inventory/inward', async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { date, item_id, supplier_name, po_no, grn_number, invoice_number, quantity_received, unit_price, batch_number, rack_location, received_by, remarks } = req.body;
      
      if (!item_id || !quantity_received || parseFloat(quantity_received) <= 0 || !supplier_name) {
        throw new Error('Item, quantity (>0), and supplier are required');
      }

      const qty = parseFloat(quantity_received);
      const price = parseFloat(unit_price || 0);
      const total_value = (qty * price).toFixed(2);

      const { rows: irRows } = await client.query(
        `INSERT INTO inward_register (serial_no, date, item_id, supplier_name, po_no, grn_number, invoice_number, quantity_received, unit_price, total_value, batch_number, rack_location, received_by, remarks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
        [makeSerialNo('INW'), date, item_id, supplier_name, po_no, grn_number, invoice_number, qty, price, total_value, batch_number, rack_location, received_by, remarks]
      );

      await client.query(
        'UPDATE items SET available_qty = available_qty + $1, closing_qty = closing_qty + $1 WHERE id = $2',
        [qty, item_id]
      );

      await client.query(
        'INSERT INTO audit_log (action, table_name, record_id, details) VALUES ($1, $2, $3, $4)',
        ['INWARD', 'inward_register', irRows[0].id, JSON.stringify(irRows[0])]
      );

      await client.query('COMMIT');
      res.json(irRows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // 4. Outward Register
  app.get('/api/inventory/outward', async (req, res) => {
    try {
      const { item_id } = req.query;
      let query = `
        SELECT or_reg.*, i.name as item_name, i.item_code 
        FROM outward_register or_reg
        JOIN items i ON or_reg.item_id = i.id
      `;
      const params = [];
      if (item_id) {
        query += ' WHERE or_reg.item_id = $1';
        params.push(item_id);
      }
      query += ' ORDER BY or_reg.created_at DESC';
      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/inventory/outward', async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { date, item_id, quantity_issued, issued_to, department, purpose, approved_by, issue_slip_number, remarks } = req.body;

      if (!item_id || !quantity_issued || parseFloat(quantity_issued) <= 0 || !issued_to) {
        throw new Error('Item, quantity (>0), and issued_to are required');
      }

      const issueQty = parseFloat(quantity_issued);
      const { rows: itemRows } = await client.query(
        'SELECT available_qty FROM items WHERE id = $1 FOR UPDATE',
        [item_id]
      );

      if (!itemRows.length) throw new Error('Item not found');
      const currentQty = parseFloat(itemRows[0].available_qty || 0);

      if (issueQty > currentQty) {
        throw new Error(`Insufficient stock. Available: ${currentQty}, Requested: ${issueQty}`);
      }

      const closing_balance = currentQty - issueQty;

      const { rows: orRows } = await client.query(
        `INSERT INTO outward_register (serial_no, date, item_id, opening_balance, quantity_issued, closing_balance, issued_to, department, purpose, approved_by, issue_slip_number, remarks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [makeSerialNo('OUT'), date, item_id, currentQty, issueQty, closing_balance, issued_to, department, purpose, approved_by, issue_slip_number, remarks]
      );

      await client.query(
        'UPDATE items SET available_qty = available_qty - $1, closing_qty = closing_qty - $1 WHERE id = $2',
        [issueQty, item_id]
      );

      await client.query(
        'INSERT INTO audit_log (action, table_name, record_id, details) VALUES ($1, $2, $3, $4)',
        ['OUTWARD', 'outward_register', orRows[0].id, JSON.stringify(orRows[0])]
      );

      await client.query('COMMIT');
      res.json(orRows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // 5. Dashboard Stats
  app.get('/api/inventory/dashboard', async (req, res) => {
    try {
      const { department } = req.query;
      const normalizedDept = department ? normalizeDepartment(department) : null;
      const stats = {};
      const params = normalizedDept ? [normalizedDept] : [];

      const resDepts = await pool.query(
        `SELECT COUNT(DISTINCT department) AS total FROM items WHERE department IS NOT NULL${normalizedDept ? ' AND department = $1' : ''}`,
        params
      );
      stats.total_departments = parseInt(resDepts.rows[0].total || 0);

      const resCats = await pool.query(
        `SELECT COUNT(*) AS total FROM categories${normalizedDept ? ' WHERE department = $1' : ''}`,
        params
      );
      stats.total_categories = parseInt(resCats.rows[0].total || 0);

      const resItems = await pool.query(
        `SELECT COUNT(*) AS total FROM items${normalizedDept ? ' WHERE department = $1' : ''}`,
        params
      );
      stats.total_items = parseInt(resItems.rows[0].total || 0);

      const resVal = await pool.query(
        `SELECT COALESCE(SUM(i.available_qty * (
          SELECT COALESCE(ir.unit_price, 0) FROM inward_register ir WHERE ir.item_id = i.id ORDER BY ir.created_at DESC, ir.id DESC LIMIT 1
        )), 0) AS total_value
        FROM items i${normalizedDept ? ' WHERE i.department = $1' : ''}`,
        params
      );
      stats.total_stock_value = parseFloat(resVal.rows[0].total_value || 0);

      const resLow = await pool.query(
        `SELECT COUNT(*) AS total FROM items WHERE available_qty > 0 AND available_qty <= COALESCE(min_stock, 0)${normalizedDept ? ' AND department = $1' : ''}`,
        params
      );
      stats.low_stock = parseInt(resLow.rows[0].total || 0);

      const resOut = await pool.query(
        `SELECT COUNT(*) AS total FROM items WHERE available_qty <= 0${normalizedDept ? ' AND department = $1' : ''}`,
        params
      );
      stats.out_of_stock = parseInt(resOut.rows[0].total || 0);

      const resInwToday = normalizedDept
        ? await pool.query("SELECT COUNT(*) AS total FROM inward_register ir JOIN items i ON ir.item_id = i.id WHERE ir.date = CURRENT_DATE AND i.department = $1", params)
        : await pool.query("SELECT COUNT(*) AS total FROM inward_register WHERE date = CURRENT_DATE");
      stats.today_inward = parseInt(resInwToday.rows[0].total || 0);

      const resOutToday = normalizedDept
        ? await pool.query("SELECT COUNT(*) AS total FROM outward_register or_reg JOIN items i ON or_reg.item_id = i.id WHERE or_reg.date = CURRENT_DATE AND i.department = $1", params)
        : await pool.query("SELECT COUNT(*) AS total FROM outward_register WHERE date = CURRENT_DATE");
      stats.today_outward = parseInt(resOutToday.rows[0].total || 0);

      const resInwChart = await pool.query(`
        SELECT to_char(months.month, 'Mon YYYY') AS month, COALESCE(SUM(ir.quantity_received), 0) AS total
        FROM generate_series(date_trunc('month', CURRENT_DATE - INTERVAL '5 months'), date_trunc('month', CURRENT_DATE), '1 month') AS months(month)
        LEFT JOIN inward_register ir ON ir.date >= months.month AND ir.date < months.month + INTERVAL '1 month'
        GROUP BY months.month
        ORDER BY months.month
      `);
      stats.monthly_inward = resInwChart.rows;

      const resOutChart = await pool.query(`
        SELECT to_char(months.month, 'Mon YYYY') AS month, COALESCE(SUM(or_reg.quantity_issued), 0) AS total
        FROM generate_series(date_trunc('month', CURRENT_DATE - INTERVAL '5 months'), date_trunc('month', CURRENT_DATE), '1 month') AS months(month)
        LEFT JOIN outward_register or_reg ON or_reg.date >= months.month AND or_reg.date < months.month + INTERVAL '1 month'
        GROUP BY months.month
        ORDER BY months.month
      `);
      stats.monthly_outward = resOutChart.rows;

      const resCatStock = await pool.query(
        `SELECT COALESCE(c.name, 'Uncategorized') AS category, SUM(i.available_qty) AS total_qty
        FROM items i
        LEFT JOIN categories c ON i.category_id = c.id${normalizedDept ? ' WHERE i.department = $1' : ''}
        GROUP BY c.name
        ORDER BY c.name`,
        params
      );
      stats.category_stock = resCatStock.rows;

      const resDeptVal = await pool.query(
        `SELECT i.department, COALESCE(SUM(i.available_qty * (
          SELECT COALESCE(ir.unit_price, 0) FROM inward_register ir WHERE ir.item_id = i.id ORDER BY ir.created_at DESC, ir.id DESC LIMIT 1
        )), 0) AS total_value
        FROM items i
        WHERE i.department IS NOT NULL${normalizedDept ? ' AND i.department = $1' : ''}
        GROUP BY i.department
        ORDER BY i.department`,
        params
      );
      stats.department_stock_value = resDeptVal.rows;

      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Global Search
  app.get('/api/inventory/search', async (req, res) => {
    try {
      const { q } = req.query;
      if (!q) return res.json([]);

      const term = `%${q}%`;
      const results = [];

      const itemRes = await pool.query(`
        SELECT id, name, item_code, department, rack_number, available_qty, 'Item' as type
        FROM items
        WHERE name ILIKE $1 OR item_code ILIKE $1 OR department ILIKE $1 OR rack_number ILIKE $1
      `, [term]);
      results.push(...itemRes.rows.map(r => ({ ...r, route: 'items' })));

      const catRes = await pool.query(`
        SELECT id, name, department, 'Category' as type
        FROM categories WHERE name ILIKE $1 OR department ILIKE $1
      `, [term]);
      results.push(...catRes.rows.map(r => ({ ...r, route: 'categories' })));

      const inwRes = await pool.query(`
        SELECT ir.id, ir.supplier_name, i.name as item_name, ir.date, 'Inward' as type
        FROM inward_register ir JOIN items i ON ir.item_id = i.id
        WHERE ir.supplier_name ILIKE $1 OR ir.po_no ILIKE $1 OR ir.grn_number ILIKE $1 OR ir.invoice_number ILIKE $1
      `, [term]);
      results.push(...inwRes.rows.map(r => ({ ...r, route: 'inward' })));

      const outRes = await pool.query(`
        SELECT or_reg.id, or_reg.issued_to, i.name as item_name, or_reg.date, 'Outward' as type
        FROM outward_register or_reg JOIN items i ON or_reg.item_id = i.id
        WHERE or_reg.issued_to ILIKE $1 OR or_reg.department ILIKE $1 OR or_reg.issue_slip_number ILIKE $1
      `, [term]);
      results.push(...outRes.rows.map(r => ({ ...r, route: 'outward' })));

      res.json(results);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Reports
  const getReportRows = async (type, queryParams) => {
    const { from, to, department, item_id } = queryParams;
    let query = '';
    let params = [];
    let count = 1;

    const dateFilter = `AND date >= $${count++} AND date <= $${count++}`;

    switch (type) {
      case 'daily_inward':
        query = `SELECT ir.date, i.item_code, i.name, ir.supplier_name, ir.quantity_received, ir.unit_price, ir.total_value 
                 FROM inward_register ir JOIN items i ON ir.item_id = i.id WHERE 1=1 `;
        if (from && to) { query += dateFilter; params.push(from, to); }
        break;
      case 'daily_outward':
        query = `SELECT or_reg.date, i.item_code, i.name, or_reg.issued_to, or_reg.department, or_reg.quantity_issued 
                 FROM outward_register or_reg JOIN items i ON or_reg.item_id = i.id WHERE 1=1 `;
        if (from && to) { query += dateFilter; params.push(from, to); }
        break;
      case 'dead_stock':
        query = `SELECT i.item_code, i.name, i.department, i.available_qty
                 FROM items i
                 WHERE i.available_qty > 0 
                 AND NOT EXISTS (
                   SELECT 1 FROM outward_register or_reg 
                   WHERE or_reg.item_id = i.id AND or_reg.date >= CURRENT_DATE - INTERVAL '90 days'
                 )`;
        break;
      case 'low_stock':
        query = `SELECT item_code, name, department, available_qty, min_stock 
                 FROM items WHERE available_qty <= COALESCE(min_stock, 0)`;
        break;
      case 'stock_valuation':
        query = `SELECT i.item_code, i.name, i.department, i.available_qty,
                 (SELECT COALESCE(ir.unit_price, 0) FROM inward_register ir WHERE ir.item_id = i.id ORDER BY ir.created_at DESC, ir.id DESC LIMIT 1) as latest_price,
                 (i.available_qty * (SELECT COALESCE(ir.unit_price, 0) FROM inward_register ir WHERE ir.item_id = i.id ORDER BY ir.created_at DESC, ir.id DESC LIMIT 1)) as total_value
                 FROM items i WHERE i.available_qty > 0`;
        break;
      case 'item_ledger':
        if (!item_id) throw new Error('item_id required for item ledger');
        query = `
          SELECT 'INWARD' as type, date, serial_no as ref_no, quantity_received as qty_in, 0 as qty_out, supplier_name as details, created_at
          FROM inward_register WHERE item_id = $1
          UNION ALL
          SELECT 'OUTWARD' as type, date, serial_no as ref_no, 0 as qty_in, quantity_issued as qty_out, issued_to as details, created_at
          FROM outward_register WHERE item_id = $1
          ORDER BY created_at ASC
        `;
        params.push(item_id);
        break;
      default:
        throw new Error('Unknown report type');
    }
    const { rows } = await pool.query(query, params);
    return rows;
  };

  app.get('/api/inventory/reports/:type', async (req, res) => {
    try {
      const rows = await getReportRows(req.params.type, req.query);
      res.json(rows);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/inventory/reports/:type/export', async (req, res) => {
    try {
      const rows = await getReportRows(req.params.type, req.query);
      const sheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, req.params.type);
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
}
