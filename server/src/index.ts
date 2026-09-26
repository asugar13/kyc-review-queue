import { createApp } from './app.ts';
import { CLIENT_DIST, DB_PATH, PORT } from './config.ts';
import { openDatabase } from './db.ts';
import { seedDatabase } from './seed.ts';

const db = openDatabase(DB_PATH);
const seeded = seedDatabase(db);
if (seeded > 0) console.log(`Seeded ${seeded} synthetic cases into ${DB_PATH}`);

const app = createApp({ db, clientDist: CLIENT_DIST });
const server = app.listen(PORT, () => {
  console.log(`KYC API listening on http://localhost:${PORT}  (db: ${DB_PATH})`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
