const fs = require('fs');
const path = require('path');

const ejsPath = path.join(__dirname, 'views', 'Inventory.ejs');
let content = fs.readFileSync(ejsPath, 'utf8');

// 1. Replace stock-register tab content
const srStartStr = '<div class="tab-content" id="stock-register">';
const srEndStr = '</div><!-- /stock-register tab -->';

const newSrHtml = `
  <div class="tab-content" id="stock-register">
    <div class="inner-tabs" style="margin-bottom: 22px;" id="sr2-nav-tabs">
      <div class="inner-tab active" onclick="sr2_switchTab('dashboard', this)"><i class="fas fa-chart-pie"></i> Dashboard</div>
      <div class="inner-tab" onclick="sr2_switchTab('categories', this)"><i class="fas fa-tags"></i> Categories</div>
      <div class="inner-tab" onclick="sr2_switchTab('items', this)"><i class="fas fa-boxes"></i> Items</div>
      <div class="inner-tab" onclick="sr2_switchTab('inward', this)"><i class="fas fa-arrow-down"></i> Inward</div>
      <div class="inner-tab" onclick="sr2_switchTab('outward', this)"><i class="fas fa-arrow-up"></i> Outward</div>
      <div class="inner-tab" onclick="sr2_switchTab('reports', this)"><i class="fas fa-file-excel"></i> Reports</div>
    </div>

    <!-- Dashboard -->
    <div id="sr2-dashboard" class="sr2-tab-content" style="display:block">
      <div class="stats-grid" id="sr2-stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:22px">
        <!-- populated by JS -->
      </div>
      <div class="form-grid fg-2">
         <div class="card"><div class="card-header"><div class="card-title">Category Stock</div></div><div class="card-body"><div class="table-wrap"><table id="sr2-catstock-table"><thead><tr><th>Category</th><th>Total Qty</th></tr></thead><tbody></tbody></table></div></div></div>
         <div class="card"><div class="card-header"><div class="card-title">Dept Value</div></div><div class="card-body"><div class="table-wrap"><table id="sr2-deptval-table"><thead><tr><th>Dept</th><th>Total Value</th></tr></thead><tbody></tbody></table></div></div></div>
      </div>
    </div>

    <!-- Categories -->
    <div id="sr2-categories" class="sr2-tab-content" style="display:none">
       <div class="card">
          <div class="card-header">
             <div class="card-title">Manage Categories</div>
          </div>
          <div class="card-body">
             <form id="sr2-cat-form" class="form-grid fg-3" onsubmit="sr2_addCategory(event)">
                <div class="form-group"><label>Name</label><input type="text" id="sr2-cat-name" class="form-control" required></div>
                <div class="form-group"><label>Department</label>
                  <select id="sr2-cat-dept" class="form-control" required>
                    <option value="EC LAB">EC LAB</option><option value="MECHANICAL">MECHANICAL</option><option value="ELECTRICAL">ELECTRICAL</option>
                  </select>
                </div>
                <div class="form-group" style="display:flex;align-items:flex-end"><button class="btn btn-primary" type="submit">Add Category</button></div>
             </form>
             <div class="table-wrap" style="margin-top:20px">
               <table id="sr2-cat-table"><thead><tr><th>ID</th><th>Name</th><th>Department</th><th>Action</th></tr></thead><tbody></tbody></table>
             </div>
          </div>
       </div>
    </div>

    <!-- Items -->
    <div id="sr2-items" class="sr2-tab-content" style="display:none">
       <div class="card">
          <div class="card-header">
            <div class="card-title">Items Inventory</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <input type="text" id="sr2-items-search" class="form-control" placeholder="Search..." oninput="sr2_loadItems()">
              <select id="sr2-items-dept" class="form-control" onchange="sr2_loadItems()"><option value="">All Depts</option><option value="EC LAB">EC LAB</option><option value="MECHANICAL">MECHANICAL</option><option value="ELECTRICAL">ELECTRICAL</option></select>
              <select id="sr2-items-stock" class="form-control" onchange="sr2_loadItems()"><option value="">All Stock</option><option value="low">Low Stock</option><option value="out">Out of Stock</option></select>
              <button class="btn btn-primary btn-sm" onclick="sr2_openItemModal()"><i class="fas fa-plus"></i> Add Item</button>
            </div>
          </div>
          <div class="table-wrap">
             <table id="sr2-items-table">
               <thead><tr><th>Code</th><th>Name</th><th>Dept</th><th>Category</th><th>Avail Qty</th><th>Min/Max</th><th>Rack/Bin</th><th>Status</th><th>Actions</th></tr></thead>
               <tbody></tbody>
             </table>
          </div>
       </div>
    </div>

    <!-- Inward -->
    <div id="sr2-inward" class="sr2-tab-content" style="display:none">
       <div class="card">
          <div class="card-header"><div class="card-title">Inward Register</div><button class="btn btn-primary btn-sm" onclick="sr2_openInwardModal()"><i class="fas fa-plus"></i> New Inward</button></div>
          <div class="table-wrap">
            <table id="sr2-inward-table"><thead><tr><th>Serial</th><th>Date</th><th>Item</th><th>Supplier</th><th>PO / GRN</th><th>Qty Received</th><th>Unit Price</th><th>Value</th><th>Remarks</th></tr></thead><tbody></tbody></table>
          </div>
       </div>
    </div>

    <!-- Outward -->
    <div id="sr2-outward" class="sr2-tab-content" style="display:none">
       <div class="card">
          <div class="card-header"><div class="card-title">Outward Register</div><button class="btn btn-primary btn-sm" onclick="sr2_openOutwardModal()"><i class="fas fa-plus"></i> New Outward</button></div>
          <div class="table-wrap">
            <table id="sr2-outward-table"><thead><tr><th>Serial</th><th>Date</th><th>Item</th><th>Issued To</th><th>Dept</th><th>Open Bal</th><th>Issued Qty</th><th>Close Bal</th><th>Purpose</th><th>Remarks</th></tr></thead><tbody></tbody></table>
          </div>
       </div>
    </div>

    <!-- Reports -->
    <div id="sr2-reports" class="sr2-tab-content" style="display:none">
       <div class="card">
          <div class="card-header"><div class="card-title">Inventory Reports</div><button class="btn btn-success btn-sm" onclick="sr2_exportReport()"><i class="fas fa-download"></i> Export CSV</button></div>
          <div class="card-body">
            <div class="form-grid fg-4">
              <div class="form-group"><label>Report Type</label>
                <select id="sr2-rep-type" class="form-control">
                  <option value="daily_inward">Daily Inward</option><option value="daily_outward">Daily Outward</option><option value="dead_stock">Dead Stock</option><option value="low_stock">Low Stock</option><option value="stock_valuation">Stock Valuation</option><option value="item_ledger">Item Ledger</option>
                </select>
              </div>
              <div class="form-group"><label>From Date</label><input type="date" id="sr2-rep-from" class="form-control"></div>
              <div class="form-group"><label>To Date</label><input type="date" id="sr2-rep-to" class="form-control"></div>
              <div class="form-group"><label>Item ID (for Ledger)</label><input type="number" id="sr2-rep-item" class="form-control" placeholder="Item ID"></div>
              <div class="form-group"><button class="btn btn-primary" onclick="sr2_generateReport()" style="margin-top:24px"><i class="fas fa-sync"></i> Generate</button></div>
            </div>
          </div>
          <div class="table-wrap" style="margin-top:20px;">
             <table id="sr2-rep-table"><thead><tr><th>Result</th></tr></thead><tbody><tr><td>Select report and generate.</td></tr></tbody></table>
          </div>
       </div>
    </div>

  </div><!-- /stock-register tab -->
`;

