const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001/api'
  : '/api';

const USERS = [
  { name: 'Chansa Mwape', role: 'Requestor', email: 'chansa.mwape@copperbeltmining.co.zm', dept: 'Chaisa' },
  { name: 'Mutale Chilufya', role: '1st Approver', email: 'mutale.chilufya@copperbeltmining.co.zm', dept: 'Mumba' },
  { name: 'Kondwelani Banda', role: '2nd Approver', email: 'kondwelani.banda@copperbeltmining.co.zm', dept: 'Mpika' },
  { name: 'Sibongile Phiri', role: '3rd Approver', email: 'sibongile.phiri@copperbeltmining.co.zm', dept: 'Mpika' },
  { name: 'Mwansa Kabwe', role: 'Final Approver', email: 'mwansa.kabwe@copperbeltmining.co.zm', dept: 'Chaisa' },
  { name: 'Bwalya Tembo', role: 'Treasurer', email: 'bwalya.tembo@copperbeltmining.co.zm', dept: 'Mumba' }
];

const STATUS_FLOW = {
  'Admin': ['Pending','1st Approver stage','2nd Approver Stage','3rd Approver Stage','Final Approver','Pending Disbursement','Issued','Change Returned/Pending','Change Cleared'],
  'Shop Use': ['Pending','1st Approver stage','Final Approver','Pending Disbursement','Issued','Change Returned/Pending','Change Cleared']
};

const STATUS_ACTOR_MAP = {
  'Pending': '1st Approver','1st Approver stage': '2nd Approver','2nd Approver Stage': '3rd Approver',
  '3rd Approver Stage': 'Final Approver','Final Approver': 'Treasurer','Pending Disbursement': 'Treasurer',
  'Issued': 'Requestor','Change Returned/Pending': 'Treasurer','Change Cleared': 'Treasurer'
};

let state = {
  token: localStorage.getItem('cmes_token') || null,
  currentUser: null,
  requisitions: [],
  emails: [],
  currentView: 'dashboard',
  queueFilter: 'all',
  selectedRequisition: null
};

// --- API Client ---
async function apiFetch(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (state.token) opts.headers['Authorization'] = `Bearer ${state.token}`;
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// --- Auth ---
async function login(email, password) {
  const data = await apiFetch('POST', '/auth/login', { email, password });
  state.token = data.token;
  localStorage.setItem('cmes_token', data.token);
  state.currentUser = data.user;
  return data.user;
}

function updateUserDisplay() {
  const u = state.currentUser;
  if (!u) return;
  document.getElementById('active-user-badge').textContent = u.role;
  document.getElementById('dash-username').textContent = u.name;
  document.getElementById('dash-role').textContent = u.role;
}

function logout() {
  state.token = null;
  state.currentUser = null;
  localStorage.removeItem('cmes_token');
  localStorage.removeItem('cmes_user');
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

function isAuthenticated() {
  return !!state.token;
}

// --- Init ---
async function init() {
  document.getElementById('login-form').addEventListener('submit', handleLoginSubmit);
  await loadUserFromToken();
  if (!isAuthenticated()) {
    document.getElementById('login-screen').style.display = 'flex';
    return;
  }

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';
  updateUserDisplay();

  setupEventListeners();
  await loadInitialData();
  document.getElementById('nav-admin').style.display = state.currentUser.role === 'Admin' ? '' : 'none';
  document.getElementById('nav-audit').style.display = state.currentUser.role === 'Admin' ? '' : 'none';
  switchView('dashboard');
}

async function loadUserFromToken() {
  const storedToken = localStorage.getItem('cmes_token');
  if (!storedToken) return;
  state.token = storedToken;
  const storedUser = localStorage.getItem('cmes_user');
  if (storedUser) {
    state.currentUser = JSON.parse(storedUser);
  }
  try {
    const data = await apiFetch('GET', '/auth/profile');
    state.currentUser = data.user;
    localStorage.setItem('cmes_user', JSON.stringify(data.user));
  } catch {
    state.token = null;
    localStorage.removeItem('cmes_token');
    localStorage.removeItem('cmes_user');
  }
}

async function loadInitialData() {
  try {
    const [reqData, emailData] = await Promise.all([
      apiFetch('GET', '/requisitions'),
      apiFetch('GET', '/emails')
    ]);
    state.requisitions = reqData.requisitions;
    state.emails = emailData.emails;
  } catch (err) {
    showToastNotification('Failed to load data: ' + err.message);
  }
}

function setupEventListeners() {
  document.getElementById('user-role-select').addEventListener('change', (e) => switchUser(parseInt(e.target.value)));
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      const view = el.dataset.view;
      if (view) switchView(view);
    });
  });
  document.getElementById('req-type').addEventListener('change', renderApprovalFlow);
  document.getElementById('req-currency').addEventListener('change', updateCurrencyDisplay);
  const menuBtn = document.getElementById('mobile-menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      document.querySelector('aside').classList.toggle('mobile-open');
    });
    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelector('aside').classList.remove('mobile-open');
      });
    });
  }
  document.getElementById('sidebar-collapse-btn').addEventListener('click', () => {
    const aside = document.querySelector('aside');
    if (window.innerWidth <= 768) return;
    aside.classList.toggle('collapsed');
    localStorage.setItem('sidebar_collapsed', aside.classList.contains('collapsed'));
  });
  if (window.innerWidth > 768 && localStorage.getItem('sidebar_collapsed') === 'true') {
    document.querySelector('aside').classList.add('collapsed');
  }
}

