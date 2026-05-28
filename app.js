// ── Supabase 設定 ──────────────────────────────────────────
const SUPABASE_URL = 'https://hquzchzcoygnmninemvp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxdXpjaHpjb3lnbm1uaW5lbXZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNzIwMjQsImV4cCI6MjA5NDc0ODAyNH0.igTevzpprg0W_tb3FgcVt5gILcONWMG1jYAW_p7GhYk';
const TABLE = 'decision_entries';

// ── State ──────────────────────────────────────────────────
let entries = [];
let currentFilter = 'all';
let selectedOutcome = 'pending';
let editingId = null;

// ── Supabase helpers ───────────────────────────────────────
async function sb(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || res.statusText);
  }
  return res.status === 204 ? null : res.json();
}

async function loadEntries() {
  const data = await sb('GET', `${TABLE}?select=*&order=created_at.desc`);
  entries = data || [];
}

async function createEntry(entry) {
  const data = await sb('POST', TABLE, entry);
  return data[0];
}

async function updateEntry(id, entry) {
  await sb('PATCH', `${TABLE}?id=eq.${id}`, entry);
}

async function deleteEntryById(id) {
  await sb('DELETE', `${TABLE}?id=eq.${id}`);
}

// ── Filter ─────────────────────────────────────────────────
function setFilter(f, el) {
  currentFilter = f;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderEntries();
}

function filteredEntries() {
  if (currentFilter === 'all') return entries;
  if (currentFilter.startsWith('cat:')) {
    const cat = currentFilter.slice(4);
    return entries.filter(e => e.category === cat);
  }
  return entries.filter(e => e.outcome === currentFilter);
}

// ── Modal ──────────────────────────────────────────────────
function openModal(id) {
  editingId = id || null;
  const modal = document.getElementById('modal');
  const title = document.getElementById('modal-title');

  if (id) {
    const e = entries.find(x => x.id === id);
    if (!e) return;
    title.textContent = '編輯記錄';
    document.getElementById('f-title').value = e.title || '';
    document.getElementById('f-cat').value = e.category || '產品';
    document.getElementById('f-hypothesis').value = e.hypothesis || '';
    document.getElementById('f-result').value = e.result || '';
    document.getElementById('f-reflection').value = e.reflection || '';
    selectOutcome(e.outcome || 'pending');
  } else {
    title.textContent = '新增決策記錄';
    clearForm();
  }

  modal.classList.add('open');
  setTimeout(() => document.getElementById('f-title').focus(), 100);
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  clearForm();
  editingId = null;
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('modal')) closeModal();
}

