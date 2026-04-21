const { nextId } = require('./idRangeService');
const { encode } = require('../utils/base62');
const { insertUrl, findByCode } = require('../models/urlModel');
const config = require('../config');

const CACHE_TTL = 86400; // 24 hours

async function shortenUrl(pg, redis, { originalUrl, userId }) {
  const id = await nextId(pg);
  const code = encode(id);

  await insertUrl(pg, { id, code, originalUrl, userId });
  await redis.set(`url:${code}`, originalUrl, 'EX', CACHE_TTL);

  return {
    code,
    shortUrl: `${config.server.baseUrl}/${code}`,
    originalUrl,
  };
}

async function resolveUrl(pg, redis, code) {
  const cached = await redis.get(`url:${code}`);
  if (cached) return cached;

  const row = await findByCode(pg, code);
  if (!row || !row.is_active) return null;

  await redis.set(`url:${code}`, row.original_url, 'EX', CACHE_TTL);
  return row.original_url;
}

module.exports = { shortenUrl, resolveUrl };
