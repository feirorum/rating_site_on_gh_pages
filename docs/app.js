const apiBase = "https://api.github.com";
const cfg = window.RH_CONFIG;

// Parse Link header for pagination
function parseLinkHeader(linkHeader) {
  if (!linkHeader) return {};
  const links = {};
  const parts = linkHeader.split(',');
  for (const part of parts) {
    const [urlPart, relPart] = part.split(';');
    const url = urlPart.trim().slice(1, -1);
    const rel = relPart.match(/rel="(.+)"/)?.[1];
    if (rel) links[rel] = url;
  }
  return links;
}

// GitHub API helper
async function gh(url) {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/vnd.github+json' }
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const data = await res.json();
  const links = parseLinkHeader(res.headers.get('Link'));
  return { data, links };
}

// List all issues with a specific label
async function listAllIssuesWithLabel(label) {
  let url = `${apiBase}/repos/${cfg.owner}/${cfg.repo}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=${cfg.perPage}&page=1`;
  const out = [];
  while (url) {
    const { data, links } = await gh(url);
    out.push(...data.filter(i => !i.pull_request));
    url = links?.next || null;
  }
  return out;
}

// List all comments for an issue
async function listAllComments(issueNumber) {
  let url = `${apiBase}/repos/${cfg.owner}/${cfg.repo}/issues/${issueNumber}/comments?per_page=${cfg.perPage}&page=1`;
  const out = [];
  while (url) {
    const { data, links } = await gh(url);
    out.push(...data);
    url = links?.next || null;
  }
  return out;
}

// Parse YAML front-matter from issue body
function parseFrontMatter(body) {
  const m = body.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const yaml = m[1];
  const obj = {};

  // Simple YAML parser for key: value pairs
  let currentKey = null;
  let currentValue = '';

  yaml.split(/\r?\n/).forEach(line => {
    const keyMatch = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (keyMatch) {
      // Save previous key if exists
      if (currentKey) {
        obj[currentKey] = currentValue.trim();
      }
      currentKey = keyMatch[1];
      currentValue = keyMatch[2];

      // Handle multiline indicator (>)
      if (currentValue === '>') {
        currentValue = '';
      }
    } else if (currentKey && line.trim()) {
      // Continuation of multiline value
      currentValue += (currentValue ? ' ' : '') + line.trim();
    }
  });

  // Save last key
  if (currentKey) {
    obj[currentKey] = currentValue.trim();
  }

  return obj;
}

// Extract ratings from comments
function extractRatings(comments) {
  // Use latest rating per user
  const latestByUser = new Map();
  for (const c of comments) {
    const firstLine = (c.body || "").split(/\r?\n/)[0].trim();
    const m = firstLine.match(/^rating:\s*([1-5])$/i);
    if (m) {
      latestByUser.set(c.user.login, {
        value: parseInt(m[1], 10),
        date: c.created_at
      });
    }
  }
  const values = [...latestByUser.values()].map(x => x.value);
  const count = values.length;
  const avg = count ? (values.reduce((a,b)=>a+b,0) / count) : 0;
  return { avg, count };
}

// Helper to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Convert issue to card data
function issueToCardData(issue) {
  const fm = parseFrontMatter(issue.body || "");
  return {
    number: issue.number,
    title: issue.title.replace(/^\[Item\]\s*/i, ''),
    url: fm.url || '',
    thumb: fm.thumbnail || '',
    summary: fm.summary || '',
    gh: issue.html_url,
  };
}

// Render a list of issues as cards
function renderCardList(root, issues) {
  root.innerHTML = '';
  if (issues.length === 0) {
    root.innerHTML = '<p class="empty">No items yet.</p>';
    return;
  }

  for (const iss of issues) {
    const d = issueToCardData(iss);
    const el = document.createElement('article');
    el.className = 'card';
    el.innerHTML = `
      ${d.thumb ? `<a class="thumb" href="item.html?id=${d.number}">
        <img src="${d.thumb}" alt="" onerror="this.style.display='none'"/>
      </a>` : ''}
      <h3><a href="item.html?id=${d.number}">${escapeHtml(d.title)}</a></h3>
      <p class="summary">${escapeHtml(d.summary).slice(0, 240)}${d.summary.length > 240 ? '...' : ''}</p>
      <div class="links">
        <a href="${d.gh}" target="_blank" rel="noopener">GitHub</a>
        ${d.url ? `<a href="${d.url}" target="_blank" rel="noopener">Source</a>` : ''}
      </div>`;
    root.appendChild(el);
  }
}

// URL helpers
function toIssueUrl(n) {
  return `https://github.com/${cfg.owner}/${cfg.repo}/issues/${n}`;
}

function toNewIssueUrl() {
  return `https://github.com/${cfg.owner}/${cfg.repo}/issues/new?template=item.yml`;
}
