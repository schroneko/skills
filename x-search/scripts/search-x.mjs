import { access, chmod, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);
const model = 'grok-4.5';
const officialProxy = 'https://cli-chat-proxy.grok.com/v1';
const home = process.env.HOME;

class SearchError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function parseArgs(argv) {
  const values = {
    handles: [],
    maxResults: 10,
    sort: 'relevance',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') {
      values.help = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      throw new SearchError('INVALID_ARGUMENT', `Missing value for ${arg}`);
    }
    if (arg === '--query') values.query = next;
    else if (arg === '--handle') values.handles.push(next.replace(/^@/, ''));
    else if (arg === '--from-date') values.fromDate = next;
    else if (arg === '--to-date') values.toDate = next;
    else if (arg === '--max-results') values.maxResults = Number(next);
    else if (arg === '--sort') values.sort = next;
    else throw new SearchError('INVALID_ARGUMENT', `Unknown argument: ${arg}`);
    index += 1;
  }
  return values;
}

function validateArgs(values) {
  if (!values.query?.trim()) throw new SearchError('INVALID_ARGUMENT', 'Missing --query');
  if (values.query.length > 2000) throw new SearchError('INVALID_ARGUMENT', '--query must be 2000 characters or fewer');
  if (!Number.isInteger(values.maxResults) || values.maxResults < 1 || values.maxResults > 20) {
    throw new SearchError('INVALID_ARGUMENT', '--max-results must be an integer from 1 to 20');
  }
  if (!['relevance', 'latest'].includes(values.sort)) {
    throw new SearchError('INVALID_ARGUMENT', '--sort must be relevance or latest');
  }
  if (values.handles.length > 10) throw new SearchError('INVALID_ARGUMENT', 'At most 10 --handle values are allowed');
  for (const handle of values.handles) {
    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new SearchError('INVALID_ARGUMENT', `Invalid X handle: ${handle}`);
  }
  for (const [name, date] of [['--from-date', values.fromDate], ['--to-date', values.toDate]]) {
    if (!date) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      throw new SearchError('INVALID_ARGUMENT', `${name} must be YYYY-MM-DD`);
    }
  }
  if (values.fromDate && values.toDate && values.fromDate > values.toDate) {
    throw new SearchError('INVALID_ARGUMENT', '--from-date must not be later than --to-date');
  }
}

function printUsage() {
  process.stdout.write([
    'Usage: node search-x.mjs --query <text> [options]',
    '',
    'Options:',
    '  --handle <name>       Restrict to an X account, repeatable up to 10 times',
    '  --from-date <date>    Start date in YYYY-MM-DD',
    '  --to-date <date>      End date in YYYY-MM-DD',
    '  --sort <mode>         relevance or latest',
    '  --max-results <n>     1 to 20, default 10',
    '  --help                Show this help',
    '',
  ].join('\n'));
}

function createEnvironment() {
  if (!home) throw new SearchError('ENVIRONMENT_ERROR', 'HOME is not set');
  const environment = {};
  for (const name of ['HOME', 'TMPDIR', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL']) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  Object.assign(environment, {
    PATH: [join(home, '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'),
    GROK_HOME: join(home, '.grok'),
    GROK_DISABLE_API_KEY_AUTH: '1',
    GROK_DISABLE_AUTOUPDATER: '1',
    GROK_CLI_CHAT_PROXY_BASE_URL: officialProxy,
    GROK_CLAUDE_SKILLS_ENABLED: 'false',
    GROK_CLAUDE_RULES_ENABLED: 'false',
    GROK_CLAUDE_AGENTS_ENABLED: 'false',
    GROK_CLAUDE_MCPS_ENABLED: 'false',
    GROK_CLAUDE_HOOKS_ENABLED: 'false',
    GROK_CURSOR_SKILLS_ENABLED: 'false',
    GROK_CURSOR_RULES_ENABLED: 'false',
    GROK_CURSOR_AGENTS_ENABLED: 'false',
    GROK_CURSOR_MCPS_ENABLED: 'false',
    GROK_CURSOR_HOOKS_ENABLED: 'false',
    GROK_MEMORY: '0',
    CI: '1',
    NO_COLOR: '1',
    RUST_LOG: 'error',
    TERM: 'dumb',
  });
  return environment;
}

async function findGrok() {
  const installed = join(home, '.local', 'bin', 'grok');
  try {
    await access(installed, constants.X_OK);
    return installed;
  } catch {
    return 'grok';
  }
}

async function runGrok(grok, args, environment, timeout, workDir) {
  try {
    return await execFileAsync(grok, args, {
      cwd: workDir,
      encoding: 'utf8',
      env: environment,
      maxBuffer: 8 * 1024 * 1024,
      timeout,
    });
  } catch (error) {
    if (error.code === 'ENOENT') throw new SearchError('GROK_NOT_FOUND', 'Install the official Grok Build CLI first');
    if (error.killed || error.signal) throw new SearchError('GROK_TIMEOUT', 'Grok Build did not finish before the timeout');
    throw new SearchError('GROK_FAILED', 'Grok Build failed without returning a safe search result');
  }
}

function parseJson(text, code) {
  try {
    return JSON.parse(text.trim());
  } catch {
    throw new SearchError(code, 'Grok Build returned invalid JSON');
  }
}

function stripTomlComment(line) {
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quoted) {
      escaped = true;
      continue;
    }
    if (character === '"') quoted = !quoted;
    if (character === '#' && !quoted) return line.slice(0, index);
  }
  return line;
}

