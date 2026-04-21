const Fastify = require('fastify');
const ajvFormats = require('ajv-formats');

function buildApp(opts = {}) {
  const fastify = Fastify({
    logger: opts.logger ?? {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    },
    ajv: {
      customOptions: { formats: {} },
      plugins: [ajvFormats],
    },
    trustProxy: true,
  });

  // Infrastructure plugins
  fastify.register(require('./plugins/postgres'));
  fastify.register(require('./plugins/redis'));
  fastify.register(require('./plugins/kafka'));
  fastify.register(require('./plugins/elasticsearch'));
  fastify.register(require('./plugins/authenticate'));

  // Health check
  fastify.get('/health', async (req, reply) => {
    try {
      await fastify.pg.query('SELECT 1');
      await fastify.redis.ping();
      reply.send({ status: 'ok' });
    } catch (err) {
      reply.code(503).send({ status: 'error', message: err.message });
    }
  });

  // Routes
  fastify.register(require('./routes/auth'));
  fastify.register(require('./routes/urls'));
  fastify.register(require('./routes/redirect'));
  fastify.register(require('./routes/analytics'));

  // Global error handler
  fastify.setErrorHandler((err, req, reply) => {
    const statusCode = err.statusCode || 500;
    fastify.log.error({ err, statusCode }, err.message);

    if (statusCode === 400 && err.validation) {
      return reply.code(400).send({ error: 'Validation error', details: err.validation });
    }

    if (statusCode < 500) {
      return reply.code(statusCode).send({ error: err.message });
    }

    reply.code(500).send({ error: 'Internal server error' });
  });

  return fastify;
}

module.exports = buildApp;
