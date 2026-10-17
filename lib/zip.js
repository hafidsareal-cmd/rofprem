import archiver from 'archiver';
import { Writable } from 'stream';

/**
 * Build ZIP with ONE txt file containing all codes.
 * Format each line: email : KODE-XXXX-XXXX-XXXX-XXXX
 *                   password : https://premrof.vercel.app
 */
export function buildZip(codes, batchId) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const output = new Writable({
      write(chunk, _, cb) { chunks.push(chunk); cb(); }
    });
    output.on('finish', () => resolve(Buffer.concat(chunks)));
    output.on('error', reject);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', reject);
    archive.pipe(output);

    // Single file with all codes
    const lines = codes.map((code, i) =>
      `[${String(i + 1).padStart(3, '0')}]\nemail    : ${code}\npassword : https://premrof.vercel.app\n`
    ).join('\n');

    const header = `KODE AKTIVASI AM VERIFIER\nTotal: ${codes.length} kode\nBatch: ${batchId || '-'}\nDibuat: ${new Date().toLocaleString('id-ID')}\n${'='.repeat(50)}\n\n`;

    archive.append(header + lines, { name: 'kode-aktivasi.txt' });
    archive.finalize();
  });
}
