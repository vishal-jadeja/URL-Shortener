const fp = require('fastify-plugin');
const Redis = require('ioredis');
const config = require('../config');

async function redisPlugin(fastify) {
  const redis = new Redis(config.redis.url, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
  });

  redis.on('error', (err) => {
    fastify.log.error({ err }, 'Redis client error');
  });

  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async () => {
    await redis.quit();
  });
}

module.exports = fp(redisPlugin, { name: 'redis' });
