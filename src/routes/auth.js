const { register, login, refresh, logout } = require('../services/authService');
const { HttpError } = require('../utils/errors');

const emailPwBody = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8 },
  },
  additionalProperties: false,
};

async function authRoutes(fastify) {
  fastify.post('/api/auth/register', { schema: { body: emailPwBody } }, async (req, reply) => {
    try {
      const tokens = await register(fastify.pg, fastify.redis, fastify, req.body);
      reply.code(201).send(tokens);
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  fastify.post('/api/auth/login', { schema: { body: emailPwBody } }, async (req, reply) => {
    try {
      const tokens = await login(fastify.pg, fastify.redis, fastify, req.body);
      reply.send(tokens);
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  fastify.post(
    '/api/auth/refresh',
    {
      schema: {
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: { refreshToken: { type: 'string' } },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      try {
        const result = await refresh(fastify.redis, fastify, req.body.refreshToken);
        reply.send(result);
      } catch (err) {
        if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
        throw err;
      }
    }
  );

  fastify.post(
    '/api/auth/logout',
    {
      schema: {
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: { refreshToken: { type: 'string' } },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      await logout(fastify.redis, req.body.refreshToken);
      reply.code(204).send();
    }
  );
}

module.exports = authRoutes;
