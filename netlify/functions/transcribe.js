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
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }

  if (!fileBuffer) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Keine Audiodatei empfangen' }),
    };
  }

  const form = new FormData();
  form.append('file', fileBuffer, {
    filename:    filename || 'recording.webm',
    contentType: mimetype  || 'audio/webm',
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
    console.error('Whisper-Fehler', status, message);
    return {
      statusCode: status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: message }),
    };
  }
};

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: { 'content-type': event.headers['content-type'] } });
    let fileBuffer = null;
    let filename   = 'recording.webm';
    let mimetype   = 'audio/webm';

    bb.on('file', (_field, file, info) => {
      filename = info.filename || filename;
      mimetype = info.mimeType  || mimetype;
      const chunks = [];
      file.on('data', chunk => chunks.push(chunk));
      file.on('end',  ()    => { fileBuffer = Buffer.concat(chunks); });
    });

    bb.on('finish', () => resolve({ fileBuffer, filename, mimetype }));
    bb.on('error',  reject);

    const body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body || '');

    bb.write(body);
    bb.end();
  });
}
