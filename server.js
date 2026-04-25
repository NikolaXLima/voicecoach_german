require('dotenv').config();

const express = require('express');
const multer  = require('multer');
const FormData = require('form-data');
const axios   = require('axios');
const path    = require('path');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// Whisper proxy – keeps the API key server-side
app.post('/transcribe', upload.single('file'), async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY nicht gesetzt (siehe .env)' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Keine Audiodatei empfangen' });
  }

  const form = new FormData();
  form.append('file', req.file.buffer, {
    filename: req.file.originalname || 'recording.webm',
    contentType: req.file.mimetype || 'audio/webm',
  });
  form.append('model', 'whisper-1');
  form.append('language', 'de');
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  form.append('prompt', 'ähm äh hmm hm mhm ehm öhm');

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      form,
      { headers: { Authorization: `Bearer ${apiKey}`, ...form.getHeaders() } }
    );
    res.json(response.data);
  } catch (err) {
    const status  = err.response?.status  || 500;
    const message = err.response?.data?.error?.message || err.message;
    console.error(`Whisper-Fehler ${status}:`, message);
    res.status(status).json({ error: message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ Stimm-Analyse läuft → http://localhost:${PORT}`);
});