async function rejectModelOverrides(inspect) {
  const paths = inspect.configSources?.layers?.map((layer) => layer.path).filter(Boolean) || [];
  for (const path of paths) {
    let content;
    try {
      content = await readFile(path, 'utf8');
    } catch {
      throw new SearchError('UNSAFE_CONFIG', `Cannot verify Grok configuration: ${path}`);
    }
    for (const rawLine of content.split('\n')) {
      const line = stripTomlComment(rawLine).trim();
      if (!line) continue;
      if (/^\[+\s*model\s*\./i.test(line)) {
        throw new SearchError('UNSAFE_CONFIG', 'A custom Grok model is configured');
      }
      if (/^\[+\s*endpoints(?:\.|\s*\])/i.test(line)) {
        throw new SearchError('UNSAFE_CONFIG', 'A custom Grok endpoint is configured');
      }
      if (/^\[+\s*(?:grok_com_config\.)?oidc(?:\.|\s*\])/i.test(line)) {
        throw new SearchError('UNSAFE_CONFIG', 'A custom Grok identity provider is configured');
      }
      if (/(?:api_key|env_key|base_url|extra_headers|models_base_url|cli_chat_proxy_base_url|web_search|auth_provider_command)\s*=/i.test(line)) {
        throw new SearchError('UNSAFE_CONFIG', 'A custom model, credential, or search override is configured');
      }
    }
  }
}

function collectObjects(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  output.push(value);
  for (const item of Object.values(value)) collectObjects(item, output);
  return output;
}

async function verifyOfficialModel() {
  const cachePath = join(home, '.grok', 'models_cache.json');
  let cache;
  try {
    cache = JSON.parse(await readFile(cachePath, 'utf8'));
  } catch {
    throw new SearchError('MODEL_UNAVAILABLE', 'Cannot verify the Grok Build model catalog');
  }
  const entry = collectObjects(cache).find((item) => item.id === model || item.model === model);
  if (!entry || entry.base_url !== officialProxy || entry.supports_backend_search !== true) {
    throw new SearchError('MODEL_UNAVAILABLE', 'The official Grok subscription search model is unavailable');
  }
}

async function preflight(grok, environment, workDir) {
  const versionResult = await runGrok(grok, ['--version'], environment, 30000, workDir);
  const version = versionResult.stdout.match(/grok\s+0\.2\.(\d+)/);
  if (!version || Number(version[1]) < 91) {
    throw new SearchError('UNSUPPORTED_GROK_VERSION', 'Grok Build 0.2.91 or newer is required');
  }
  const inspected = await runGrok(grok, ['inspect', '--json'], environment, 30000, workDir);
  const inspect = parseJson(inspected.stdout, 'PREFLIGHT_FAILED');
  if (inspect.loginPolicy?.apiKeyAuthDisabled !== true) {
    throw new SearchError('API_KEY_AUTH_ENABLED', 'Grok API key authentication is not disabled');
  }
  await rejectModelOverrides(inspect);
  let models = await runGrok(grok, ['models'], environment, 30000, workDir);
  if (!models.stdout.includes('logged in with grok.com')) {
    models = await runGrok(grok, ['models'], environment, 30000, workDir);
  }
  if (!models.stdout.includes('logged in with grok.com') || !models.stdout.includes(model)) {
    throw new SearchError('NOT_AUTHENTICATED', 'Run `grok login` with the subscribed Grok account');
  }
  await verifyOfficialModel();
}

function buildPrompt(values) {
  const constraints = [
    `Maximum results: ${values.maxResults}`,
    `Sort preference: ${values.sort}`,
  ];
  if (values.handles.length) constraints.push(`Accounts: ${values.handles.map((handle) => `@${handle}`).join(', ')}`);
  if (values.fromDate) constraints.push(`From date: ${values.fromDate}`);
  if (values.toDate) constraints.push(`To date: ${values.toDate}`);
  return [
    'Perform an X search for another agent.',
    'You must call the backend X search tools at least once. Use keyword, semantic, user, or thread search as appropriate.',
    'Do not use terminal commands, local files, MCP tools, generic web browsing, or prior memory.',
    'Return a concise answer in the same language as the search request.',
    'For every result, include the exact canonical https://x.com URL, author, publication time when available, and a short relevance summary.',
    'Never invent a URL or present an unsupported claim. State clearly when no matching result is found.',
    '',
    `Search request: ${values.query.trim()}`,
    ...constraints,
  ].join('\n');
}

async function readXSearchCalls(sessionId, workDir) {
  const sessionRoot = join(home, '.grok', 'sessions', encodeURIComponent(workDir), sessionId);
  const chatPath = join(sessionRoot, 'chat_history.jsonl');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const lines = (await readFile(chatPath, 'utf8')).split('\n').filter(Boolean);
      const calls = [];
      for (const line of lines) {
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type === 'backend_tool_call' && event.kind?.tool_type === 'x_search') {
          calls.push(event.kind.name || 'x_search');
        }
      }
      return calls;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new SearchError('SEARCH_NOT_VERIFIED', 'Cannot verify that backend X search was executed');
}