// --- Login Handler ---
async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  try {
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    await login(email, password);

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
    localStorage.setItem('cmes_user', JSON.stringify(state.currentUser));
    updateUserDisplay();

    setupEventListeners();
    await loadInitialData();
    document.getElementById('nav-admin').style.display = state.currentUser.role === 'Admin' ? '' : 'none';
    document.getElementById('nav-audit').style.display = state.currentUser.role === 'Admin' ? '' : 'none';
    switchView('dashboard');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

// --- User Switching (for role simulation) ---
function switchUser(userIndex) {
  const user = USERS[userIndex];
  if (!user) return;
  state.currentUser = { ...state.currentUser, name: user.name, role: user.role, department: user.dept };
  updateUserDisplay();
  const adminNav = document.getElementById('nav-admin');
  if (adminNav) adminNav.style.display = state.currentUser.role === 'Admin' ? '' : 'none';
  const auditNav = document.getElementById('nav-audit');
  if (auditNav) auditNav.style.display = state.currentUser.role === 'Admin' ? '' : 'none';

  renderDashboard();
  renderQueue();
}

// --- View Controller ---
function switchView(viewName) {
  state.currentView = viewName;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.view-panel').forEach(el => el.classList.remove('active'));

  if (viewName !== 'create-requisition') {
    state._resubmitReq = null;
  }

  if (viewName === 'dashboard') {
    document.getElementById('nav-dashboard').classList.add('active');
    document.getElementById('view-dashboard').classList.add('active');
    renderDashboard();
  } else if (viewName === 'create-requisition') {
    document.getElementById('nav-new-req').classList.add('active');
    document.getElementById('view-create-requisition').classList.add('active');
    if (state.currentUser.role !== 'Requestor') {
      document.getElementById('create-req-blocked').style.display = 'block';
      document.getElementById('new-req-form').style.display = 'none';
    } else {
      document.getElementById('create-req-blocked').style.display = 'none';
      document.getElementById('new-req-form').style.display = 'block';
      if (!state._resubmitReq) {
        clearForm();
        document.querySelector('#view-create-requisition .view-title-block p').textContent = 'Create purchases or shop expenses for copper, drills, tools, PPE, or administrative items.';
      }
      renderApprovalFlow();
    }
  } else if (viewName === 'requisition-queue') {
    document.getElementById('nav-requisitions').classList.add('active');
    document.getElementById('view-requisition-queue').classList.add('active');
    renderQueue();
  } else if (viewName === 'admin-panel') {
    document.getElementById('nav-admin').classList.add('active');
    document.getElementById('view-admin-panel').classList.add('active');
    renderAdminPanel();
  } else if (viewName === 'audit-trail') {
    document.getElementById('nav-audit').classList.add('active');
    document.getElementById('view-audit-trail').classList.add('active');
    renderAuditTrail();
  }
}

// --- Dashboard ---
function renderDashboard() {
  let totalZmw = 0, countZmw = 0, totalUsd = 0, countUsd = 0, finalClearedCount = 0;

  state.requisitions.forEach(r => {
    const amt = parseFloat(r.total_amount);
    if (r.currency === 'ZMW') { totalZmw += amt; countZmw++; }
    else { totalUsd += amt; countUsd++; }
    if (r.status === 'Change Cleared' || r.status === 'Issued') finalClearedCount++;
  });

  document.getElementById('stat-total-value-zmw').textContent = `K${totalZmw.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  document.getElementById('stat-total-count-zmw').textContent = `${countZmw} Requisition${countZmw !== 1 ? 's' : ''}`;
  document.getElementById('stat-total-value-usd').textContent = `$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  document.getElementById('stat-total-count-usd').textContent = `${countUsd} Requisition${countUsd !== 1 ? 's' : ''}`;

  const completionPercent = state.requisitions.length ? Math.round((finalClearedCount / state.requisitions.length) * 100) : 0;
  document.getElementById('stat-approved-percent').textContent = `${completionPercent}%`;
  document.getElementById('stat-approved-count').textContent = `${finalClearedCount} Settled / Completed`;

  const pendingActions = getActionItemsForUser();
  document.getElementById('stat-pending-action-count').textContent = pendingActions.length;
  document.getElementById('stat-action-footer').textContent = pendingActions.length === 1
    ? '1 requisition requires action' : `${pendingActions.length} requisitions require action`;

  const actionListEl = document.getElementById('dash-action-list');
  if (pendingActions.length === 0) {
    actionListEl.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-secondary);background:var(--bg-secondary);border-radius:12px;border:1px dashed var(--border-color);">
      <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:36px;height:36px;stroke:var(--text-muted);fill:none;margin-bottom:8px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
      <p style="font-size:0.85rem;font-weight:600;">No pending action items for your role.</p></div>`;
  } else {
    actionListEl.innerHTML = pendingActions.map(r => renderRequisitionCardHTML(r)).join('');
  }

  renderCategoryChart();
}

function getActionItemsForUser() {
  const userRole = state.currentUser ? state.currentUser.role : '';
  return state.requisitions.filter(r => {
    if (r.status === 'Rejected' || r.status === 'Change Cleared') return false;
    const activeRequiredRole = STATUS_ACTOR_MAP[r.status];
    if (!activeRequiredRole) return false;
    if (r.status === '1st Approver stage' && r.type === 'Shop Use') return userRole === 'Final Approver';
    if (activeRequiredRole === userRole) {
      if (r.status === 'Issued' && userRole === 'Requestor') return r.requestor_name === state.currentUser.name;
      return true;
    }
    if (r.status === 'Pending' && userRole === '1st Approver') return true;
    return false;
  });
}

function renderRequisitionCardHTML(req) {
  const symbol = req.currency === 'ZMW' ? 'K' : '$';
  const displayAmt = `${symbol}${parseFloat(req.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  let statusClass = 'status-pending';
  if (req.status === '1st Approver stage') statusClass = 'status-approver1';
  else if (req.status === '2nd Approver Stage') statusClass = 'status-approver2';
  else if (req.status === '3rd Approver Stage') statusClass = 'status-approver3';
  else if (req.status === 'Final Approver') statusClass = 'status-final';
  else if (req.status === 'Pending Disbursement') statusClass = 'status-disbursement';
  else if (req.status === 'Issued') statusClass = 'status-issued';
  else if (req.status === 'Change Returned/Pending') statusClass = 'status-change-pending';
  else if (req.status === 'Change Cleared') statusClass = 'status-change-cleared';
  else if (req.status === 'Rejected') statusClass = 'status-rejected';

  const itemsText = req.items && req.items.length > 0
    ? req.items.length === 1 ? req.items[0].description : `${req.items[0].description} + ${req.items.length - 1} more items`
    : 'No items';

  return `<div class="requisition-card" onclick="window.openDetails('${req.req_id}')">
    <div><div class="card-top"><span class="req-id">${req.req_id}</span><span class="req-type-badge ${req.type.toLowerCase() === 'admin' ? 'admin' : 'shop'}">${req.type}</span></div>
    <div class="card-title">${req.title}</div>
    <p style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${itemsText}</p></div>
    <div><div class="card-details"><span>By: ${req.requestor_name}</span><span>${req.created_at ? req.created_at.split('T')[0] : ''}</span></div>
    <div class="card-amount-block"><span class="status-badge ${statusClass}">${req.status === 'Pending' ? 'Pending (1st Review)' : req.status}</span>
    <span class="card-amount">${displayAmt}</span></div></div></div>`;
}

function renderCategoryChart() {
  const categoryTotals = {};
  let overallTotalUsd = 0;
  state.requisitions.forEach(r => {
    const multiplier = r.currency === 'USD' ? 1 : 1 / 26;
    (r.items || []).forEach(it => {
      const cat = it.category || 'Office Admin';
      const usdVal = parseFloat(it.total_price || it.totalPrice) * multiplier;
      categoryTotals[cat] = (categoryTotals[cat] || 0) + usdVal;
      overallTotalUsd += usdVal;
    });
  });

  const categories = ['Heavy Equipment', 'Drills & Tools', 'Safety Wear (PPE)', 'Consumables', 'Office Admin'];
  const colors = { 'Heavy Equipment': '#E37622','Drills & Tools': '#3B82F6','Safety Wear (PPE)': '#10B981','Consumables': '#A78BFA','Office Admin': '#5A7FA8' };
  const svg = document.getElementById('pie-chart-svg');
  const legend = document.getElementById('pie-chart-legend');

  if (overallTotalUsd === 0) {
    svg.innerHTML = '<circle cx="18" cy="18" r="15.915" fill="transparent" stroke="var(--border-color)" stroke-width="4"></circle>';
    legend.innerHTML = '<p style="font-size:0.75rem;color:var(--text-muted);">No records available.</p>';
    return;
  }

  let cumulativePercent = 0, svgContent = '', legendContent = '';
  svgContent += '<circle cx="18" cy="18" r="15.915" fill="transparent" stroke="rgba(30,41,59,0.5)" stroke-width="4"></circle>';

  categories.forEach(cat => {
    const value = categoryTotals[cat] || 0;
    if (value === 0) return;
    const percent = (value / overallTotalUsd) * 100;
    svgContent += `<circle cx="18" cy="18" r="15.915" fill="transparent" stroke="${colors[cat]}" stroke-width="4.2" stroke-dasharray="${percent} ${100-percent}" stroke-dashoffset="${100-cumulativePercent}"><title>${cat}: ${Math.round(percent)}%</title></circle>`;
    cumulativePercent += percent;
    legendContent += `<div class="legend-item"><div class="legend-color" style="background-color:${colors[cat]}"></div><span><strong>${cat}</strong> (${Math.round(percent)}%)</span></div>`;
  });

  svg.innerHTML = svgContent;
  legend.innerHTML = legendContent;
}

// --- Queue ---
function renderQueue() {
  const container = document.getElementById('requisitions-queue-list');
  let filtered = [...state.requisitions];

  const search = (document.getElementById('queue-search-input')?.value || '').toLowerCase().trim();
  if (state._lastQueueSearch !== search) {
    state._lastQueueSearch = search;
    state._queuePage = 1;
  }

  if (state.queueFilter === 'pending') {
    filtered = getActionItemsForUser();
  } else if (state.queueFilter === 'my') {
    filtered = state.requisitions.filter(r => r.requestor_name === (state.currentUser ? state.currentUser.name : ''));
  }

  if (search) {
    filtered = filtered.filter(r =>
      (r.req_id && r.req_id.toLowerCase().includes(search)) ||
      (r.title && r.title.toLowerCase().includes(search)) ||
      (r.requestor_name && r.requestor_name.toLowerCase().includes(search))
    );
  }

  const STATUS_ORDER = ['Pending','1st Approver stage','2nd Approver Stage','3rd Approver Stage','Final Approver','Pending Disbursement','Issued','Change Returned/Pending','Change Cleared','Rejected'];
  filtered.sort((a, b) => {
    const aIdx = STATUS_ORDER.indexOf(a.status);
    const bIdx = STATUS_ORDER.indexOf(b.status);
    if (aIdx !== bIdx) return aIdx - bIdx;
    return b.req_id.localeCompare(a.req_id);
  });

  const PER_PAGE = 12;
  const page = state._queuePage || 1;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  state._queuePage = currentPage;
  const start = (currentPage - 1) * PER_PAGE;
  const pageItems = filtered.slice(start, start + PER_PAGE);

  if (filtered.length === 0) {
    container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--text-secondary);background:var(--bg-card);border-radius:18px;border:1px dashed var(--border-color);">
      <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:48px;height:48px;stroke:var(--text-muted);fill:none;margin-bottom:12px;"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>
      <p style="font-size:1rem;font-weight:700;">No requisitions found</p></div>`;
  } else {
    container.innerHTML = pageItems.map(r => renderRequisitionCardHTML(r)).join('');
  }

  const paginationEl = document.getElementById('queue-pagination');
  if (totalPages <= 1) {
    paginationEl.innerHTML = '';
  } else {
    let html = '';
    html += `<button onclick="window.goQueuePage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>&laquo; Prev</button>`;
    let lastShown = 0;
    for (let p = 1; p <= totalPages; p++) {
      if (p === currentPage || p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2) {
        if (lastShown && p - lastShown > 1) html += `<span class="page-info">...</span>`;
        html += `<button class="${p === currentPage ? 'active-page' : ''}" onclick="window.goQueuePage(${p})">${p}</button>`;
        lastShown = p;
      }
    }
    html += `<button onclick="window.goQueuePage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>Next &raquo;</button>`;
    paginationEl.innerHTML = html;
  }
}

function goQueuePage(page) {
  state._queuePage = page;
  renderQueue();
}

function changeQueueFilter(filterType) {
  state.queueFilter = filterType;
  state._queuePage = 1;
  document.querySelectorAll('.filter-tab').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${filterType}`).classList.add('active');
  renderQueue();
}

// --- Form ---
function getCurrencySymbol() {
  const el = document.getElementById('req-currency');
  return el && el.value === 'USD' ? '$' : 'K';
}

function updateCurrencyDisplay() {
  const sym = getCurrencySymbol();
  document.querySelectorAll('.item-row').forEach(row => {
    const hint = row.querySelector('.item-currency-hint');
    if (hint) hint.textContent = sym;
    const sub = row.querySelector('.item-subtotal');
    if (sub) {
      const num = parseFloat(sub.value.replace(/[^0-9.]/g, '')) || 0;
      sub.value = `${sym}${num.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }
  });
  calculateFormTotal();
}

