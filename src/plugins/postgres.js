const fp = require('fastify-plugin');
const { Pool } = require('pg');
const config = require('../config');

async function postgresPlugin(fastify) {
  const pool = new Pool(config.db);

  pool.on('error', (err) => {
    fastify.log.error({ err }, 'Unexpected postgres pool error');
  });

  fastify.decorate('pg', pool);

  fastify.addHook('onClose', async () => {
    await pool.end();
  });
}

module.exports = fp(postgresPlugin, { name: 'postgres' });