function extractXUrls(answer) {
  const urls = [];
  const pattern = /https:\/\/x\.com\/([A-Za-z0-9_]{1,15})(?:\/status\/(\d+))?/g;
  for (const match of answer.matchAll(pattern)) {
    const url = match[2] ? `https://x.com/${match[1]}/status/${match[2]}` : `https://x.com/${match[1]}`;
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

async function search(values) {
  const environment = createEnvironment();
  const grok = await findGrok();
  const temporaryDir = await mkdtemp(join(tmpdir(), 'x-search-'));
  await chmod(temporaryDir, 0o700);
  const workDir = await realpath(temporaryDir);
  const promptPath = join(workDir, 'prompt.txt');
  try {
    await preflight(grok, environment, workDir);
    await writeFile(promptPath, buildPrompt(values), { encoding: 'utf8', mode: 0o600 });
    const args = [
      '--cwd', workDir,
      '--prompt-file', promptPath,
      '-m', model,
      '--disallowed-tools', 'run_terminal_cmd,read_file,search_replace,grep,list_dir,web_fetch,todo_write,task,search_tool,use_tool,lsp,Agent',
      '--deny', 'Bash',
      '--deny', 'Read',
      '--deny', 'Edit',
      '--deny', 'Write',
      '--deny', 'Grep',
      '--deny', 'MCPTool',
      '--no-memory',
      '--max-turns', '4',
      '--sandbox', 'strict',
      '--output-format', 'json',
      '--verbatim',
      '--no-auto-update',
    ];
    const result = await runGrok(grok, args, environment, 180000, workDir);
    const response = parseJson(result.stdout, 'INVALID_RESPONSE');
    if (response.type === 'error' || typeof response.text !== 'string' || !response.sessionId) {
      throw new SearchError('INVALID_RESPONSE', 'Grok Build did not return a completed search response');
    }
    const calls = await readXSearchCalls(response.sessionId, workDir);
    if (calls.length === 0) throw new SearchError('NO_X_SEARCH', 'Grok Build answered without executing backend X search');
    const xUrls = extractXUrls(response.text);
    if (xUrls.length === 0) throw new SearchError('NO_CITATIONS', 'Backend X search returned no citable x.com URL');
    return {
      success: true,
      query: values.query,
      model,
      auth: 'grok.com subscription session',
      answer: response.text,
      x_urls: xUrls,
      post_urls: xUrls.filter((url) => /\/status\/\d+$/.test(url)),
      x_search: {
        call_count: calls.length,
        tools: [...new Set(calls)],
      },
    };
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }
}

try {
  const values = parseArgs(process.argv.slice(2));
  if (values.help) {
    printUsage();
    process.exit(0);
  }
  validateArgs(values);
  const result = await search(values);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  const code = error instanceof SearchError ? error.code : 'INTERNAL_ERROR';
  const message = error instanceof SearchError ? error.message : 'X search failed unexpectedly';
  process.stdout.write(`${JSON.stringify({ success: false, error: { code, message } }, null, 2)}\n`);
  process.exitCode = 1;
}