function addFormItemRow() {
  const container = document.getElementById('items-rows-container');
  const symbol = getCurrencySymbol();
  const rowId = `item_row_${Date.now()}`;
  container.insertAdjacentHTML('beforeend', `<div class="item-row" id="${rowId}">
    <div class="form-group"><div class="item-row-header">Description</div>
      <input type="text" class="item-desc" required placeholder="e.g. Komatsu seal rings"></div>
    <div class="form-group"><div class="item-row-header">Category</div>
      <select class="item-cat" required>
        <option value="Heavy Equipment">Heavy Equipment</option><option value="Drills & Tools">Drills & Tools</option>
        <option value="Safety Wear (PPE)">Safety Wear (PPE)</option><option value="Consumables" selected>Consumables</option>
        <option value="Office Admin">Office Admin</option>
      </select></div>
    <div class="form-group"><div class="item-row-header">Qty</div>
      <input type="number" class="item-qty" min="1" value="1" required oninput="window.calculateRowSubtotal('${rowId}')"></div>
    <div class="form-group"><div class="item-row-header">Unit Price</div>
      <div style="display:flex;align-items:center;position:relative;">
        <span class="item-currency-hint" style="position:absolute;left:10px;font-size:0.8rem;color:var(--text-secondary);">${symbol}</span>
        <input type="number" class="item-price" min="0.01" step="0.01" value="0.00" required style="padding-left:24px;" oninput="window.calculateRowSubtotal('${rowId}')"></div></div>
    <div class="form-group"><div class="item-row-header">Subtotal</div>
      <input type="text" class="item-subtotal" value="${symbol}0.00" disabled style="background-color:transparent;border:none;font-weight:700;width:90px;"></div>
    <button type="button" class="btn-icon-danger" onclick="window.removeFormItemRow('${rowId}')" title="Delete Row">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
    </button></div>`);
}

