// lib/codes.js — AM Premium Code Generator
// Format: XXXX-XXXX-XXXX-XXXX (uppercase alphanumeric, ambiguous chars dihapus)

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa 0,O,1,I biar gak bingung

export function generateCode() {
  const segment = () =>
    Array.from({ length: 4 }, () => CHARSET[Math.floor(Math.random() * CHARSET.length)]).join('');

  return `${segment()}-${segment()}-${segment()}-${segment()}`;
}

export function formatCode(raw) {
  // Normalisasi input dari user (strip dash, uppercase)
  return raw.replace(/[-\s]/g, '').toUpperCase().replace(/(.{4})/g, '$1-').replace(/-$/, '');
}
