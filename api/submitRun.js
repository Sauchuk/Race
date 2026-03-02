const crypto = require('crypto');
const {
  kv,
  CHECKPOINT_ORDER,
  MIN_COMPLETION_MS,
  NAME_PATTERN,
  getTodayKey,
  sanitizeName,
  json,
  methodNotAllowed,
  badRequest,
  parseBody,
  getClientIp
} = require('./_lib');

const RATE_LIMIT_WINDOW_S = 60;
const RATE_LIMIT_MAX = 10;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  const body = parseBody(req);
  if (!body) {
    return badRequest(res, 'invalid_json');
  }

  const name = sanitizeName(body.name);
  const totalMs = Number(body.totalMs);
  const checkpoints = Array.isArray(body.checkpoints) ? body.checkpoints : [];
  const startedAtIso = typeof body.startedAtIso === 'string' ? body.startedAtIso : '';
  const finishedAtIso = typeof body.finishedAtIso === 'string' ? body.finishedAtIso : '';
  const deviceHash = typeof body.deviceHash === 'string' ? body.deviceHash.trim() : '';

  if (!NAME_PATTERN.test(name)) {
    return badRequest(res, 'invalid_name');
  }

  if (!Number.isFinite(totalMs) || totalMs < MIN_COMPLETION_MS) {
    return badRequest(res, 'too_fast_or_invalid_time');
  }

  const normalizedCheckpoints = checkpoints.map((cp) => (typeof cp === 'string' ? cp.toUpperCase() : '')).filter(Boolean);
  const unique = [...new Set(normalizedCheckpoints)];

  const hasAllCheckpoints = CHECKPOINT_ORDER.every((cp) => unique.includes(cp));
  if (!hasAllCheckpoints || unique.length !== CHECKPOINT_ORDER.length) {
    return badRequest(res, 'invalid_checkpoints');
  }

  const startedAt = Date.parse(startedAtIso);
  const finishedAt = Date.parse(finishedAtIso);
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt <= startedAt) {
    return badRequest(res, 'invalid_timestamps');
  }

  const derivedMs = finishedAt - startedAt;
  if (Math.abs(derivedMs - totalMs) > 5000) {
    return badRequest(res, 'timestamp_mismatch');
  }

  const ip = getClientIp(req);
  const rateKey = `ratelimit:submit:${deviceHash || 'no_device'}:${ip}`;
  const rateCount = await kv.incr(rateKey);
  if (rateCount === 1) {
    await kv.expire(rateKey, RATE_LIMIT_WINDOW_S);
  }
  if (rateCount > RATE_LIMIT_MAX) {
    return json(res, 429, { ok: false, reason: 'rate_limited' });
  }

  const today = getTodayKey(new Date(startedAt));
  const nameDayHash = crypto.createHash('sha256').update(`${today}::${name.toLowerCase()}`).digest('hex');
  const dailyBestKey = `dailybest:${today}:${nameDayHash}`;
  const existingBest = await kv.get(dailyBestKey);

  if (existingBest && Number(existingBest.totalMs) <= totalMs) {
    return json(res, 200, { ok: true, reason: 'not_better_than_daily_best' });
  }

  const previousRunId = existingBest?.runId || null;
  const runId = crypto.randomUUID();
  const run = {
    id: runId,
    name,
    totalMs,
    checkpoints: CHECKPOINT_ORDER,
    startedAtIso,
    finishedAtIso,
    deviceHash: deviceHash || null,
    ipHash: crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16),
    createdAtIso: new Date().toISOString(),
    day: today
  };

  const runKey = `run:${runId}`;
  const todayBoardKey = `leaderboard:today:${today}`;
  const allTimeBoardKey = 'leaderboard:alltime';

  const operations = [
    kv.set(runKey, run),
    kv.set(dailyBestKey, { runId, totalMs }),
    kv.zadd(todayBoardKey, { score: totalMs, member: runId }),
    kv.zadd(allTimeBoardKey, { score: totalMs, member: runId })
  ];

  if (previousRunId) {
    operations.push(kv.zrem(todayBoardKey, previousRunId));
    operations.push(kv.zrem(allTimeBoardKey, previousRunId));
  }

  await Promise.all(operations);

  return json(res, 200, { ok: true, id: runId });
};