window.calculateRowSubtotal = function(rowId) {
  const row = document.getElementById(rowId);
  const qty = parseInt(row.querySelector('.item-qty').value) || 0;
  const price = parseFloat(row.querySelector('.item-price').value) || 0;
  const sym = getCurrencySymbol();
  row.querySelector('.item-subtotal').value = `${sym}${(qty * price).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  calculateFormTotal();
};

function calculateFormTotal() {
  let total = 0;
  document.querySelectorAll('.item-row').forEach(row => {
    const qty = parseInt(row.querySelector('.item-qty').value) || 0;
    const price = parseFloat(row.querySelector('.item-price').value) || 0;
    total += qty * price;
  });
  const sym = getCurrencySymbol();
  document.getElementById('form-calculated-total').textContent = `${sym}${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function removeFormItemRow(rowId) {
  const container = document.getElementById('items-rows-container');
  if (container.children.length <= 1) { alert('Requisition must have at least one line item.'); return; }
  document.getElementById(rowId).remove();
  calculateFormTotal();
}

function clearForm() {
  document.getElementById('new-req-form').reset();
  document.getElementById('items-rows-container').innerHTML = '';
  addFormItemRow();
  calculateFormTotal();
}

// --- Resubmit Rejected ---
window.resubmitRequisition = function() {
  const req = state._resubmitReq;
  if (!req) return;

  const items = req.items || [];

  document.getElementById('req-title').value = req.title;
  document.getElementById('req-type').value = req.type;
  document.getElementById('req-department').value = req.department || '';
  document.getElementById('req-currency').value = req.currency;

  const container = document.getElementById('items-rows-container');
  container.innerHTML = '';
  const symbol = req.currency === 'ZMW' ? 'K' : '$';

  items.forEach(it => {
    const rowId = `item_row_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    container.insertAdjacentHTML('beforeend', `<div class="item-row" id="${rowId}">
      <div class="form-group"><div class="item-row-header">Description</div>
        <input type="text" class="item-desc" required value="${escHtml(it.description || it.desc || '')}"></div>
      <div class="form-group"><div class="item-row-header">Category</div>
        <select class="item-cat" required>
          <option value="Heavy Equipment" ${(it.category||'')==='Heavy Equipment'?'selected':''}>Heavy Equipment</option>
          <option value="Drills & Tools" ${(it.category||'')==='Drills & Tools'?'selected':''}>Drills & Tools</option>
          <option value="Safety Wear (PPE)" ${(it.category||'')==='Safety Wear (PPE)'?'selected':''}>Safety Wear (PPE)</option>
          <option value="Consumables" ${(it.category||'')==='Consumables'?'selected':''}>Consumables</option>
          <option value="Office Admin" ${(it.category||'')==='Office Admin'?'selected':''}>Office Admin</option>
        </select></div>
      <div class="form-group"><div class="item-row-header">Qty</div>
        <input type="number" class="item-qty" min="1" value="${it.quantity || 1}" required oninput="window.calculateRowSubtotal('${rowId}')"></div>
      <div class="form-group"><div class="item-row-header">Unit Price</div>
        <div style="display:flex;align-items:center;position:relative;">
          <span class="item-currency-hint" style="position:absolute;left:10px;font-size:0.8rem;color:var(--text-secondary);">${symbol}</span>
          <input type="number" class="item-price" min="0.01" step="0.01" value="${it.unit_price || it.unitPrice || 0}" required style="padding-left:24px;" oninput="window.calculateRowSubtotal('${rowId}')"></div></div>
      <div class="form-group"><div class="item-row-header">Subtotal</div>
        <input type="text" class="item-subtotal" value="${symbol}${((it.quantity||0)*(it.unit_price||it.unitPrice||0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}" disabled style="background-color:transparent;border:none;font-weight:700;width:90px;"></div>
      <button type="button" class="btn-icon-danger" onclick="window.removeFormItemRow('${rowId}')" title="Delete Row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button></div>`);
  });

  calculateFormTotal();
  state.currentView = 'create-requisition';
  closeDetailsModal();
  document.querySelector('#view-create-requisition .view-title-block p').textContent = `Resubmitting: ${req.req_id} — modify the details below and submit.`;
  showToastNotification(`Editing resubmission of ${req.req_id} — modify and submit when ready`);
  switchView('create-requisition');
};

async function handleFormSubmit(e) {
  e.preventDefault();
  if (!state.currentUser || state.currentUser.role !== 'Requestor') {
    alert('Only users with the Requestor role can initiate new requisitions.');
    return;
  }

  const isResubmit = !!state._resubmitReq;
  const items = [];
  let totalAmount = 0;
  document.querySelectorAll('.item-row').forEach(row => {
    const description = row.querySelector('.item-desc').value;
    const category = row.querySelector('.item-cat').value;
    const quantity = parseInt(row.querySelector('.item-qty').value);
    const unitPrice = parseFloat(row.querySelector('.item-price').value);
    const totalPrice = quantity * unitPrice;
    totalAmount += totalPrice;
    items.push({ description, category, quantity, unitPrice });
  });

  try {
    const data = await apiFetch('POST', '/requisitions', {
      type: document.getElementById('req-type').value,
      title: document.getElementById('req-title').value,
      department: document.getElementById('req-department').value,
      currency: document.getElementById('req-currency').value,
      items
    });

    showToastNotification(data.message || 'Requisition submitted successfully!');
    document.getElementById('new-req-form').reset();
    document.getElementById('items-rows-container').innerHTML = '';
    addFormItemRow();
    calculateFormTotal();
    state._resubmitReq = null;
    await loadInitialData();
    switchView('requisition-queue');
  } catch (err) {
    alert('Failed to create requisition: ' + err.message);
  }
}

// --- Details Modal ---
async function openDetails(reqId) {
  try {
    const data = await apiFetch('GET', `/requisitions/${reqId}`);
    const req = data.requisition;
    state.selectedRequisition = req;

    document.getElementById('detail-req-id').textContent = req.req_id;
    document.getElementById('detail-req-title').textContent = req.title;
    const typeBadge = document.getElementById('detail-req-type');
    typeBadge.textContent = req.type;
    typeBadge.className = `req-type-badge ${req.type.toLowerCase() === 'admin' ? 'admin' : 'shop'}`;
    document.getElementById('detail-requestor').textContent = req.requestor_name;
    document.getElementById('detail-dept').textContent = req.department;
    document.getElementById('detail-date').textContent = req.created_at ? req.created_at.split('T')[0] : '';
    document.getElementById('detail-currency').textContent = req.currency;

    const tbody = document.getElementById('detail-items-tbody');
    const symbol = req.currency === 'ZMW' ? 'K' : '$';
    tbody.innerHTML = (req.items || []).map(it => `<tr>
      <td>${it.description}</td>
      <td><span style="font-size:0.75rem;background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px;color:var(--text-secondary);">${it.category}</span></td>
      <td style="text-align:right;">${it.quantity}</td>
      <td style="text-align:right;">${symbol}${parseFloat(it.unit_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td style="text-align:right;font-weight:600;">${symbol}${parseFloat(it.total_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
    </tr>`).join('');
    tbody.insertAdjacentHTML('beforeend', `<tr class="modal-table-total-row"><td colspan="3"></td><td style="text-align:right;color:var(--text-secondary);">Grand Total:</td>
      <td style="text-align:right;color:var(--copper-light);">${symbol}${parseFloat(req.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>`);

    const banner = document.getElementById('detail-rejection-banner');
    if (req.status === 'Rejected') {
      banner.style.display = 'flex';
      document.getElementById('detail-rejection-reason').textContent = req.rejection_reason || 'No reason provided.';
    } else { banner.style.display = 'none'; }

    renderModalActionsPanel(req);
    renderStepper(req);
    renderSignatures(req);
    document.getElementById('requisition-details-modal').classList.add('active');
  } catch (err) {
    showToastNotification('Failed to load details: ' + err.message);
  }
}

function closeDetailsModal() {
  document.getElementById('requisition-details-modal').classList.remove('active');
  state.selectedRequisition = null;
  hideRejectionReasonBox();
  renderDashboard();
  renderQueue();
}

function renderModalActionsPanel(req) {
  const actionsPanel = document.getElementById('detail-actions-panel');
  const appBlock = document.getElementById('approver-actions-block');
  const tDisburseBlock = document.getElementById('treasurer-actions-block');
  const tClearBlock = document.getElementById('treasurer-clearance-block');
  const reqReceiptsBlock = document.getElementById('requestor-receipts-block');
  const reqResubmitBlock = document.getElementById('requestor-resubmit-block');

  actionsPanel.style.display = 'none';
  appBlock.style.display = 'none';
  tDisburseBlock.style.display = 'none';
  tClearBlock.style.display = 'none';
  reqReceiptsBlock.style.display = 'none';
  reqResubmitBlock.style.display = 'none';

  if (req.status === 'Rejected') {
    if (state.currentUser && req.requestor_id === state.currentUser.id) {
      actionsPanel.style.display = 'block';
      reqResubmitBlock.style.display = 'block';
      state._resubmitReq = req;
    }
    return;
  }

  if (req.status === 'Change Cleared') return;

  const userRole = state.currentUser ? state.currentUser.role : '';
  const activeRequiredRole = STATUS_ACTOR_MAP[req.status];
  let showPanel = false;

  if (req.status === '1st Approver stage' && req.type === 'Shop Use' && userRole === 'Final Approver') {
    showPanel = true; appBlock.style.display = 'block';
  } else if (activeRequiredRole && activeRequiredRole === userRole) {
    showPanel = true;
    if (userRole === 'Treasurer') {
      if (req.status === 'Final Approver' || req.status === 'Pending Disbursement') tDisburseBlock.style.display = 'block';
      else if (req.status === 'Change Returned/Pending') tClearBlock.style.display = 'block';
    } else if (userRole === 'Requestor') {
      if (req.status === 'Issued') reqReceiptsBlock.style.display = 'block';
      else showPanel = false;
    } else {
      appBlock.style.display = 'block';
    }
  }
  if (req.status === 'Pending' && userRole === '1st Approver') {
    showPanel = true; appBlock.style.display = 'block';
  }
  if (showPanel) actionsPanel.style.display = 'block';

  const disburseBtn = tDisburseBlock ? tDisburseBlock.querySelector('.btn-approve') : null;
  if (disburseBtn) {
    if (req.status === 'Final Approver') {
      disburseBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg> Queue & Process for Disbursement`;
      disburseBtn.onclick = processTreasurerQueue;
    } else if (req.status === 'Pending Disbursement') {
      disburseBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12" y2="6"></line></svg> Disburse Funds & Mark Issued`;
      disburseBtn.onclick = processTreasurerDisburse;
    }
  }
}

function renderStepper(req) {
  const stepperEl = document.getElementById('detail-stepper');
  const flow = STATUS_FLOW[req.type];
  let currentStatusIndex = flow.indexOf(req.status);
  let isRejected = req.status === 'Rejected';
  let rejectedStageIndex = -1;

  if (isRejected) {
    const history = req.history || [];
    const lastHist = history[history.length - 1];
    rejectedStageIndex = flow.indexOf(lastHist ? lastHist.stage : '');
    currentStatusIndex = rejectedStageIndex;
  }

  let stepperHtml = '';
  flow.forEach((stage, idx) => {
    let statusClass = 'stepper-node';
    let statusText = '';
    if (idx < currentStatusIndex) {
      statusClass += ' completed';
      const history = req.history || [];
      const hist = history.find(h => h.stage === stage && ['Approved','Queued for Disbursement','Disbursed','Expenses Submitted','Cleared'].includes(h.action));
      statusText = hist ? `Completed by ${hist.user_name || ''} at ${hist.timestamp ? hist.timestamp.split('T')[1]?.substring(0,5) : ''}` : 'Completed';
    } else if (idx === currentStatusIndex) {
      if (isRejected) {
        statusClass += ' rejected-node';
        const history = req.history || [];
        const hist = history[history.length - 1];
        statusText = `Rejected by ${hist ? hist.user_name : ''}: "${hist ? (hist.reason || '') : ''}"`;
      } else { statusClass += ' active-stage'; statusText = 'Awaiting action'; }
    }
    let label = stage;
    if (stage === 'Pending') label = 'Created (Pending)';
    else if (stage === 'Final Approver') label = 'Final Approver Clearance';
    else if (stage === 'Pending Disbursement') label = 'Treasurer Disbursement';
    else if (stage === 'Change Returned/Pending') label = 'Receipts & Change Filing';
    else if (stage === 'Change Cleared') label = 'Reconciled & Closed';
    stepperHtml += `<li class="${statusClass}"><span class="stepper-label">${label}</span><span class="stepper-time">${statusText}</span></li>`;
  });
  stepperEl.innerHTML = stepperHtml;
}

function renderSignatures(req) {
  const grid = document.getElementById('detail-signatures-grid');
  const stamps = (req.history || []).filter(h => h.signature && h.action === 'Approved');
  if (stamps.length === 0) {
    grid.innerHTML = '<p style="font-size:0.75rem;color:var(--text-muted);font-style:italic;">No digital approvals appended yet.</p>';
    return;
  }
  grid.innerHTML = stamps.map((st, idx) => {
    const cardId = `sig_card_${idx}`;
    const qrData = JSON.stringify({
      id: req.req_id,
      signer: st.user_name,
      role: st.user_role,
      stage: st.stage,
      time: st.timestamp ? st.timestamp.split('.')[0].replace('T', ' ') : '',
      sig: st.signature
    });
    setTimeout(() => drawQRCode(cardId, qrData), 50);
    return `<div class="signature-stamp-card" id="sig_card_wrapper_${idx}" onclick="window.viewSignatureVerification('${escapeStr(qrData)}')">
      <div class="signature-stamp-qr" id="${cardId}"></div>
      <div class="signature-stamp-details"><span class="sig-name">${st.user_name}</span><span class="sig-role">${st.user_role}</span>
      <span class="sig-time">${st.timestamp ? st.timestamp.split('.')[0].replace('T', ' ') : ''}</span></div></div>`;
  }).join('');
}

function escapeStr(str) {
  if (!str) return '{}';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function drawQRCode(elementId, text) {
  const container = document.getElementById(elementId);
  if (!container) return;
  container.innerHTML = '';
  if (window.QRCode) {
    try { new QRCode(container, { text, width: 50, height: 50, colorDark: '#0F172A', colorLight: '#FFFFFF', correctLevel: QRCode.CorrectLevel.H }); return; }
    catch (e) { console.warn('QRCode JS error, falling back', e); }
  }
  const canvas = document.createElement('canvas');
  canvas.width = 50; canvas.height = 50;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 50, 50);
  ctx.fillStyle = '#060D1A';
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = text.charCodeAt(i) + ((hash << 5) - hash);
  drawQRAnchor(ctx, 2, 2); drawQRAnchor(ctx, 38, 2); drawQRAnchor(ctx, 2, 38);
  for (let x = 2; x < 48; x += 3) {
    for (let y = 2; y < 48; y += 3) {
      if ((x < 14 && y < 14) || (x > 34 && y < 14) || (x < 14 && y > 34)) continue;
      const val = Math.sin(hash + (x * 7) + (y * 13)) * 10000;
      if ((val - Math.floor(val)) > 0.45) ctx.fillRect(x, y, 3, 3);
    }
  }
  container.appendChild(canvas);
}

function drawQRAnchor(ctx, x, y) {
  ctx.fillRect(x, y, 10, 10);
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x + 2, y + 2, 6, 6);
  ctx.fillStyle = '#060D1A'; ctx.fillRect(x + 3, y + 3, 4, 4);
}

// --- Action Processors ---
function showRejectionReasonBox() { document.getElementById('rejection-reason-container').classList.add('active'); }
function hideRejectionReasonBox() {
  document.getElementById('rejection-reason-container').classList.remove('active');
  const t = document.getElementById('reject-reason');
  if (t) t.value = '';
}

async function processApproval(approve) {
  const req = state.selectedRequisition;
  if (!req) return;
  if (!approve) {
    const reason = document.getElementById('reject-reason').value.trim();
    if (!reason) { alert('A reason is required to reject this requisition.'); return; }
    try {
      const data = await apiFetch('POST', `/requisitions/${req.req_id}/approve`, { action: 'reject', reason });
      showToastNotification(data.message || `Requisition ${req.req_id} rejected.`);
      closeDetailsModal();
      await loadInitialData();
    } catch (err) { alert('Rejection failed: ' + err.message); }
  } else {
    try {
      const data = await apiFetch('POST', `/requisitions/${req.req_id}/approve`, { action: 'approve' });
      showToastNotification(data.message || `Requisition ${req.req_id} approved!`);
      if (data.signature) {
        showToastNotification('Cryptographic signature appended to approval.');
      }
      closeDetailsModal();
      await loadInitialData();
    } catch (err) { alert('Approval failed: ' + err.message); }
  }
}

async function processTreasurerQueue() {
  const req = state.selectedRequisition;
  if (!req) return;
  try {
    const data = await apiFetch('POST', `/requisitions/${req.req_id}/queue-disbursement`);
    showToastNotification(data.message || 'Queued for disbursement.');
    closeDetailsModal();
    await loadInitialData();
  } catch (err) { alert('Failed: ' + err.message); }
}

async function processTreasurerDisburse() {
  const req = state.selectedRequisition;
  if (!req) return;
  try {
    const data = await apiFetch('POST', `/requisitions/${req.req_id}/disburse`);
    showToastNotification(data.message || 'Funds disbursed.');
    closeDetailsModal();
    await loadInitialData();
  } catch (err) { alert('Failed: ' + err.message); }
}

async function processRequestorSubmitReceipts() {
  const req = state.selectedRequisition;
  if (!req) return;
  const notes = prompt('Enter Returned Cash Change Details / Receipt Notes:', 'Receipts submitted for all items. K250.00 change returned.');
  try {
    const data = await apiFetch('POST', `/requisitions/${req.req_id}/submit-receipts`, { notes: notes || 'Receipts submitted' });
    showToastNotification(data.message || 'Expenses filed.');
    closeDetailsModal();
    await loadInitialData();
  } catch (err) { alert('Failed: ' + err.message); }
}

async function processTreasurerClear() {
  const req = state.selectedRequisition;
  if (!req) return;
  try {
    const data = await apiFetch('POST', `/requisitions/${req.req_id}/clear`);
    showToastNotification(data.message || 'Requisition cleared.');
    closeDetailsModal();
    await loadInitialData();
  } catch (err) { alert('Failed: ' + err.message); }
}

// --- Email Drawer ---
function toggleEmailDrawer() {
  const drawer = document.getElementById('email-simulator-drawer');
  drawer.classList.toggle('active');
  if (drawer.classList.contains('active')) renderEmailList();
}

function renderEmailList() {
  const container = document.getElementById('email-list-container');
  if (state.emails.length === 0) {
    container.innerHTML = `<div class="email-empty-state"><svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg><p>Your Simulation Inbox is empty.</p></div>`;
    return;
  }
  container.innerHTML = state.emails.map(em => `<div class="email-card" style="opacity:${em.read ? '0.7' : '1'}">
    <div class="email-meta"><span>From: <strong>${em.from_address}</strong></span><span>To: <strong>${em.recipient_name} (${em.to_address})</strong></span>
    <span>Time: ${em.timestamp ? em.timestamp.split('.')[0].replace('T', ' ') : ''}</span></div>
    <div class="email-subject">${em.subject}</div><div class="email-body">${em.body}</div>
    <button class="email-btn" onclick="window.actOnEmail('${em.id}','${em.req_id}','${em.target_role}')">Log In & Process Request</button></div>`).join('');
}

window.actOnEmail = async function(emailId, reqId, targetRole) {
  try { await apiFetch('PATCH', `/emails/${emailId}/read`); } catch {}
  const matchIdx = USERS.findIndex(u => u.role === targetRole);
  if (matchIdx !== -1) {
    document.getElementById('user-role-select').value = matchIdx;
    switchUser(matchIdx);
  }
  toggleEmailDrawer();
  openDetails(reqId);
};

// --- QR Verification ---
async function viewSignatureVerification(qrDataString) {
  if (!qrDataString || qrDataString === '{}') return;
  try {
    const data = await apiFetch('POST', '/requisitions/verify-qr', { qrData: qrDataString });
    if (data.valid) {
      document.getElementById('verify-req-id').textContent = data.payload.id || 'N/A';
      document.getElementById('verify-signer').textContent = data.payload.signer || 'N/A';
      document.getElementById('verify-role').textContent = data.payload.role || 'N/A';
      document.getElementById('verify-stage').textContent = data.payload.stage || 'N/A';
      document.getElementById('verify-time').textContent = data.payload.time || 'N/A';
      document.getElementById('verify-hash').textContent = `ecdsa-sha384:${data.signature ? data.signature.substring(0, 20) + '...' : 'N/A'}`;
    } else {
      document.getElementById('verify-req-id').textContent = 'VERIFICATION FAILED';
      document.getElementById('verify-signer').textContent = 'INVALID';
      document.getElementById('verify-role').textContent = 'INVALID';
      document.getElementById('verify-stage').textContent = 'INVALID';
      document.getElementById('verify-time').textContent = 'INVALID';
      document.getElementById('verify-hash').textContent = `Error: ${data.error || 'Signature mismatch'}`;
    }
    document.getElementById('qr-verification-modal').classList.add('active');
  } catch (err) {
    showToastNotification('Verification failed: ' + err.message);
  }
}

function closeVerificationModal() { document.getElementById('qr-verification-modal').classList.remove('active'); }

// --- Toast ---
function showToastNotification(message) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);background-color:var(--bg-card);border:1px solid var(--copper-light);color:var(--text-primary);padding:12px 24px;border-radius:10px;box-shadow:0 10px 25px rgba(0,0,0,0.5);z-index:9999;font-size:0.85rem;font-weight:600;display:flex;align-items:center;gap:10px;opacity:0;transition:all 0.3s cubic-bezier(0.175,0.885,0.32,1.275)';
  toast.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>${message}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(0)'; }, 50);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(-50%) translateY(20px)'; setTimeout(() => toast.remove(), 300); }, 4000);
}

