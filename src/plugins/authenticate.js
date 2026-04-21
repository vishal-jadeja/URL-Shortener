const fp = require('fastify-plugin');
const fjwt = require('@fastify/jwt');
const config = require('../config');

async function authenticatePlugin(fastify) {
  fastify.register(fjwt, { secret: config.jwt.secret });

  fastify.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized', message: err.message });
    }
  });
}

module.exports = fp(authenticatePlugin, { name: 'authenticate' });
