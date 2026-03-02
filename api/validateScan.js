const { checkpointData, json, methodNotAllowed, badRequest, parseBody, isValidCheckpoint } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  const body = parseBody(req);
  if (!body) {
    return badRequest(res, 'invalid_json');
  }

  const cp = typeof body.cp === 'string' ? body.cp.trim().toUpperCase() : '';
  const tok = typeof body.tok === 'string' ? body.tok.trim() : '';

  if (!isValidCheckpoint(cp) || !tok) {
    return badRequest(res, 'invalid_payload');
  }

  const record = checkpointData[cp];
  const valid = Boolean(record && record.active && record.tok === tok);

  return json(res, 200, {
    valid,
    cp,
    reason: valid ? undefined : 'token_mismatch_or_inactive'
  });
};
