require('dotenv').config();

const required = [
  'DATABASE_URL',
  'REDIS_URL',
  'KAFKA_BROKERS',
  'ES_NODE',
  'JWT_SECRET',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = Object.freeze({
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  },
  db: {
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  kafka: {
    brokers: process.env.KAFKA_BROKERS.split(','),
  },
  elasticsearch: {
    node: process.env.ES_NODE,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  },
  refreshTokenTTL: parseInt(process.env.REFRESH_TOKEN_TTL_SECONDS || '604800', 10),
  idRangeSize: parseInt(process.env.ID_RANGE_SIZE || '1000', 10),
});
