import fs from 'node:fs/promises';

function paths(options) {
  const workspaceDir = options.workspaceDir;
  return {
    membersJson: options.membersJson || `${workspaceDir}/x-role-members-verified.json`,
    progressJson: options.progressJson || `${workspaceDir}/x-role-follow-audit-progress.json`,
    progressCsv: options.progressCsv || `${workspaceDir}/x-role-follow-audit-progress.csv`,
    candidatesJson: options.candidatesJson || `${workspaceDir}/x-role-candidates-final.json`,
    candidatesCsv: options.candidatesCsv || `${workspaceDir}/x-role-candidates-final.csv`
  };
}

function escCsv(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeRows(jsonPath, csvPath, rows) {
  await fs.writeFile(jsonPath, JSON.stringify(rows, null, 2));
  const headers = ['page', 'row_index', 'discord_display', 'discord_username', 'connection_status', 'x_handle', 'x_url', 'follow_status', 'evidence', 'page_title', 'error'];
  await fs.writeFile(csvPath, `${headers.join(',')}\n${rows.map((row) => headers.map((header) => escCsv(row[header])).join(',')).join('\n')}\n`);
}

async function getDiscordTab(browser, guildId) {
  const urlPart = `discord.com/channels/${guildId}/member-safety`;
  const tabs = await browser.user.openTabs();
  const info = tabs.find((tab) => (tab.url || '').includes(urlPart));
  const tab = info ? await browser.user.claimTab(info) : await browser.tabs.new();
  if (!info) {
    await tab.goto(`https://discord.com/channels/${guildId}/member-safety`);
    await tab.playwright.waitForLoadState({ state: 'domcontentloaded', timeoutMs: 15000 }).catch(() => {});
    await tab.playwright.waitForTimeout(5000);
  }
  return tab;
}

async function closeDialog(tab) {
  try {
    const closeCount = await tab.playwright.getByRole('button', { name: 'Close' }).count();
    if (closeCount > 0) {
      await tab.playwright.getByRole('button', { name: 'Close' }).last().click({ timeoutMs: 1000 });
      await tab.playwright.waitForTimeout(200);
    }
  } catch {}
  try {
    await tab.playwright.locator('body').press('Escape', { timeoutMs: 400 });
  } catch {}
}

async function clearSearch(tab) {
  try {
    await tab.playwright.getByRole('button', { name: 'Clear' }).click({ timeoutMs: 1200 });
    await tab.playwright.waitForTimeout(1000);
  } catch {}
}

async function ensureRole(tab, roleName) {
  await closeDialog(tab);
  await clearSearch(tab);
  try {
    await tab.playwright.getByRole('button', { name: 'Roles' }).click({ timeoutMs: 5000 });
    await tab.playwright.waitForTimeout(600);
    const roleItem = tab.playwright.getByRole('menuitemcheckbox', { name: roleName, exact: true });
    const checked = await roleItem.getAttribute('aria-checked', { timeoutMs: 5000 }).catch(() => null);
    if (checked !== 'true') {
      await roleItem.click({ timeoutMs: 5000 });
    }
    await tab.playwright.waitForTimeout(2200);
    await tab.playwright.locator('body').press('Escape', { timeoutMs: 800 }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

async function openProfile(tab, target) {
  await closeDialog(tab);
  const search = tab.playwright.getByPlaceholder('Search by username or id');
  await search.fill(target.discord_username, { timeoutMs: 5000 });
  await tab.playwright.waitForTimeout(700);
  const rowCount = await tab.playwright.locator('table tbody tr').count();
  if (rowCount === 0) throw new Error(`no member row for ${target.discord_username}`);
  try {
    await tab.playwright.getByText(target.discord_display, { exact: true }).first().click({ timeoutMs: 2000 });
  } catch {
    await tab.playwright.locator('table tbody tr').nth(0).locator('td').first().click({ timeoutMs: 2000 });
  }
  await tab.playwright.waitForTimeout(900);
}

function extractX(snapshot) {
  const urls = [...snapshot.matchAll(/\/url:\s*(https:\/\/(?:x|twitter)\.com\/[A-Za-z0-9_]+)/g)].map((match) => match[1]);
  const filtered = urls.filter((url) => !/\/intent\//.test(url)).map((url) => url.replace('twitter.com', 'x.com'));
  if (filtered.length) return filtered[0];
  const plainUrls = [...snapshot.matchAll(/https:\/\/(?:x|twitter)\.com\/[A-Za-z0-9_]+/g)].map((match) => match[0].replace('twitter.com', 'x.com'));
  return plainUrls.find((url) => !/\/intent\//.test(url)) || '';
}

async function checkX(tab, url) {
  await tab.goto(url);
  await tab.playwright.waitForLoadState({ state: 'domcontentloaded', timeoutMs: 9000 }).catch(() => {});
  await tab.playwright.waitForTimeout(2300);
  let snapshot = '';
  let text = '';
  try {
    snapshot = await tab.playwright.domSnapshot();
  } catch {}
  try {
    text = await tab.playwright.locator('body').innerText({ timeoutMs: 3200 });
  } catch {}
  const combined = `${snapshot}\n${text}`;
  const pageTitle = await tab.title().catch(() => '');
  if (/フォローされています|Follows you/.test(combined)) return { follow_status: 'follows_you', evidence: 'フォローされています', page_title: pageTitle };
  if (/しばらくしてから|rate limit|Too Many Requests|やりなおしてください|Try again later/i.test(combined)) return { follow_status: 'x_rate_limited_or_retry', evidence: 'X showed retry/rate-limit-like text', page_title: pageTitle };
  if (/このアカウントは存在しません|存在しません|Account doesn.?t exist|問題が発生しました|Something went wrong|This account doesn.?t exist|プロフィールは存在しません/.test(combined)) return { follow_status: 'profile_unavailable', evidence: 'profile unavailable/error text shown', page_title: pageTitle };
  if (/ポストは非公開です|These posts are protected/.test(combined)) return { follow_status: 'not_following', evidence: 'protected account page shown, no follows-you label found', page_title: pageTitle };
  return { follow_status: 'not_following', evidence: 'no follows-you label found on profile', page_title: pageTitle };
}

export async function runAuditBatch(browser, options) {
  const config = {
    roleName: 'X',
    limit: 5,
    excludeDiscordUsernames: [],
    ...options
  };
  const p = paths(config);
  const members = await readJson(p.membersJson, []);
  const progress = await readJson(p.progressJson, []);
  const done = new Set(progress.map((row) => row.discord_username));
  const excluded = new Set(config.excludeDiscordUsernames);
  const targets = members.filter((member) => !excluded.has(member.discord_username) && !done.has(member.discord_username)).slice(0, config.limit);
  const discordTab = await getDiscordTab(browser, config.guildId);
  const roleOk = await ensureRole(discordTab, config.roleName);
  const batch = [];
  for (const target of targets) {
    const row = {
      page: target.page,
      row_index: target.row_index,
      discord_display: target.discord_display,
      discord_username: target.discord_username,
      connection_status: 'unknown',
      x_handle: '',
      x_url: '',
      follow_status: 'not_checked',
      evidence: '',
      page_title: '',
      error: ''
    };
    try {
      await openProfile(discordTab, target);
      const snapshot = await discordTab.playwright.domSnapshot();
      const xUrl = extractX(snapshot);
      if (!xUrl) {
        row.connection_status = 'no_x_connection_found';
        row.evidence = 'Discord profile opened, no X connection link in Connections snapshot';
      } else {
        row.connection_status = 'x_connection_found';
        row.x_url = xUrl;
        row.x_handle = (xUrl.match(/x\.com\/([A-Za-z0-9_]+)/) || [, ''])[1];
      }
    } catch (error) {
      row.connection_status = row.connection_status === 'unknown' ? 'error' : row.connection_status;
      row.follow_status = 'error';
      row.error = error && error.message ? error.message : String(error);
    }
    batch.push(row);
    await closeDialog(discordTab);
  }
  await Promise.all(batch.filter((row) => row.x_url && row.follow_status !== 'error').map(async (row) => {
    const xTab = await browser.tabs.new();
    try {
      Object.assign(row, await checkX(xTab, row.x_url));
    } catch (error) {
      row.follow_status = 'error';
      row.error = error && error.message ? error.message : String(error);
    } finally {
      await xTab.close().catch(() => {});
    }
  }));
  progress.push(...batch);
  await writeRows(p.progressJson, p.progressCsv, progress);
  const counts = progress.reduce((acc, row) => {
    acc[row.follow_status] = (acc[row.follow_status] || 0) + 1;
    return acc;
  }, {});
  return {
    roleOk,
    processedThisBatch: batch.length,
    totalProgress: progress.length,
    counts,
    notOk: progress.filter((row) => row.follow_status !== 'follows_you' || row.connection_status !== 'x_connection_found').length,
    batch
  };
}

export async function writeCandidates(options) {
  const p = paths(options);
  const progress = await readJson(p.progressJson, []);
  const candidates = progress.filter((row) => row.follow_status !== 'follows_you' || row.connection_status !== 'x_connection_found');
  await writeRows(p.candidatesJson, p.candidatesCsv, candidates);
  return { progress: progress.length, candidates: candidates.length };
}
