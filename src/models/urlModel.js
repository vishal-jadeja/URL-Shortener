async function insertUrl(pg, { id, code, originalUrl, userId }) {
  const { rows } = await pg.query(
    `INSERT INTO urls (id, code, original_url, user_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, code, original_url, user_id, created_at`,
    [id, code, originalUrl, userId]
  );
  return rows[0];
}

async function findByCode(pg, code) {
  const { rows } = await pg.query(
    'SELECT id, code, original_url, user_id, is_active FROM urls WHERE code = $1',
    [code]
  );
  return rows[0] || null;
}

async function findByUserId(pg, userId, { limit = 20, offset = 0 } = {}) {
  const { rows } = await pg.query(
    `SELECT id, code, original_url, created_at, is_active
     FROM urls
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return rows;
}

module.exports = { insertUrl, findByCode, findByUserId };
