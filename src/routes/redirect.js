const { resolveUrl } = require('../services/urlService');
const { publishClickEvent } = require('../services/clickEventService');

async function redirectRoutes(fastify) {
  fastify.get('/:code', async (req, reply) => {
    const { code } = req.params;
    const originalUrl = await resolveUrl(fastify.pg, fastify.redis, code);

    if (!originalUrl) {
      return reply.code(404).send({ error: 'Short URL not found' });
    }

    publishClickEvent(fastify.kafkaProducer, {
      code,
      originalUrl,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
      referer: req.headers['referer'] || '',
    }).catch(err => fastify.log.error({ err }, 'Failed to publish click event'));

    reply.redirect(302, originalUrl);
  });
}

module.exports = redirectRoutes;
