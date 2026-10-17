/**
 * codes.js — Activation code engine (localStorage)
 * All code data stored in localStorage under key "am_codes"
 */
'use strict';

const STORE_KEY    = 'am_codes';
const SESSION_KEY  = 'am_session';
const DAYS_ACTIVE  = 30;

/* ── STORAGE ── */
function loadCodes() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
  catch(_) { return []; }
}

function saveCodes(codes) {
  localStorage.setItem(STORE_KEY, JSON.stringify(codes));
}

/* ── GENERATE ── */
function genCode() {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('').toUpperCase();
  return `${hex.slice(0,4)}-${hex.slice(4,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}`;
}

export function generateCodes(count) {
  const codes   = loadCodes();
  const existing = new Set(codes.map(c => c.code));
  const batch   = [];
  const batchId = Date.now().toString(36);

  let attempts = 0;
  while (batch.length < count && attempts < count * 5) {
    attempts++;
    const code = genCode();
    if (existing.has(code)) continue;
    existing.add(code);
    const entry = {
      id:           crypto.randomUUID(),
      code,
      status:       'available',
      created_at:   new Date().toISOString(),
      activated_at: null,
      expires_at:   null,
      used_by:      null,
      revoked_at:   null,
      batch_id:     batchId,
    };
    batch.push(entry);
    codes.push(entry);
  }

  saveCodes(codes);
  return { batch, batchId };
}

/* ── ACTIVATE (user-facing) ── */
export function activateCode(inputCode, email) {
  const codes = loadCodes();
  const clean = inputCode.trim().toUpperCase();
  const idx   = codes.findIndex(c => c.code === clean);

  if (idx === -1) return { ok: false, error: 'Kode tidak valid' };

  const entry = codes[idx];

  // Run expire check
  if (entry.status === 'used' && entry.expires_at && new Date(entry.expires_at) < new Date()) {
    codes[idx].status = 'expired';
    saveCodes(codes);
    return { ok: false, error: 'Kode sudah kedaluwarsa' };
  }

  if (entry.status === 'used')    return { ok: false, error: 'Kode sudah pernah digunakan' };
  if (entry.status === 'expired') return { ok: false, error: 'Kode sudah kedaluwarsa' };
  if (entry.status === 'revoked') return { ok: false, error: 'Kode telah dicabut' };

  const now     = new Date();
  const expires = new Date(now.getTime() + DAYS_ACTIVE * 24 * 60 * 60 * 1000);

  codes[idx] = {
    ...entry,
    status:       'used',
    activated_at: now.toISOString(),
    expires_at:   expires.toISOString(),
    used_by:      email.trim().toLowerCase(),
  };

  saveCodes(codes);

  // Save session
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    email:      email.trim().toLowerCase(),
    expires_at: expires.toISOString(),
  }));

  return { ok: true, expires_at: expires.toISOString() };
}

/* ── SESSION ── */
export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (new Date(s.expires_at) < new Date()) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch(_) { return null; }
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

/* ── ADMIN: list/revoke/expire ── */
export function listCodes(filter = 'all', search = '') {
  const codes = loadCodes().map(c => {
    // auto-expire
    if (c.status === 'used' && c.expires_at && new Date(c.expires_at) < new Date()) {
      c.status = 'expired';
    }
    return c;
  });
  saveCodes(codes);

  return codes.filter(c => {
    const matchStatus = filter === 'all' || c.status === filter;
    const matchSearch = !search || c.code.includes(search.toUpperCase()) || (c.used_by||'').includes(search);
    return matchStatus && matchSearch;
  });
}

export function revokeCode(id) {
  const codes = loadCodes();
  const idx   = codes.findIndex(c => c.id === id && c.status === 'available');
  if (idx === -1) return false;
  codes[idx].status     = 'revoked';
  codes[idx].revoked_at = new Date().toISOString();
  saveCodes(codes);
  return true;
}

export function getCodesByBatch(batchId) {
  return loadCodes().filter(c => c.batch_id === batchId);
}

export function getStats() {
  const codes = loadCodes();
  return {
    total:    codes.length,
    available: codes.filter(c => c.status === 'available').length,
    used:     codes.filter(c => c.status === 'used').length,
    expired:  codes.filter(c => c.status === 'expired').length,
    revoked:  codes.filter(c => c.status === 'revoked').length,
  };
}

/* ── ZIP BUILDER (client-side) ── */
export async function buildAndDownloadZip(codes, filename) {
  // Use fflate via CDN (loaded in admin.html)
  const { zipSync, strToU8 } = window.fflate;
  const files = {};
  codes.forEach((c, i) => {
    const name    = `akun_${String(i + 1).padStart(3, '0')}.txt`;
    const content = `email    : ${c.code}\npassword : https://premrof.vercel.app\n`;
    files[name]   = strToU8(content);
  });
  const zipped = zipSync(files, { level: 6 });
  const blob   = new Blob([zipped], { type: 'application/zip' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = filename;
  a.click();
  URL.revokeObjectURL(url);
}
