const fp = require('fastify-plugin');
const { Client } = require('@elastic/elasticsearch');
const config = require('../config');

async function elasticsearchPlugin(fastify) {
  const client = new Client({ node: config.elasticsearch.node });
  fastify.decorate('esClient', client);
}

module.exports = fp(elasticsearchPlugin, { name: 'elasticsearch' });
