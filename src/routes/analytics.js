const { getClickStats } = require('../services/analyticsService');
const { findByCode } = require('../models/urlModel');

async function analyticsRoutes(fastify) {
  fastify.get(
    '/api/analytics/:code',
    {
      preHandler: fastify.authenticate,
      schema: {
        params: {
          type: 'object',
          properties: { code: { type: 'string' } },
          required: ['code'],
        },
        querystring: {
          type: 'object',
          properties: {
            from:     { type: 'string' },
            to:       { type: 'string' },
            interval: { type: 'string', enum: ['hour', 'day', 'week', 'month'], default: 'day' },
          },
        },
      },
    },
    async (req, reply) => {
      const { code } = req.params;
      const { from, to, interval } = req.query;

      const url = await findByCode(fastify.pg, code);
      if (!url) return reply.code(404).send({ error: 'URL not found' });
      if (url.user_id !== req.user.sub) return reply.code(403).send({ error: 'Forbidden' });

      const stats = await getClickStats(fastify.esClient, code, { from, to, interval });
      reply.send(stats);
    }
  );
}

module.exports = analyticsRoutes;
