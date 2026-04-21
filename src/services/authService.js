const crypto = require('crypto');
const { findByEmail, createUser } = require('../models/userModel');
const { hash, compare } = require('../utils/hashPassword');
const { conflict, unauthorized } = require('../utils/errors');
const config = require('../config');

async function register(pg, redis, fastify, { email, password }) {
  const existing = await findByEmail(pg, email);
  if (existing) throw conflict('Email already registered');

  const passwordHash = await hash(password);
  const user = await createUser(pg, email, passwordHash);
  return issueTokens(fastify, redis, user.id, user.email);
}

async function login(pg, redis, fastify, { email, password }) {
  const user = await findByEmail(pg, email);
  if (!user) throw unauthorized('Invalid credentials');

  const valid = await compare(password, user.password_hash);
  if (!valid) throw unauthorized('Invalid credentials');

  return issueTokens(fastify, redis, user.id, user.email);
}

async function refresh(redis, fastify, refreshToken) {
  const userId = await redis.get(`refresh:${refreshToken}`);
  if (!userId) throw unauthorized('Invalid or expired refresh token');

  const accessToken = fastify.jwt.sign(
    { sub: parseInt(userId, 10) },
    { expiresIn: config.jwt.expiresIn }
  );
  return { accessToken };
}

async function logout(redis, refreshToken) {
  await redis.del(`refresh:${refreshToken}`);
}

async function issueTokens(fastify, redis, userId, email) {
  const accessToken = fastify.jwt.sign(
    { sub: userId, email },
    { expiresIn: config.jwt.expiresIn }
  );

  const refreshToken = crypto.randomBytes(32).toString('hex');
  await redis.set(
    `refresh:${refreshToken}`,
    String(userId),
    'EX',
    config.refreshTokenTTL
  );

  return { accessToken, refreshToken };
}

module.exports = { register, login, refresh, logout };
