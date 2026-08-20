const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const config = require('../config');

router.get('/:lang', (req, res) => {
  const lang = req.params.lang;
  if (!config.supportedLanguages.includes(lang)) {
    return res.status(404).json({ error: 'unsupported_language' });
  }
  const filePath = path.join(__dirname, '..', 'locales', `${lang}.json`);
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(404).json({ error: 'not_found' });
    res.type('application/json').send(data);
  });
});

module.exports = router;
