const fn = String.raw`async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const blockedHandles = new Set(['i', 'intent', 'share', 'home', 'search', 'notifications', 'messages', 'settings', 'compose', 'explore']);
  const cleanHandle = value => {
    const handle = String(value || '').replace(/^@/, '');
    if (!handle) return '';
    if (blockedHandles.has(handle.toLowerCase())) return '';
    if (handle === '-') return '';
    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return '';
    return handle;
  };
  const normalizeHandle = raw => {
    const value = String(raw || '').trim();
    const repairedMatch = value.match(/(?:^|[^A-Za-z0-9_.-])(?:https?:\/*)?(?:www\.)?(?:x|twitter)\.com\/+(@?[A-Za-z0-9_]{1,15})(?=$|[/?#\s])/i);
    const repaired = cleanHandle(repairedMatch && repairedMatch[1]);
    if (repaired) return repaired;
    try {
      const url = new URL(value, location.href);
      if (!['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'].includes(url.hostname.toLowerCase())) return '';
      const first = url.pathname.split('/').filter(Boolean)[0] || '';
      return cleanHandle(first);
    } catch {
      return '';
    }
  };
  const rowKey = row => {
    const text = row.innerText || row.textContent || '';
    const hrefs = [...row.querySelectorAll('a[href]')].map(a => a.href).join('|');
    return (text + ' ' + hrefs).replace(/\s+/g, ' ').trim();
  };
  const parseRow = row => {
    const text = (row.innerText || row.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const anchors = [...row.querySelectorAll('a[href]')].map(a => ({
      href: a.href,
      label: (a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim()
    }));
    const xSource = anchors.map(a => [a.href, a.label]).flat().find(value => normalizeHandle(value)) || '';
    const handle = normalizeHandle(xSource);
    const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [''])[0];
    const statusMatch = text.match(/Not Going|Pending Approval|Approve Decline|Approved|Going|Declined|Registered|Cancelled|Waitlist/i);
    const status = statusMatch ? (statusMatch[0].toLowerCase() === 'approve decline' ? 'Pending Approval' : statusMatch[0]) : '';
    let name = text;
    if (email) name = name.replace(email, ' ');
    if (status) name = name.replace(status, ' ');
    name = name.replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim();
    const emailIndex = text.indexOf(email);
    if (emailIndex > 0) name = text.slice(0, emailIndex).replace(/\s+/g, ' ').trim();
    return {name, email, status, xLink: xSource, handle, text};
  };
  const seen = new Map();
  let stable = 0;
  let lastSize = 0;
  for (let i = 0; i < 80; i++) {
    const rows = [...document.querySelectorAll('[role="row"], tr')];
    for (const row of rows) {
      const parsed = parseRow(row);
      if (!parsed) continue;
      const key = rowKey(row);
      if (!key || key.length < 6) continue;
      seen.set(key, parsed);
    }
    if (seen.size === lastSize) stable += 1;
    if (seen.size !== lastSize) stable = 0;
    lastSize = seen.size;
    if (stable >= 5) break;
    window.scrollBy(0, Math.max(600, Math.floor(window.innerHeight * 0.85)));
    await sleep(450);
  }
  const allRows = [...seen.values()];
  const pending = allRows.filter(row => row.status === 'Pending Approval');
  const candidates = pending.filter(row => row.handle).map(row => ({name: row.name, email: row.email, handle: row.handle, xLink: row.xLink, status: row.status}));
  const invalidX = pending.filter(row => !row.handle).map(row => ({name: row.name, email: row.email, xLink: row.xLink, status: row.status}));
  return {totalRows: allRows.length, pendingCount: pending.length, candidateCount: candidates.length, invalidXCount: invalidX.length, candidates, invalidX, allRows};
}`;

process.stdout.write(fn);
