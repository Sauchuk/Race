const { kv, formatMs, getTodayKey, json } = require('./_lib');

async function fetchBoardRows(boardKey) {
  const ids = await kv.zrange(boardKey, 0, 9);
  if (!ids.length) {
    return [];
  }

  const runs = await Promise.all(ids.map((id) => kv.get(`run:${id}`)));
  return runs
    .filter(Boolean)
    .map((run, index) => ({
      rank: index + 1,
      name: run.name,
      totalMs: run.totalMs,
      time: formatMs(run.totalMs),
      timestamp: run.finishedAtIso
    }));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { ok: false, reason: 'method_not_allowed' });
  }

  const scope = typeof req.query.scope === 'string' ? req.query.scope : 'today';
  const today = getTodayKey();
  const boardKey = scope === 'alltime' ? 'leaderboard:alltime' : `leaderboard:today:${today}`;

  const rows = await fetchBoardRows(boardKey);
  return json(res, 200, { rows });
};
