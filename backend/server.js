require('dotenv').config();

const { initDb } = require('./src/db/database');
const { flushDb } = require('./src/db/database');

const PORT = process.env.PORT || 3001;

(async () => {
  try {
    // 1. Initialize database (async WASM loading)
    await initDb();

    // 2. Run migrations
    require('./src/db/migrate');

    // 3. Start server
    const app = require('./src/app');
    const server = app.listen(PORT, () => {
      console.log(`Comic Reader API running on http://localhost:${PORT}`);
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log('[server] Flushing DB and shutting down...');
      flushDb();
      server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('[startup] Fatal error:', err);
    process.exit(1);
  }
})();
