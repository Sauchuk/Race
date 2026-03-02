const { kv } = require('@vercel/kv');
const checkpointData = require('../data/checkpoints.json');

const CHECKPOINT_ORDER = ['START', 'C1', 'C2', 'C3', 'C4', 'FINISH'];
const MIN_COMPLETION_MS = 180000;
const NAME_PATTERN = /^[A-Za-z0-9 ]{3,20}$/;

function getTodayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function formatMs(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function sanitizeName(name) {
  return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
}

function json(res, code, payload) {
  res.status(code).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function methodNotAllowed(res) {
  json(res, 405, { ok: false, reason: 'method_not_allowed' });
}

function badRequest(res, reason) {
  json(res, 400, { ok: false, reason });
}

function parseBody(req) {
  if (typeof req.body === 'object' && req.body !== null) {
    return req.body;
  }

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      return null;
    }
  }

  return null;
}

function isValidCheckpoint(cp) {
  return CHECKPOINT_ORDER.includes(cp);
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

module.exports = {
  kv,
  checkpointData,
  CHECKPOINT_ORDER,
  MIN_COMPLETION_MS,
  NAME_PATTERN,
  getTodayKey,
  formatMs,
  sanitizeName,
  json,
  methodNotAllowed,
  badRequest,
  parseBody,
  isValidCheckpoint,
  getClientIp
};
