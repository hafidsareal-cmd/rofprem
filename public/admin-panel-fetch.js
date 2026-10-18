// admin-panel-fetch.js
// Paste snippet ini ke dalam admin.html — replace fetch lama yang error
// Semua panggil /api/admin?action=... dengan Bearer token

const API_ADMIN = '/api/admin';

function getHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// ─── Cek auth saat halaman load ────────────────────────────────────────────

async function checkAdminAuth() {
  const token = localStorage.getItem('token');
  if (!token) return window.location.href = '/index.html';

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.role !== 'admin') return window.location.href = '/index.html';
    if (payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('token');
      return window.location.href = '/index.html';
    }
  } catch {
    return window.location.href = '/index.html';
  }
}

// ─── 📋 Daftar Kode ────────────────────────────────────────────────────────

async function loadCodes() {
  try {
    const res = await fetch(`${API_ADMIN}?action=codes`, {
      method: 'GET',
      headers: getHeaders()
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);

    const tbody = document.getElementById('codes-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    json.codes.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.code}</td>
        <td>${c.is_used ? '✅ Terpakai' : '⬜ Tersedia'}</td>
        <td>${c.duration_days} hari</td>
        <td>${c.expires_at ? new Date(c.expires_at).toLocaleDateString('id-ID') : '-'}</td>
        <td>
          ${!c.is_used
            ? `<button onclick="deleteCode('${c.id}')" class="btn-delete">Hapus</button>`
            : '-'
          }
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('loadCodes error:', err);
    showToast('Gagal load kode: ' + err.message, 'error');
  }
}

async function generateCodes(count = 1, duration_days = 30) {
  try {
    const res = await fetch(`${API_ADMIN}?action=codes`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ count, duration_days })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);

    showToast(`${json.generated.length} kode berhasil dibuat`, 'success');
    loadCodes(); // refresh tabel
    return json.generated;
  } catch (err) {
    console.error('generateCodes error:', err);
    showToast('Gagal generate kode: ' + err.message, 'error');
  }
}

async function deleteCode(code_id) {
  if (!confirm('Hapus kode ini?')) return;
  try {
    const res = await fetch(`${API_ADMIN}?action=codes`, {
      method: 'DELETE',
      headers: getHeaders(),
      body: JSON.stringify({ code_id })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);

    showToast('Kode dihapus', 'success');
    loadCodes();
  } catch (err) {
    console.error('deleteCode error:', err);
    showToast('Gagal hapus kode: ' + err.message, 'error');
  }
}

// ─── 📝 Audit Log ──────────────────────────────────────────────────────────

async function loadAuditLog() {
  try {
    const res = await fetch(`${API_ADMIN}?action=audit`, {
      method: 'GET',
      headers: getHeaders()
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);

    const tbody = document.getElementById('audit-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    json.logs.forEach(log => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${new Date(log.created_at).toLocaleString('id-ID')}</td>
        <td>${log.admin_email ?? '-'}</td>
        <td>${log.action}</td>
        <td>${log.detail ?? '-'}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('loadAuditLog error:', err);
    showToast('Gagal load audit log: ' + err.message, 'error');
  }
}

// ─── 🕐 Aktivasi Terbaru ───────────────────────────────────────────────────

async function loadRecent() {
  try {
    const res = await fetch(`${API_ADMIN}?action=recent`, {
      method: 'GET',
      headers: getHeaders()
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);

    const tbody = document.getElementById('recent-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    json.recent.forEach(act => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${act.users?.email ?? '-'}</td>
        <td>${act.activation_codes?.code ?? '-'}</td>
        <td>${act.activation_codes?.duration_days ?? '-'} hari</td>
        <td>${new Date(act.activated_at).toLocaleString('id-ID')}</td>
        <td>${act.expires_at ? new Date(act.expires_at).toLocaleString('id-ID') : '-'}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('loadRecent error:', err);
    showToast('Gagal load aktivasi terbaru: ' + err.message, 'error');
  }
}

// ─── Toast helper ──────────────────────────────────────────────────────────

function showToast(msg, type = 'info') {
  const el = document.getElementById('toast') ?? (() => {
    const t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:12px 20px;border-radius:8px;color:#fff;font-size:14px;z-index:9999;transition:opacity .3s';
    document.body.appendChild(t);
    return t;
  })();

  el.textContent = msg;
  el.style.background = type === 'error' ? '#e53e3e' : type === 'success' ? '#38a169' : '#3182ce';
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 3000);
}

// ─── Init ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await checkAdminAuth();
  await Promise.all([loadCodes(), loadAuditLog(), loadRecent()]);
});