function renderApprovalFlow() {
  const typeEl = document.getElementById('req-type');
  const container = document.getElementById('approval-flow-steps');
  if (!typeEl || !container) return;
  const flow = STATUS_FLOW[typeEl.value];
  if (!flow) { container.innerHTML = ''; return; }
  const labels = {
    'Pending': 'Created',
    '1st Approver stage': '1st Approval',
    '2nd Approver Stage': '2nd Approval',
    '3rd Approver Stage': '3rd Approval',
    'Final Approver': 'Final Approval',
    'Pending Disbursement': 'Disburse',
    'Issued': 'Issued',
    'Change Returned/Pending': 'Receipts',
    'Change Cleared': 'Cleared'
  };
  const ROLE_INITIALS = {
    '1st Approver': '1A','2nd Approver': '2A','3rd Approver': '3A',
    'Final Approver': 'FA','Treasurer': 'T','Requestor': 'CR'
  };
  container.innerHTML = flow.map((stage, i) => {
    const actor = STATUS_ACTOR_MAP[stage];
    const initials = ROLE_INITIALS[actor] || (actor ? actor.charAt(0) : '?');
    const step = `<span class="approval-flow-step"><span class="approval-avatar" data-role="${actor || ''}">${initials}</span><span>${labels[stage] || stage}</span></span>`;
    const arrow = i < flow.length - 1 ? `<span class="approval-flow-arrow">\u25B6</span>` : '';
    return step + arrow;
  }).join('');
}

