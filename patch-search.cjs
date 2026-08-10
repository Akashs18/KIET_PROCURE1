const fs = require('fs');
const path = require('path');

const ejsPath = path.join(__dirname, 'views', 'Inventory.ejs');
let content = fs.readFileSync(ejsPath, 'utf8');

const topbarHTML = `
      <div>
        <div class="topbar-title" id="topbar-title">Dashboard</div>
        <div class="topbar-sub" id="topbar-sub">Overview of operations</div>
      </div>
      
      <!-- Global Search -->
      <div style="flex:1; max-width: 400px; margin: 0 40px; position:relative;">
        <div class="search-wrap" style="width:100%">
          <i class="fas fa-search"></i>
          <input type="text" id="global-search" class="form-control" style="width:100%" placeholder="Global Search (Items, Categories, Suppliers)..." oninput="sr2_globalSearch()">
        </div>
        <div id="global-search-results" class="autocomplete-box"></div>
      </div>
`;

// Replace topbar inner html
content = content.replace(
  `<div>
        <div class="topbar-title" id="topbar-title">Dashboard</div>
        <div class="topbar-sub" id="topbar-sub">Overview of operations</div>
      </div>`,
  topbarHTML
);

const searchJS = `
let globalSearchTimer;
async function sr2_globalSearch() {
  clearTimeout(globalSearchTimer);
  const q = document.getElementById('global-search').value;
  const box = document.getElementById('global-search-results');
  if(!q || q.length < 2) { box.style.display = 'none'; return; }
  
  globalSearchTimer = setTimeout(async () => {
    try {
      const res = await fetch('/api/inventory/search?q=' + encodeURIComponent(q));
      const results = await res.json();
      box.innerHTML = '';
      if(!results.length) {
         box.innerHTML = '<div class="ac-item" style="color:var(--text-3)">No results found.</div>';
      } else {
         results.forEach(r => {
           let title = r.name || r.item_name || r.supplier_name || 'Result';
           let sub = r.type + (r.department ? ' | ' + r.department : '');
           const div = document.createElement('div');
           div.className = 'ac-item';
           div.innerHTML = \`<strong>\${title}</strong><small>\${sub}</small>\`;
           div.onclick = () => {
              document.getElementById('global-search').value = '';
              box.style.display = 'none';
              switchTab('stock-register');
              if(r.type === 'Item') sr2_switchTab('items');
              else if(r.type === 'Category') sr2_switchTab('categories');
              else if(r.type === 'Inward') sr2_switchTab('inward');
           };
           box.appendChild(div);
         });
      }
      box.style.display = 'block';
    } catch(e) { console.error(e); }
  }, 300);
}
document.addEventListener('click', e => {
  const box = document.getElementById('global-search-results');
  if(box && !e.target.closest('#global-search')) box.style.display = 'none';
});
</script>
`;

content = content.replace('</script>', searchJS);

fs.writeFileSync(ejsPath, content);
console.log('Global search added.');
