const axios = require('axios');

/** ดาวน์โหลดรูปจาก URL แล้วคืน base64 (data URI ready) */
async function downloadAsDataURI(url) {
  const resp = await axios.get(url, { responseType: 'arraybuffer' });
  const mime = resp.headers['content-type'] || 'image/jpeg';
  const b64   = Buffer.from(resp.data, 'binary').toString('base64');
  return `data:${mime};base64,${b64}`;
}

module.exports = { downloadAsDataURI }; 