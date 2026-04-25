const FormData = require('form-data');
const axios    = require('axios');
const Busboy   = require('busboy');

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'OPENAI_API_KEY ist nicht gesetzt' }),
    };
  }

  let fileBuffer, filename, mimetype;
  try {
    ({ fileBuffer, filename, mimetype } = await parseMultipart(event));
  } catch (err) {
    console.error('parseMultipart error:', err.message);
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }

  if (!fileBuffer || fileBuffer.length === 0) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Keine Audiodatei empfangen' }),
    };
  }

  // Detect format from file magic bytes so the name/type is always correct
  const isWav  = fileBuffer[0] === 0x52 && fileBuffer[1] === 0x49; // "RI" (RIFF)
  const isOgg  = fileBuffer[0] === 0x4F && fileBuffer[1] === 0x67; // "Og"
  const isMp4  = fileBuffer[4] === 0x66 && fileBuffer[5] === 0x74; // "ft" (ftyp)
  const detectedExt  = isWav ? 'wav' : isOgg ? 'ogg' : isMp4 ? 'mp4' : 'webm';
  const detectedMime = isWav ? 'audio/wav' : isOgg ? 'audio/ogg' : isMp4 ? 'audio/mp4' : 'audio/webm';

  console.log('Audio received — size:', fileBuffer.length,
    'bytes | ext:', detectedExt, '| isBase64Encoded:', event.isBase64Encoded);

  const form = new FormData();
  form.append('file', fileBuffer, {
    filename:    'recording.' + detectedExt,
    contentType: detectedMime,
  });
  form.append('model',           'whisper-1');
  form.append('language',        'de');
  form.append('response_format', 'verbose_json');
  form.append('temperature',     '0');
  form.append('prompt',          'ähm äh hmm hm mhm ehm öhm');

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      form,
      {
        headers: { Authorization: `Bearer ${apiKey}`, ...form.getHeaders() },
        maxBodyLength: Infinity,
        timeout: 55000,
      }
    );
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response.data),
    };
  } catch (err) {
    const status  = err.response?.status || 500;
    const message = err.response?.data?.error?.message || err.message;
    console.error('Whisper error', status, message);
    return {
      statusCode: status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: message }),
    };
  }
};

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
    const bb = Busboy({ headers: { 'content-type': contentType } });

    let fileBuffer = null;
    let filename   = 'recording.wav';
    let mimetype   = 'audio/wav';

    bb.on('file', (_field, file, info) => {
      filename = info.filename || filename;
      mimetype = info.mimeType  || mimetype;
      const chunks = [];
      file.on('data', chunk => chunks.push(chunk));
      file.on('end',  ()    => { fileBuffer = Buffer.concat(chunks); });
    });

    bb.on('finish', () => resolve({ fileBuffer, filename, mimetype }));
    bb.on('error',  reject);

    // Binary body: Netlify base64-encodes it (isBase64Encoded=true).
    // If not base64, use 'binary'/latin1 — NOT utf8 — to preserve bytes > 127.
    const body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body || '', 'binary');

    bb.write(body);
    bb.end();
  });
}
