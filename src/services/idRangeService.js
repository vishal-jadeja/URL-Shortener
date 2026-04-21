const { claimRange } = require('../models/idRangeModel');
const config = require('../config');

const state = { current: null, max: null };
let claimInFlight = null;

async function _doClaimRange(pg) {
  const { range_start } = await claimRange(pg, config.idRangeSize);
  state.current = Number(range_start);
  state.max = state.current + config.idRangeSize;
}

async function claimNewRange(pg) {
  if (claimInFlight) return claimInFlight;
  claimInFlight = _doClaimRange(pg).finally(() => {
    claimInFlight = null;
  });
  return claimInFlight;
}

async function nextId(pg) {
  if (state.current === null || state.current >= state.max) {
    await claimNewRange(pg);
  }
  return state.current++;
}

module.exports = { nextId };
