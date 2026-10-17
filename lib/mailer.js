import nodemailer from 'nodemailer';

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const SITE = () => process.env.SITE_URL || 'https://premrof.vercel.app';
const FROM = () => process.env.SMTP_FROM || 'AM Verifier <noreply@premrof.vercel.app>';

export async function sendVerificationEmail(email, token) {
  const link = `${SITE()}/verify.html?token=${token}`;
  await getTransport().sendMail({
    from:    FROM(),
    to:      email,
    subject: 'Verifikasi Email — AM Verifier',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="color:#7c3aed;margin-bottom:8px">AM Verifier</h2>
        <p style="color:#444;margin-bottom:24px">Klik tombol di bawah untuk verifikasi email kamu.</p>
        <a href="${link}"
           style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);
                  color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;
                  font-weight:700;font-size:14px">
          Verifikasi Email
        </a>
        <p style="color:#888;font-size:12px;margin-top:24px">
          Link berlaku 24 jam. Abaikan email ini jika kamu tidak mendaftar.
        </p>
        <p style="color:#bbb;font-size:11px">
          Atau copy link ini: ${link}
        </p>
      </div>
    `,
  });
}

export async function sendWelcomeEmail(email) {
  await getTransport().sendMail({
    from:    FROM(),
    to:      email,
    subject: 'Selamat datang di AM Verifier! 🎉',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="color:#7c3aed">Selamat datang!</h2>
        <p style="color:#444">Akun kamu sudah aktif. Masuk ke <a href="${SITE()}" style="color:#7c3aed">${SITE()}</a> dan gunakan kode aktivasi untuk mengakses AM Verifier.</p>
        <p style="color:#888;font-size:12px;margin-top:24px">Tim rofers</p>
      </div>
    `,
  });
}
