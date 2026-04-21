const bcrypt = require('bcrypt');

const ROUNDS = 12;

async function hash(password) {
  return bcrypt.hash(password, ROUNDS);
}

async function compare(password, hashed) {
  return bcrypt.compare(password, hashed);
}

module.exports = { hash, compare };
