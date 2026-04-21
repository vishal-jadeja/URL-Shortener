async function claimRange(pg, rangeSize) {
  const { rows } = await pg.query(
    `WITH next AS (SELECT nextval('id_range_seq') AS seq_val)
     INSERT INTO id_ranges (range_start)
     SELECT seq_val * $1 FROM next
     RETURNING range_start`,
    [rangeSize]
  );
  return rows[0];
}

module.exports = { claimRange };
