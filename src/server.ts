import 'dotenv/config';
import closeWithGrace from 'close-with-grace';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const startServer = async () => {
  const config = loadConfig();

  const app = await buildApp(config);

  closeWithGrace({ delay: 5000 }, async ({ signal, err }) => {
    if (err) {
      app.log.error(err, 'Server closing due to error');
    } else {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
    }
    await app.close();
  });

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    app.log.info(`Server running at http://localhost:${config.PORT}`);
    app.log.info(`Environment: ${config.NODE_ENV}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

startServer();