// --- Admin Panel ---
async function renderAdminPanel() {
  try {
    const [statsRes, usersRes, reqsRes] = await Promise.all([
      apiFetch('GET', '/admin/stats'),
      apiFetch('GET', '/admin/users'),
      apiFetch('GET', '/admin/requisitions')
    ]);

    const stats = statsRes.stats;
    document.getElementById('admin-stat-users').textContent = stats.totalUsers;
    document.getElementById('admin-stat-requisitions').textContent = stats.totalRequisitions;
    const pendingCount = stats.byStatus.filter(s => !['Change Cleared', 'Rejected'].includes(s.status)).reduce((a, s) => a + parseInt(s.count), 0);
    const closedCount = stats.byStatus.filter(s => ['Change Cleared', 'Rejected'].includes(s.status)).reduce((a, s) => a + parseInt(s.count), 0);
    document.getElementById('admin-stat-pending').textContent = pendingCount;
    document.getElementById('admin-stat-closed').textContent = closedCount;

    renderAdminRequisitions(reqsRes.requisitions);
    renderAdminUsers(usersRes.users);
  } catch (err) {
    showToastNotification('Failed to load admin data: ' + err.message);
  }

  document.getElementById('admin-req-search').oninput = debounce(adminFetchRequisitions, 300);
  document.getElementById('admin-req-status-filter').onchange = adminFetchRequisitions;
  document.getElementById('admin-req-refresh').onclick = adminFetchRequisitions;
  document.getElementById('admin-add-user-btn').onclick = () => openAdminUserModal();
  document.getElementById('admin-download-csv').onclick = downloadCsvReport;
  document.getElementById('admin-download-pdf').onclick = downloadPdfReport;
}