const startIndex = content.indexOf(srStartStr);
const endIndex = content.indexOf(srEndStr, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
  content = content.substring(0, startIndex) + newSrHtml + content.substring(endIndex + srEndStr.length);
} else {
  console.log('Could not find stock register tab to replace');
  process.exit(1);
}

// 2. Add modals before script tag
const scriptIndex = content.lastIndexOf('<script>');
const modalsHtml = `
<!-- SR2 MODALS -->
<div class="modal-overlay" id="sr2-item-modal">
  <div class="modal" style="max-width:600px">
    <div class="modal-hd">
      <div class="modal-title" id="sr2-item-modal-title">Add Item</div>
      <button class="modal-close" onclick="sr2_closeModal('sr2-item-modal')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="sr2-item-form" onsubmit="sr2_submitItem(event)">
        <input type="hidden" id="sr2-i-id">
        <div class="form-grid fg-2">
          <div class="form-group"><label>Item Code *</label><input type="text" id="sr2-i-code" class="form-control" required></div>
          <div class="form-group"><label>Name *</label><input type="text" id="sr2-i-name" class="form-control" required></div>
          <div class="form-group"><label>Department</label>
            <select id="sr2-i-dept" class="form-control">
              <option value="EC LAB">EC LAB</option><option value="MECHANICAL">MECHANICAL</option><option value="ELECTRICAL">ELECTRICAL</option>
            </select>
          </div>
          <div class="form-group"><label>Category ID</label><input type="number" id="sr2-i-cat" class="form-control"></div>
          <div class="form-group"><label>Min Stock</label><input type="number" id="sr2-i-min" class="form-control" value="0"></div>
          <div class="form-group"><label>Max Stock</label><input type="number" id="sr2-i-max" class="form-control" value="0"></div>
          <div class="form-group"><label>Rack Number</label><input type="text" id="sr2-i-rack" class="form-control"></div>
          <div class="form-group"><label>Bin Number</label><input type="text" id="sr2-i-bin" class="form-control"></div>
        </div>
        <div class="modal-ft" style="margin-top:20px;padding:0;border-top:none;padding-top:10px">
          <button class="btn btn-primary" type="submit">Save Item</button>
        </div>
      </form>
    </div>
  </div>
</div>

<div class="modal-overlay" id="sr2-inward-modal">
  <div class="modal" style="max-width:600px">
    <div class="modal-hd">
      <div class="modal-title">New Inward Entry</div>
      <button class="modal-close" onclick="sr2_closeModal('sr2-inward-modal')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="sr2-inward-form" onsubmit="sr2_submitInward(event)">
        <div class="form-grid fg-2">
          <div class="form-group"><label>Date *</label><input type="date" id="sr2-inw-date" class="form-control" required></div>
          <div class="form-group"><label>Item ID *</label><input type="number" id="sr2-inw-item" class="form-control" required></div>
          <div class="form-group"><label>Quantity Received *</label><input type="number" id="sr2-inw-qty" class="form-control" min="0.01" step="0.01" required></div>
          <div class="form-group"><label>Unit Price</label><input type="number" id="sr2-inw-price" class="form-control" min="0" step="0.01"></div>
          <div class="form-group"><label>Supplier *</label><input type="text" id="sr2-inw-supplier" class="form-control" required></div>
          <div class="form-group"><label>PO Number</label><input type="text" id="sr2-inw-po" class="form-control"></div>
          <div class="form-group"><label>GRN / Invoice</label><input type="text" id="sr2-inw-grn" class="form-control"></div>
          <div class="form-group"><label>Remarks</label><input type="text" id="sr2-inw-remarks" class="form-control"></div>
        </div>
        <div class="modal-ft" style="margin-top:20px;padding:0;border:top:none;padding-top:10px">
          <button class="btn btn-primary" type="submit">Save Inward</button>
        </div>
      </form>
    </div>
  </div>
</div>

<div class="modal-overlay" id="sr2-outward-modal">
  <div class="modal" style="max-width:600px">
    <div class="modal-hd">
      <div class="modal-title">New Outward Entry</div>
      <button class="modal-close" onclick="sr2_closeModal('sr2-outward-modal')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="sr2-outward-form" onsubmit="sr2_submitOutward(event)">
        <div class="form-grid fg-2">
          <div class="form-group"><label>Date *</label><input type="date" id="sr2-out-date" class="form-control" required></div>
          <div class="form-group"><label>Item ID *</label><input type="number" id="sr2-out-item" class="form-control" required></div>
          <div class="form-group"><label>Quantity Issued *</label><input type="number" id="sr2-out-qty" class="form-control" min="0.01" step="0.01" required></div>
          <div class="form-group"><label>Issued To *</label><input type="text" id="sr2-out-to" class="form-control" required></div>
          <div class="form-group"><label>Department</label><input type="text" id="sr2-out-dept" class="form-control"></div>
          <div class="form-group"><label>Purpose</label><input type="text" id="sr2-out-purpose" class="form-control"></div>
        </div>
        <div class="modal-ft" style="margin-top:20px;padding:0;border:top:none;padding-top:10px">
          <button class="btn btn-primary" type="submit">Save Outward</button>
        </div>
      </form>
    </div>
  </div>
</div>
`;