function clearForm() {
  ['f-title', 'f-hypothesis', 'f-result', 'f-reflection'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-cat').value = '產品';
  selectOutcome('pending');
}

function selectOutcome(v) {
  selectedOutcome = v;
  document.querySelectorAll('.outcome-option').forEach(b => {
    b.classList.toggle('sel', b.dataset.v === v);
  });
}

async function saveEntry() {
  const title = document.getElementById('f-title').value.trim();
  if (!title) {
    document.getElementById('f-title').focus();
    showToast('請填入決策標題');
    return;
  }

  const btn = document.getElementById('save-btn');
  btn.textContent = '儲存中...';
  btn.disabled = true;

  const payload = {
    title,
    category: document.getElementById('f-cat').value,
    hypothesis: document.getElementById('f-hypothesis').value.trim(),
    result: document.getElementById('f-result').value.trim(),
    outcome: selectedOutcome,
    reflection: document.getElementById('f-reflection').value.trim(),
  };

  try {
    if (editingId) {
      await updateEntry(editingId, payload);
      const idx = entries.findIndex(e => e.id === editingId);
      if (idx >= 0) entries[idx] = { ...entries[idx], ...payload };
      showToast('已更新');
    } else {
      const created = await createEntry(payload);
      entries.unshift(created);
      showToast('已儲存');
    }
    closeModal();
    renderAll();
  } catch (err) {
    showToast('儲存失敗：' + err.message);
  } finally {
    btn.textContent = '儲存';
    btn.disabled = false;
  }
}

async function deleteEntry(id) {
  if (!confirm('確定要刪除這筆記錄？')) return;
  try {
    await deleteEntryById(id);
    entries = entries.filter(e => e.id !== id);
    renderAll();
    showToast('已刪除');
  } catch (err) {
    showToast('刪除失敗：' + err.message);
  }
}

// ── Render ─────────────────────────────────────────────────
const OUTCOME_META = {
  success: { label: '✓ 成功', cls: 'success' },
  fail:    { label: '✗ 失敗', cls: 'fail' },
  pivot:   { label: '↻ 轉向', cls: 'pivot' },
  pending: { label: '⏳ 待觀察', cls: 'pending' },
};

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

function renderStats() {
  document.getElementById('stat-total').textContent = entries.length;
  document.getElementById('stat-success').textContent = entries.filter(e => e.outcome === 'success').length;
  document.getElementById('stat-fail').textContent = entries.filter(e => e.outcome === 'fail').length;
  document.getElementById('stat-pivot').textContent = entries.filter(e => e.outcome === 'pivot').length;

  document.getElementById('cnt-all').textContent = entries.length;
  document.getElementById('cnt-success').textContent = entries.filter(e => e.outcome === 'success').length;
  document.getElementById('cnt-fail').textContent = entries.filter(e => e.outcome === 'fail').length;
  document.getElementById('cnt-pivot').textContent = entries.filter(e => e.outcome === 'pivot').length;
  document.getElementById('cnt-pending').textContent = entries.filter(e => e.outcome === 'pending').length;

  const total = entries.length;
  document.getElementById('page-sub').textContent = total ? `共 ${total} 筆決策記錄` : '還沒有任何記錄';
}

function toggleEntry(id) {
  const el = document.querySelector(`.entry[data-id="${id}"]`);
  if (el) el.classList.toggle('expanded');
}

function renderEntries() {
  const container = document.getElementById('entries-container');
  const list = filteredEntries();

  if (!list.length) {
    container.innerHTML = `
      <div class="empty">
        <div class="empty-title">${currentFilter === 'all' ? '還沒有記錄' : '這個分類沒有記錄'}</div>
        ${currentFilter === 'all' ? '按右上角「+ 新增記錄」開始' : ''}
      </div>`;
    return;
  }

  container.innerHTML = list.map(e => {
    const meta = OUTCOME_META[e.outcome] || OUTCOME_META.pending;
    return `
    <div class="entry" data-id="${e.id}" onclick="toggleEntry(${e.id})">
      <div class="entry-top">
        <div>
          <div class="entry-title">${esc(e.title)}</div>
          <div class="entry-meta">
            <span>${formatDate(e.created_at)}</span>
            <span>${esc(e.category || '')}</span>
          </div>
        </div>
        <span class="badge ${meta.cls}">${meta.label}</span>
      </div>
      <div class="entry-body">
        ${e.hypothesis ? `<div class="entry-section"><div class="entry-section-label">假設</div><div class="entry-section-text">${esc(e.hypothesis)}</div></div>` : ''}
        ${e.result ? `<div class="entry-section"><div class="entry-section-label">結果</div><div class="entry-section-text">${esc(e.result)}</div></div>` : ''}
        ${e.reflection ? `<div class="entry-section"><div class="entry-section-label">反思</div><div class="entry-section-text">${esc(e.reflection)}</div></div>` : ''}
        <div class="entry-actions" onclick="event.stopPropagation()">
          <button class="btn-sm" onclick="openModal(${e.id})">編輯</button>
          <button class="btn-sm danger" onclick="deleteEntry(${e.id})">刪除</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderAll() {
  renderStats();
  renderEntries();
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Toast ──────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Init ───────────────────────────────────────────────────
(async () => {
  try {
    await loadEntries();
    renderAll();
  } catch (err) {
    document.getElementById('entries-container').innerHTML = `
      <div class="empty">
        <div class="empty-title">無法連接資料庫</div>
        ${err.message}
      </div>`;
    document.getElementById('page-sub').textContent = '連接失敗';
  }
})();