function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

async function adminFetchRequisitions() {
  const search = document.getElementById('admin-req-search').value;
  const status = document.getElementById('admin-req-status-filter').value;
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  try {
    const res = await apiFetch('GET', '/admin/requisitions?' + params.toString());
    renderAdminRequisitions(res.requisitions);
  } catch (err) {
    showToastNotification('Search failed: ' + err.message);
  }
}

function renderAdminRequisitions(requisitions) {
  const container = document.getElementById('admin-req-list');
  if (requisitions.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);">No requisitions found.</div>';
    return;
  }
  container.innerHTML = requisitions.map(r => {
    const badge = r.status === 'Rejected' ? 'badge-rejected' : r.status === 'Change Cleared' ? 'badge-cleared' : 'badge-pending';
    return `<div class="admin-req-card">
      <div class="req-info">
        <h4>${r.req_id} - ${escHtml(r.title)}</h4>
        <p>${escHtml(r.requestor_name)} &middot; ${r.type} &middot; ${r.currency === 'ZMW' ? 'K' : '$'}${parseFloat(r.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <span class="status-badge ${badge}">${r.status}</span>
        <button class="action-btn-sm" onclick="window.openDetails('${r.req_id}')">View</button>
      </div>
    </div>`;
  }).join('');
}

function renderAdminUsers(users) {
  state._adminUsers = users;
  const container = document.getElementById('admin-user-list');
  container.innerHTML = `<table class="admin-user-table">
    <thead><tr>
      <th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Created</th><th>Actions</th>
    </tr></thead>
    <tbody>${users.map(u => `<tr>
      <td style="color:var(--text-muted);font-size:0.75rem;">${u.id}</td>
      <td style="font-weight:500;">${escHtml(u.name)}</td>
      <td style="font-size:0.75rem;color:var(--text-secondary);">${escHtml(u.email)}</td>
      <td><span class="status-badge badge-pending" style="font-size:0.7rem;">${escHtml(u.role)}</span></td>
      <td style="font-size:0.75rem;color:var(--text-secondary);">${escHtml(u.department || '-')}</td>
      <td style="font-size:0.75rem;color:var(--text-secondary);">${new Date(u.created_at).toLocaleDateString()}</td>
      <td><div class="admin-user-actions">
        <button onclick="window.openAdminUserModal(${u.id})">Edit</button>
        <button onclick="window.adminResetPassword(${u.id})">Reset PW</button>
        <button class="admin-delete-btn" onclick="window.adminDeleteUser(${u.id}, '${escHtml(u.name)}')">Delete</button>
      </div></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

let editingUserId = null;

function openAdminUserModal(userId) {
  editingUserId = userId || null;
  const titleEl = document.getElementById('admin-user-modal-title');
  const submitBtn = document.getElementById('admin-user-submit-btn');
  const nameEl = document.getElementById('admin-user-name');
  const emailEl = document.getElementById('admin-user-email');
  const roleEl = document.getElementById('admin-user-role');
  const deptEl = document.getElementById('admin-user-dept');
  const pwGroup = document.getElementById('admin-password-group');
  const pwEl = document.getElementById('admin-user-password');

  if (userId) {
    titleEl.textContent = 'Edit User';
    submitBtn.textContent = 'Update';
    pwGroup.style.display = 'none';
    pwEl.required = false;
    const user = state._adminUsers ? state._adminUsers.find(u => u.id === userId) : null;
    if (user) {
      nameEl.value = user.name;
      emailEl.value = user.email;
      roleEl.value = user.role;
      deptEl.value = user.department || '';
    }
  } else {
    titleEl.textContent = 'Add User';
    submitBtn.textContent = 'Save';
    pwGroup.style.display = 'block';
    pwEl.required = true;
    nameEl.value = '';
    emailEl.value = '';
    roleEl.value = 'Requestor';
    deptEl.value = '';
    pwEl.value = '';
  }

  document.getElementById('admin-user-form').onsubmit = handleAdminUserSubmit;
  document.getElementById('admin-user-modal').classList.add('active');
}

function closeAdminUserModal() {
  document.getElementById('admin-user-modal').classList.remove('active');
  editingUserId = null;
}

async function handleAdminUserSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('admin-user-name').value;
  const email = document.getElementById('admin-user-email').value;
  const role = document.getElementById('admin-user-role').value;
  const dept = document.getElementById('admin-user-dept').value;
  const password = document.getElementById('admin-user-password').value;
  const btn = document.getElementById('admin-user-submit-btn');

  try {
    btn.disabled = true;
    btn.textContent = 'Saving...';

    if (editingUserId) {
      await apiFetch('PUT', '/admin/users/' + editingUserId, { name, email, role, department: dept });
      showToastNotification('User updated successfully');
    } else {
      await apiFetch('POST', '/admin/users', { name, email, role, department: dept, password });
      showToastNotification('User created successfully');
    }

    closeAdminUserModal();
    renderAdminPanel();
  } catch (err) {
    showToastNotification('Error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = editingUserId ? 'Update' : 'Save';
  }
}

async function adminResetPassword(userId) {
  const newPw = prompt('Enter new password (min 6 characters):');
  if (!newPw || newPw.length < 6) return;
  try {
    await apiFetch('POST', '/admin/users/' + userId + '/reset-password', { password: newPw });
    showToastNotification('Password reset successfully');
  } catch (err) {
    showToastNotification('Error: ' + err.message);
  }
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

async function downloadCsvReport() {
  const btn = document.getElementById('admin-download-csv');
  try {
    btn.disabled = true;
    btn.textContent = 'Downloading...';
    const res = await fetch(`${API_BASE}/admin/report`, {
      headers: state.token ? { 'Authorization': `Bearer ${state.token}` } : {}
    });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cmes-requisitions-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToastNotification('CSV report downloaded');
  } catch (err) {
    showToastNotification('Error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;fill:none;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> CSV Report';
  }
}

async function downloadPdfReport() {
  const btn = document.getElementById('admin-download-pdf');
  try {
    btn.disabled = true;
    btn.textContent = 'Generating PDF...';
    const res = await fetch(`${API_BASE}/admin/report`, {
      headers: state.token ? { 'Authorization': `Bearer ${state.token}` } : {}
    });
    if (!res.ok) throw new Error('Failed to fetch report data');
    const text = await res.text();
    const lines = text.split('\n').filter(Boolean);
    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, ''));
    const data = lines.slice(1).map(line => {
      const vals = [];
      let cur = '', inQuotes = false;
      for (const ch of line) {
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (ch === ',' && !inQuotes) { vals.push(cur.replace(/""/g, '"')); cur = ''; continue; }
        cur += ch;
      }
      vals.push(cur.replace(/""/g, '"'));
      return vals;
    });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(16);
    doc.text('EazyTools Zambia Requisitions Report', 14, 18);
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 24);
    doc.text(`Sorted by Branch/Department & Status`, 14, 29);

    doc.autoTable({
      head: [headers],
      body: data,
      startY: 34,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [227, 118, 34], fontSize: 7, halign: 'center' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { top: 34 }
    });

    const dateStr = new Date().toISOString().split('T')[0];
    doc.save(`cmes-requisitions-report-${dateStr}.pdf`);
    showToastNotification('PDF report downloaded');
  } catch (err) {
    showToastNotification('Error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;fill:none;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg> PDF Report';
  }
}

// --- Globals for HTML onclick ---
window.switchView = switchView;
window.changeQueueFilter = changeQueueFilter;
window.goQueuePage = goQueuePage;
window.toggleEmailDrawer = toggleEmailDrawer;
window.addFormItemRow = addFormItemRow;
window.removeFormItemRow = removeFormItemRow;
window.handleFormSubmit = handleFormSubmit;
window.closeDetailsModal = closeDetailsModal;
window.openDetails = openDetails;
window.processApproval = processApproval;
window.showRejectionReasonBox = showRejectionReasonBox;
window.hideRejectionReasonBox = hideRejectionReasonBox;
window.processTreasurerQueue = processTreasurerQueue;
window.processTreasurerDisburse = processTreasurerDisburse;
window.processTreasurerClear = processTreasurerClear;
window.processRequestorSubmitReceipts = processRequestorSubmitReceipts;
window.closeVerificationModal = closeVerificationModal;
window.viewSignatureVerification = viewSignatureVerification;
window.logout = logout;
window.renderApprovalFlow = renderApprovalFlow;
window.openAdminUserModal = openAdminUserModal;
window.closeAdminUserModal = closeAdminUserModal;
window.adminResetPassword = adminResetPassword;
window.adminDeleteUser = adminDeleteUser;
window.renderAuditTrail = renderAuditTrail;

// --- Audit Trail ---
async function renderAuditTrail() {
  const container = document.getElementById('audit-log-list');
  try {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);">Loading...</div>';
    const res = await apiFetch('GET', '/admin/audit-logs?limit=200');
    const logs = res.logs;
    if (!logs || logs.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);">No audit entries found.</div>';
      return;
    }
    container.innerHTML = `<table class="admin-user-table">
      <thead><tr>
        <th>Date/Time</th><th>User</th><th>Role</th><th>Action</th><th>Entity</th><th>Details</th>
      </tr></thead>
      <tbody>${logs.map(l => `<tr>
        <td style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">${new Date(l.created_at).toLocaleString()}</td>
        <td style="font-weight:500;">${escHtml(l.user_name)}</td>
        <td><span class="status-badge badge-pending" style="font-size:0.7rem;">${escHtml(l.user_role)}</span></td>
        <td><span class="audit-action-badge">${escHtml(l.action)}</span></td>
        <td style="font-size:0.75rem;color:var(--text-secondary);">${l.entity_type ? escHtml(l.entity_type) + (l.entity_id ? ' #' + escHtml(l.entity_id) : '') : '-'}</td>
        <td style="font-size:0.75rem;color:var(--text-secondary);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(l.details || '')}">${escHtml(l.details || '-')}</td>
      </tr>`).join('')}</tbody>
    </table>
    <div style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.75rem;">${res.total} total entries (showing latest ${logs.length})</div>`;
  } catch (err) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--ruby);">Failed to load audit trail: ' + err.message + '</div>';
  }
}

// --- Delete User ---
async function adminDeleteUser(userId, userName) {
  if (!confirm(`Are you sure you want to permanently delete user "${userName}"?\n\nThis action cannot be undone.`)) return;
  try {
    await apiFetch('DELETE', '/admin/users/' + userId);
    showToastNotification(`User "${userName}" deleted successfully`);
    renderAdminPanel();
  } catch (err) {
    showToastNotification('Error: ' + err.message);
  }
}

// Start
document.addEventListener('DOMContentLoaded', init);
