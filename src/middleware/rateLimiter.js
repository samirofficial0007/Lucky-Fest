const rateLimit = require('express-rate-limit');

// General API limiter: blunt protection against scripted farming/DDoS.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // 60 requests/minute/IP across the API
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});

module.exports = { apiLimiter };