content = content.substring(0, scriptIndex) + modalsHtml + content.substring(scriptIndex);

// 3. Add JS functions at the end of the script block
const jsCode = `
// ═══════════════════════════════════════════
// SR2 JAVASCRIPT
// ═══════════════════════════════════════════
function sr2_switchTab(tabId, el) {
  document.querySelectorAll('#stock-register .sr2-tab-content').forEach(t => t.style.display = 'none');
  document.querySelectorAll('#sr2-nav-tabs .inner-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('sr2-' + tabId).style.display = 'block';
  if(el) el.classList.add('active');
  
  if (tabId === 'dashboard') sr2_loadDashboard();
  if (tabId === 'categories') sr2_loadCategories();
  if (tabId === 'items') sr2_loadItems();
  if (tabId === 'inward') sr2_loadInward();
  if (tabId === 'outward') sr2_loadOutward();
}

function sr2_closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Dashboard
async function sr2_loadDashboard() {
  try {
    const res = await fetch('/api/inventory/dashboard');
    const d = await res.json();
    document.getElementById('sr2-stats-grid').innerHTML = \`
      <div class="stat-card"><div class="stat-icon si-blue"><i class="fas fa-boxes"></i></div><div><div class="stat-value">\${d.total_items||0}</div><div class="stat-label">Total Items</div></div></div>
      <div class="stat-card"><div class="stat-icon si-green"><i class="fas fa-tags"></i></div><div><div class="stat-value">\${d.total_categories||0}</div><div class="stat-label">Categories</div></div></div>
      <div class="stat-card"><div class="stat-icon si-red"><i class="fas fa-exclamation-triangle"></i></div><div><div class="stat-value">\${d.low_stock||0}</div><div class="stat-label">Low Stock</div></div></div>
      <div class="stat-card"><div class="stat-icon si-amber"><i class="fas fa-rupee-sign"></i></div><div><div class="stat-value">₹\${(d.total_stock_value||0).toFixed(2)}</div><div class="stat-label">Stock Value</div></div></div>
    \`;
    
    document.getElementById('sr2-catstock-table').querySelector('tbody').innerHTML = (d.category_stock||[]).map(r => \`<tr><td>\${r.category}</td><td>\${r.total_qty}</td></tr>\`).join('');
    document.getElementById('sr2-deptval-table').querySelector('tbody').innerHTML = (d.dept_value||[]).map(r => \`<tr><td>\${r.department}</td><td>₹\${parseFloat(r.total_value).toFixed(2)}</td></tr>\`).join('');
  } catch(e) { console.error(e); }
}

// Categories
async function sr2_loadCategories() {
  try {
    const res = await fetch('/api/inventory/categories');
    const d = await res.json();
    document.getElementById('sr2-cat-table').querySelector('tbody').innerHTML = d.map(c => \`<tr><td>\${c.id}</td><td>\${c.name}</td><td>\${c.department}</td><td><button class="btn btn-sm btn-danger" onclick="sr2_delCategory(\${c.id})"><i class="fas fa-trash"></i></button></td></tr>\`).join('');
  } catch(e) { console.error(e); }
}
async function sr2_addCategory(e) {
  e.preventDefault();
  const name = document.getElementById('sr2-cat-name').value;
  const dept = document.getElementById('sr2-cat-dept').value;
  try {
    await fetch('/api/inventory/categories', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name, department:dept}) });
    toast('success','Category Added','');
    e.target.reset();
    sr2_loadCategories();
  } catch(err) { toast('error','Error','Failed to add'); }
}
async function sr2_delCategory(id) {
  if(!confirm('Delete this category?')) return;
  await fetch('/api/inventory/categories/'+id, { method:'DELETE' });
  toast('success','Deleted','');
  sr2_loadCategories();
}

// Items
async function sr2_loadItems() {
  try {
    const s = document.getElementById('sr2-items-search').value;
    const d = document.getElementById('sr2-items-dept').value;
    const st = document.getElementById('sr2-items-stock').value;
    const res = await fetch(\`/api/inventory/items?search=\${s}&department=\${d}&stock_filter=\${st}\`);
    const items = await res.json();
    document.getElementById('sr2-items-table').querySelector('tbody').innerHTML = items.map(i => {
      const isLow = parseFloat(i.available_qty) <= parseFloat(i.min_stock);
      const isOut = parseFloat(i.available_qty) <= 0;
      const stat = isOut ? '<span class="badge bd-red">Out of Stock</span>' : isLow ? '<span class="badge bd-amber">Low Stock</span>' : '<span class="badge bd-green">In Stock</span>';
      return \`<tr>
        <td>\${i.item_code}</td><td>\${i.name} (ID: \${i.id})</td><td>\${i.department||'-'}</td><td>\${i.category_name||'-'}</td>
        <td style="font-weight:bold">\${i.available_qty}</td><td>\${i.min_stock} / \${i.max_stock}</td><td>\${i.rack_number||'-'} / \${i.bin_number||'-'}</td>
        <td>\${stat}</td>
        <td><button class="btn btn-sm btn-secondary" onclick="sr2_editItem(\${i.id}, '\${i.item_code}', '\${i.name}', '\${i.department}', '\${i.category_id}', '\${i.min_stock}', '\${i.max_stock}', '\${i.rack_number}', '\${i.bin_number}')">Edit</button></td>
      </tr>\`;
    }).join('');
  } catch(e) { console.error(e); }
}

function sr2_openItemModal() {
  document.getElementById('sr2-item-form').reset();
  document.getElementById('sr2-i-id').value = '';
  document.getElementById('sr2-item-modal-title').textContent = 'Add Item';
  document.getElementById('sr2-item-modal').classList.add('open');
}
function sr2_editItem(id, code, name, dept, cat, min, max, rack, bin) {
  document.getElementById('sr2-i-id').value = id;
  document.getElementById('sr2-i-code').value = code !== 'null' ? code : '';
  document.getElementById('sr2-i-name').value = name;
  document.getElementById('sr2-i-dept').value = dept !== 'null' ? dept : 'EC LAB';
  document.getElementById('sr2-i-cat').value = cat !== 'null' ? cat : '';
  document.getElementById('sr2-i-min').value = min;
  document.getElementById('sr2-i-max').value = max;
  document.getElementById('sr2-i-rack').value = rack !== 'null' ? rack : '';
  document.getElementById('sr2-i-bin').value = bin !== 'null' ? bin : '';
  document.getElementById('sr2-item-modal-title').textContent = 'Edit Item';
  document.getElementById('sr2-item-modal').classList.add('open');
}
async function sr2_submitItem(e) {
  e.preventDefault();
  const id = document.getElementById('sr2-i-id').value;
  const payload = {
    item_code: document.getElementById('sr2-i-code').value,
    name: document.getElementById('sr2-i-name').value,
    department: document.getElementById('sr2-i-dept').value,
    category_id: document.getElementById('sr2-i-cat').value || null,
    min_stock: document.getElementById('sr2-i-min').value || 0,
    max_stock: document.getElementById('sr2-i-max').value || 0,
    rack_number: document.getElementById('sr2-i-rack').value,
    bin_number: document.getElementById('sr2-i-bin').value
  };
  try {
    const url = id ? '/api/inventory/items/extended/'+id : '/api/inventory/items/extended';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    if(!res.ok) throw new Error(await res.text());
    toast('success','Saved successfully');
    sr2_closeModal('sr2-item-modal');
    sr2_loadItems();
  } catch(err) { toast('error','Error', err.message); }
}

// Inward
async function sr2_loadInward() {
  try {
    const res = await fetch('/api/inventory/inward');
    const d = await res.json();
    document.getElementById('sr2-inward-table').querySelector('tbody').innerHTML = d.map(r => \`<tr>
      <td>\${r.serial_no}</td><td>\${r.date.substring(0,10)}</td><td>\${r.item_name} (\${r.item_code})</td>
      <td>\${r.supplier_name}</td><td>\${r.po_no||'-'} / \${r.grn_number||'-'}</td>
      <td style="font-weight:bold;color:var(--green)">+\${r.quantity_received}</td><td>₹\${r.unit_price}</td><td>₹\${r.total_value}</td>
      <td>\${r.remarks||'-'}</td>
    </tr>\`).join('');
  } catch(e) { console.error(e); }
}
function sr2_openInwardModal() {
  document.getElementById('sr2-inward-form').reset();
  document.getElementById('sr2-inw-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('sr2-inward-modal').classList.add('open');
}
async function sr2_submitInward(e) {
  e.preventDefault();
  const payload = {
    date: document.getElementById('sr2-inw-date').value,
    item_id: document.getElementById('sr2-inw-item').value,
    quantity_received: document.getElementById('sr2-inw-qty').value,
    unit_price: document.getElementById('sr2-inw-price').value,
    supplier_name: document.getElementById('sr2-inw-supplier').value,
    po_no: document.getElementById('sr2-inw-po').value,
    grn_number: document.getElementById('sr2-inw-grn').value,
    remarks: document.getElementById('sr2-inw-remarks').value
  };
  try {
    const res = await fetch('/api/inventory/inward', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    if(!res.ok) throw new Error(await res.text());
    toast('success','Inward Recorded');
    sr2_closeModal('sr2-inward-modal');
    sr2_loadInward();
  } catch(err) { toast('error','Error', err.message); }
}

// Outward
async function sr2_loadOutward() {
  try {
    const res = await fetch('/api/inventory/outward');
    const d = await res.json();
    document.getElementById('sr2-outward-table').querySelector('tbody').innerHTML = d.map(r => \`<tr>
      <td>\${r.serial_no}</td><td>\${r.date.substring(0,10)}</td><td>\${r.item_name} (\${r.item_code})</td>
      <td>\${r.issued_to}</td><td>\${r.department||'-'}</td>
      <td>\${r.opening_balance}</td><td style="font-weight:bold;color:var(--red)">-\${r.quantity_issued}</td><td>\${r.closing_balance}</td>
      <td>\${r.purpose||'-'}</td><td>\${r.remarks||'-'}</td>
    </tr>\`).join('');
  } catch(e) { console.error(e); }
}
function sr2_openOutwardModal() {
  document.getElementById('sr2-outward-form').reset();
  document.getElementById('sr2-out-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('sr2-outward-modal').classList.add('open');
}
async function sr2_submitOutward(e) {
  e.preventDefault();
  const payload = {
    date: document.getElementById('sr2-out-date').value,
    item_id: document.getElementById('sr2-out-item').value,
    quantity_issued: document.getElementById('sr2-out-qty').value,
    issued_to: document.getElementById('sr2-out-to').value,
    department: document.getElementById('sr2-out-dept').value,
    purpose: document.getElementById('sr2-out-purpose').value
  };
  try {
    const res = await fetch('/api/inventory/outward', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    if(!res.ok) throw new Error(await res.text());
    toast('success','Outward Recorded');
    sr2_closeModal('sr2-outward-modal');
    sr2_loadOutward();
  } catch(err) { toast('error','Error', err.message); }
}

// Reports
let currentReportData = [];
async function sr2_generateReport() {
  const type = document.getElementById('sr2-rep-type').value;
  const from = document.getElementById('sr2-rep-from').value;
  const to = document.getElementById('sr2-rep-to').value;
  const item_id = document.getElementById('sr2-rep-item').value;
  try {
    const res = await fetch(\`/api/inventory/reports/\${type}?from=\${from}&to=\${to}&item_id=\${item_id}\`);
    if(!res.ok) throw new Error(await res.text());
    currentReportData = await res.json();
    
    if(!currentReportData.length) {
       document.getElementById('sr2-rep-table').innerHTML = '<thead><tr><th>Result</th></tr></thead><tbody><tr><td>No data found.</td></tr></tbody>';
       return;
    }
    
    // Auto-generate table headers based on keys
    const keys = Object.keys(currentReportData[0]);
    const thead = '<thead><tr>' + keys.map(k=>\`<th>\${k.toUpperCase().replace(/_/g,' ')}</th>\`).join('') + '</tr></thead>';
    const tbody = '<tbody>' + currentReportData.map(r => '<tr>' + keys.map(k => \`<td>\${r[k] !== null ? r[k] : '-'}</td>\`).join('') + '</tr>').join('') + '</tbody>';
    document.getElementById('sr2-rep-table').innerHTML = thead + tbody;
    
  } catch(err) { toast('error','Error', err.message); }
}

function sr2_exportReport() {
  if(!currentReportData || !currentReportData.length) return toast('error','No data to export');
  const keys = Object.keys(currentReportData[0]);
  let csv = keys.join(',') + '\\n';
  currentReportData.forEach(row => {
    csv += keys.map(k => {
      let val = row[k] === null ? '' : row[k].toString();
      return \`"\${val.replace(/"/g,'""')}"\`;
    }).join(',') + '\\n';
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
  a.download = \`inventory_report_\${document.getElementById('sr2-rep-type').value}.csv\`;
  a.click();
}
</script>
`;

const endScriptIndex = content.lastIndexOf('</script>');
content = content.substring(0, endScriptIndex) + jsCode + content.substring(endScriptIndex);

fs.writeFileSync(ejsPath, content);
console.log('Successfully patched Inventory.ejs');
