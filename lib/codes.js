// lib/codes.js — AM Premium Code Generator
// Format: XXXX-XXXX-XXXX-XXXX (tanpa karakter ambigu: 0,O,1,I)

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateCode() {
  const seg = () =>
    Array.from({ length: 4 }, () =>
      CHARSET[Math.floor(Math.random() * CHARSET.length)]
    ).join('');
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}
