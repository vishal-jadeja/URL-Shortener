async function findByEmail(pg, email) {
  const { rows } = await pg.query(
    'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
    [email]
  );
  return rows[0] || null;
}

async function createUser(pg, email, passwordHash) {
  const { rows } = await pg.query(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
    [email, passwordHash]
  );
  return rows[0];
}

module.exports = { findByEmail, createUser };
