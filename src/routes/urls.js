const { shortenUrl } = require('../services/urlService');
const { findByUserId } = require('../models/urlModel');

async function urlRoutes(fastify) {
  fastify.post(
    '/api/urls',
    {
      preHandler: fastify.authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['originalUrl'],
          properties: {
            originalUrl: { type: 'string', format: 'uri' },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const result = await shortenUrl(fastify.pg, fastify.redis, {
        originalUrl: req.body.originalUrl,
        userId: req.user.sub,
      });
      reply.code(201).send(result);
    }
  );

  fastify.get(
    '/api/urls',
    {
      preHandler: fastify.authenticate,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
        },
      },
    },
    async (req, reply) => {
      const { limit, offset } = req.query;
      const urls = await findByUserId(fastify.pg, req.user.sub, { limit, offset });
      reply.send({ urls, limit, offset });
    }
  );
}

module.exports = urlRoutes;
