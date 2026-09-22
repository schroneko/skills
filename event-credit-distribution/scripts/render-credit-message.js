'use strict';

const fs = require('node:fs');

const CODEX_PREFIX = 'chatgpt.com/codex/p/';
const CODEX_URL_PATTERN = /^(?:https:\/\/)?chatgpt\.com\/codex\/p\/([A-Za-z0-9_-]+)$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;
const API_CODE_PATTERN = /^[A-Za-z0-9_-]{16}$/;

function invalid(message) {
  const error = new Error(message);
  error.code = 'INVALID_CREDIT_MESSAGE';
  throw error;
}

function occurrences(value, needle) {
  return value.split(needle).length - 1;
}

function normalizeCodexUrl(value) {
  if (typeof value !== 'string') invalid('codex_url must be a string');
  const raw = value.trim();
  if (!raw || raw.includes('XXX')) invalid('codex_url contains an empty or unresolved placeholder');
  if (occurrences(raw, CODEX_PREFIX) > 1) invalid('codex_url contains a nested Codex URL prefix');
  const urlMatch = raw.match(CODEX_URL_PATTERN);
  if (urlMatch) return `${CODEX_PREFIX}${urlMatch[1]}`;
  if (TOKEN_PATTERN.test(raw)) return `${CODEX_PREFIX}${raw}`;
  invalid('codex_url is neither a canonical Codex URL nor a bare token');
}

function renderCreditMessage({ template, codex_url: codexUrl, api_code: apiCode }) {
  if (typeof template !== 'string' || template.length === 0) invalid('template must be a non-empty string');
  const normalizedCodexUrl = normalizeCodexUrl(codexUrl);
  if (typeof apiCode !== 'string' || !API_CODE_PATTERN.test(apiCode.trim()) || apiCode.trim() === 'XXX') {
    invalid('api_code must be a 16-character code');
  }
  const normalizedApiCode = apiCode.trim();
  if (occurrences(template, '{{codex_url}}') !== 1) invalid('template must contain {{codex_url}} exactly once');
  if (occurrences(template, '{{api_code}}') !== 1) invalid('template must contain {{api_code}} exactly once');
  const message = template.replace('{{codex_url}}', normalizedCodexUrl).replace('{{api_code}}', normalizedApiCode);
  if (occurrences(message, normalizedCodexUrl) !== 1) invalid('rendered message must contain the Codex URL exactly once');
  if (occurrences(message, normalizedApiCode) !== 1) invalid('rendered message must contain the API code exactly once');
  if (message.includes('chatgpt.com/codex/p/chatgpt.com/codex/p/')) invalid('rendered message contains a nested Codex URL prefix');
  if (message.includes('XXX') || message.includes('{{') || message.includes('}}')) invalid('rendered message contains an unresolved placeholder');
  return {
    message,
    message_length: message.length,
  };
}

if (require.main === module) {
  try {
    const input = fs.readFileSync(0, 'utf8').trim();
    if (!input) invalid('JSON input is required');
    process.stdout.write(renderCreditMessage(JSON.parse(input)).message);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { normalizeCodexUrl, renderCreditMessage };
