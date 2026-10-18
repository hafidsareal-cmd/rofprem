// lib/mailer.js — AM Premium Email Sender
// Requires: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS di .env

import nodemailer from 'nodemailer';

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendActivationEmail(email, code, expiresAt) {
  const expireStr = new Date(expiresAt).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kode Aktivasi AM Premium</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ff;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="
          background:#ffffff;
          border-radius:16px;
          overflow:hidden;
          box-shadow:0 4px 20px rgba(108,99,255,0.12);
        ">
          <!-- Header -->
          <tr>
            <td style="
              background:linear-gradient(135deg,#6c63ff 0%,#a78bfa 100%);
              padding:32px 40px;
              text-align:center;
            ">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">
                AM Premium
              </h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">
                Alight Motion Premium Activator
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 8px;color:#374151;font-size:16px;">
                Hei! Pembayaran kamu berhasil ✅
              </p>
              <p style="margin:0 0 28px;color:#6b7280;font-size:14px;">
                Ini kode aktivasi Alight Motion Premium kamu:
              </p>

              <!-- Kode Box -->
              <div style="
                background:#f5f3ff;
                border:2px solid #c4b5fd;
                border-radius:12px;
                padding:24px;
                text-align:center;
                margin-bottom:28px;
              ">
                <span style="
                  font-size:26px;
                  font-weight:700;
                  letter-spacing:6px;
                  color:#6c63ff;
                  font-family:monospace;
                ">${code}</span>
              </div>

              <!-- Info -->
              <table width="100%" cellpadding="0" cellspacing="0" style="
                background:#f9fafb;
                border-radius:10px;
                padding:16px 20px;
                margin-bottom:28px;
              ">
                <tr>
                  <td style="color:#6b7280;font-size:13px;padding:4px 0;">Masa aktif</td>
                  <td style="color:#111827;font-size:13px;font-weight:600;text-align:right;padding:4px 0;">30 hari</td>
                </tr>
                <tr>
                  <td style="color:#6b7280;font-size:13px;padding:4px 0;">Berlaku sampai</td>
                  <td style="color:#111827;font-size:13px;font-weight:600;text-align:right;padding:4px 0;">${expireStr}</td>
                </tr>
                <tr>
                  <td style="color:#6b7280;font-size:13px;padding:4px 0;">Untuk akun</td>
                  <td style="color:#111827;font-size:13px;font-weight:600;text-align:right;padding:4px 0;">${email}</td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#374151;font-size:14px;font-weight:600;">
                Cara pakai:
              </p>
              <ol style="margin:0 0 24px;padding-left:20px;color:#6b7280;font-size:14px;line-height:1.8;">
                <li>Buka situs aktivasi di <a href="${process.env.SITE_URL}" style="color:#6c63ff;">${process.env.SITE_URL}</a></li>
                <li>Masukkan email kamu: <strong>${email}</strong></li>
                <li>Masukkan kode di atas</li>
                <li>Klik Aktivasi — selesai!</li>
              </ol>

              <p style="margin:0;color:#9ca3af;font-size:12px;">
                ⚠️ Jangan bagikan kode ini ke siapapun. Kode hanya bisa digunakan 1 kali.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="
              background:#f9fafb;
              border-top:1px solid #f0f0f0;
              padding:20px 40px;
              text-align:center;
            ">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                Email ini dikirim otomatis. Tidak perlu membalas.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  await getTransporter().sendMail({
    from: `"AM Premium" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `🎉 Kode Aktivasi AM Premium Kamu — Berlaku ${expireStr}`,
    html,
  });
}
