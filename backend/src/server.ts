import 'dotenv/config';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createFirebaseServices } from './firebase.js';
import { processNotificationJobs, runMaintenance } from './jobs.js';
import { createDefaultDispatcher } from './notifications.js';

const config = loadConfig(process.env);
const services = createFirebaseServices(config);
const notifications = createDefaultDispatcher(config);
const app = createApp({ config, ...services, notifications });
const server = app.listen(config.port);
server.headersTimeout = 15_000;
server.requestTimeout = 20_000;
server.keepAliveTimeout = 5_000;

const maintenance = setInterval(() => {
  void runMaintenance(config, services.store)
    .then(() => processNotificationJobs(config, services.store, notifications))
    .catch(() => {
      // The scheduled operation is retried on the next interval; request logging is intentionally not used here.
    });
}, 60_000);
maintenance.unref();

function shutdown(signal: string): void {
  clearInterval(maintenance);
  server.close((error) => {
    if (error) process.exitCode = 1;
    process.stdout.write(`${JSON.stringify({ level: 'info', event: 'shutdown', signal })}\n`);
  });
  setTimeout(() => {
    process.exitCode = 1;
    server.closeAllConnections();
  }, 10_000).unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
