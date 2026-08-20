const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./src/config');
const connectDB = require('./src/db');
const { apiLimiter } = require('./src/middleware/rateLimiter');

const authRoutes = require('./src/routes/auth');
const gameRoutes = require('./src/routes/game');
const taskRoutes = require('./src/routes/tasks');
const walletRoutes = require('./src/routes/wallet');
const raffleRoutes = require('./src/routes/raffle');
const levelRoutes = require('./src/routes/levels');
const adminRoutes = require('./src/routes/admin');
const i18nRoutes = require('./src/routes/i18n');

const app = express();

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/raffles', raffleRoutes);
app.use('/api/levels', levelRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/locales', i18nRoutes);

// Serve the Mini App frontend and the Admin panel as static files.
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

app.get('/health', (req, res) => res.json({ ok: true }));

async function start() {
  await connectDB();
  app.listen(config.port, () => {
    console.log(`[server] LuckyFest running on port ${config.port}`);
  });
}

start().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
