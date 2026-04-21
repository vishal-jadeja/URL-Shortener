const buildApp = require('./app');
const config = require('./config');

const fastify = buildApp();

const start = async () => {
  try {
    await fastify.listen({ port: config.server.port, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

const stop = async (signal) => {
  fastify.log.info(`${signal} received, shutting down...`);
  await fastify.close();
  process.exit(0);
};

process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));

start();
