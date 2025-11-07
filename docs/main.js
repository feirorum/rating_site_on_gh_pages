(function(){
  const config = window.RATINGS_HUB_CONFIG || {};
  const API_ROOT = 'https://api.github.com';
  const ITEMS_LABEL = config.label || 'type:item';
  const REPO_PATH = config.owner && config.repo ? `${config.owner}/${config.repo}` : '';

  function assertConfig() {
    if (!REPO_PATH) {
      throw new Error('RATINGS_HUB_CONFIG.owner and RATINGS_HUB_CONFIG.repo must be defined.');
    }
  }

  function headers() {
    return {
      'Accept': 'application/vnd.github+json'
    };
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, Object.assign({ headers: headers() }, options || {}));
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API error (${res.status}): ${text}`);
    }
    return res.json();
  }

  async function fetchIssues() {
    assertConfig();
    const url = `${API_ROOT}/repos/${REPO_PATH}/issues?state=open&labels=${encodeURIComponent(ITEMS_LABEL)}&per_page=100&sort=created&direction=desc`;
    return fetchJson(url);
  }

  async function fetchIssue(number) {
    assertConfig();
    const url = `${API_ROOT}/repos/${REPO_PATH}/issues/${number}`;
    return fetchJson(url);
  }

  async function fetchComments(url) {
    return fetchJson(url + '?per_page=100');
  }

  function parseFrontMatter(body) {
    const result = {
      meta: {},
      content: body || ''
    };
    if (!body) return result;
    const match = body.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    if (!match) return result;
    const raw = match[1];
    const rest = match[2];
    const meta = {};
    const lines = raw.split(/\r?\n/);
    let currentKey = null;
    for (const line of lines) {
      if (!line.trim()) continue;
      if (/^\s/.test(line) && currentKey) {
        meta[currentKey] = (meta[currentKey] ? meta[currentKey] + '\n' : '') + line.trim();
        continue;
      }
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if (value === '>' || value === '|') {
        currentKey = key;
        if (!(key in meta)) meta[key] = '';
        continue;
      }
      currentKey = key;
      meta[key] = value;
    }
    for (const k of Object.keys(meta)) {
      meta[k] = meta[k].trim();
    }
    result.meta = meta;
    result.content = rest;
    return result;
  }

  function fallbackField(body, key) {
    const pattern = new RegExp(`^${key}\\s*:\\s*(.+)$`, 'im');
    const match = (body || '').match(pattern);
    return match ? match[1].trim() : '';
  }

  function extractItem(issue) {
    const { meta, content } = parseFrontMatter(issue.body || '');
    const url = meta.url || fallbackField(issue.body, 'url');
    const thumbnail = meta.thumbnail || fallbackField(issue.body, 'thumbnail');
    const summary = meta.summary || fallbackField(issue.body, 'summary') || content.trim();
    return {
      number: issue.number,
      title: issue.title,
      url,
      thumbnail,
      summary,
      created_at: issue.created_at,
      html_url: issue.html_url,
      user: issue.user
    };
  }

  function ratingStats(comments) {
    const regex = /^rating:\s*([1-5])$/i;
    const ratings = [];
    const detail = [];
    for (const comment of comments) {
      const firstLine = (comment.body || '').split(/\r?\n/)[0].trim();
      const match = firstLine.match(regex);
      if (match) {
        const value = parseInt(match[1], 10);
        ratings.push({ value, comment });
      }
      detail.push(comment);
    }
    const count = ratings.length;
    const total = ratings.reduce((sum, r) => sum + r.value, 0);
    const average = count ? total / count : 0;
    return { count, average, ratings, comments: detail };
  }

  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderError(container, message) {
    container.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
  }

  async function initHome() {
    const latestList = document.getElementById('latestItems');
    const topList = document.getElementById('topItems');
    const errorBox = document.getElementById('homeError');
    try {
      const issues = await fetchIssues();
      const items = issues.map(extractItem);
      renderLatest(items.slice(0, 5), latestList);
      const enriched = await Promise.all(items.map(async (item, idx) => {
        const issue = issues[idx];
        const comments = issue.comments ? await fetchComments(issue.comments_url) : [];
        const stats = ratingStats(comments);
        return Object.assign({}, item, { stats });
      }));
      const topCandidates = enriched
        .filter(item => item.stats.count > 0)
        .sort((a, b) => {
          if (b.stats.average !== a.stats.average) return b.stats.average - a.stats.average;
          if (b.stats.count !== a.stats.count) return b.stats.count - a.stats.count;
          return new Date(b.created_at) - new Date(a.created_at);
        })
        .slice(0, 5);
      renderTop(topCandidates, topList);
      if (topCandidates.length === 0) {
        topList.innerHTML = '<li>No ratings yet. Be the first to add one!</li>';
      }
    } catch (err) {
      console.error(err);
      renderError(errorBox, err.message);
    }
  }

  function renderLatest(items, container) {
    if (!items.length) {
      container.innerHTML = '<li>No items yet.</li>';
      return;
    }
    container.innerHTML = items.map(item => renderItemListEntry(item)).join('');
  }

  function renderTop(items, container) {
    if (!items.length) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = items.map(item => {
      const avg = item.stats.average.toFixed(2);
      return `<li>
        <a href="item.html?id=${item.number}">${escapeHtml(item.title)}</a>
        <span class="meta">⭐ ${avg} (${item.stats.count} ratings)</span>
      </li>`;
    }).join('');
  }

  function renderItemListEntry(item) {
    const parts = [];
    parts.push(`<a href="item.html?id=${item.number}">${escapeHtml(item.title)}</a>`);
    if (item.summary) {
      parts.push(`<p>${escapeHtml(item.summary)}</p>`);
    }
    return `<li>${parts.join('')}</li>`;
  }

  async function initItem() {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    const errorBox = document.getElementById('itemError');
    const container = document.getElementById('itemContainer');
    if (!id) {
      renderError(errorBox, 'Missing item id parameter.');
      return;
    }
    try {
      const issue = await fetchIssue(id);
      const item = extractItem(issue);
      const comments = issue.comments ? await fetchComments(issue.comments_url) : [];
      const stats = ratingStats(comments);
      renderItemDetail(item, stats);
      renderComments(comments);
    } catch (err) {
      console.error(err);
      renderError(errorBox, err.message);
    }
  }

  function renderItemDetail(item, stats) {
    const container = document.getElementById('itemContainer');
    const avgText = stats.count ? `${stats.average.toFixed(2)} (${stats.count} ratings)` : 'No ratings yet';
    const thumbnail = item.thumbnail ? `<img src="${escapeHtml(item.thumbnail)}" alt="Thumbnail for ${escapeHtml(item.title)}"/>` : '';
    container.innerHTML = `
      <h1>${escapeHtml(item.title)}</h1>
      <div class="meta">Submitted by <a href="https://github.com/${escapeHtml(item.user.login)}">@${escapeHtml(item.user.login)}</a> on ${new Date(item.created_at).toLocaleString()}</div>
      <div class="summary">${thumbnail}
        ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ''}
        ${item.url ? `<p><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Visit source ↗</a></p>` : ''}
        <p class="rating">Average rating: <strong>${avgText}</strong></p>
      </div>
      <div class="actions">
        <button id="openIssue">View on GitHub</button>
        <div class="stars" role="group" aria-label="Rate this item">
          ${[1,2,3,4,5].map(n => `<button data-n="${n}" aria-label="Give ${n} star${n>1?'s':''}">${'★'.repeat(n)}</button>`).join('')}
        </div>
        <button id="addComment">Add comment</button>
      </div>
    `;
    const issueUrl = `https://github.com/${REPO_PATH}/issues/${item.number}`;
    document.getElementById('openIssue').addEventListener('click', () => {
      window.open(issueUrl, '_blank');
    });
    document.getElementById('addComment').addEventListener('click', () => {
      window.open(`${issueUrl}#new_comment_field`, '_blank');
    });
    const gh = issueUrl;
    container.querySelectorAll('.stars button').forEach(btn => {
      btn.addEventListener('click', () => {
        const n = btn.getAttribute('data-n');
        const text = `rating: ${n}\n\nYour comment here...`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).catch(() => {});
        }
        window.open(`${gh}#new_comment_field`, '_blank');
      });
    });
  }

  function renderComments(comments) {
    const list = document.getElementById('commentList');
    if (!comments.length) {
      list.innerHTML = '<li>No comments yet.</li>';
      return;
    }
    const ratingLine = /^rating:\s*[1-5]\s*$/i;
    list.innerHTML = comments.map(comment => {
      const lines = (comment.body || '').split(/\r?\n/);
      let displayBody = comment.body || '';
      if (ratingLine.test(lines[0].trim())) {
        displayBody = lines.slice(2).join('\n');
      }
      const meta = `@${escapeHtml(comment.user.login)} on ${new Date(comment.created_at).toLocaleString()}`;
      return `<li>
        <div class="cmeta">${meta}</div>
        <pre>${escapeHtml(displayBody.trim())}</pre>
      </li>`;
    }).join('');
  }

  function initAdd() {
    const button = document.getElementById('openTemplate');
    const issueUrl = `https://github.com/${REPO_PATH}/issues/new?template=item.yml`;
    button.addEventListener('click', () => {
      window.open(issueUrl, '_blank');
    });
    const link = document.getElementById('issueTemplateLink');
    link.href = issueUrl;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    try {
      assertConfig();
    } catch (err) {
      const main = document.querySelector('main');
      if (main) {
        main.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
      }
      console.error(err);
      return;
    }
    if (page === 'home') {
      initHome();
    } else if (page === 'item') {
      initItem();
    } else if (page === 'add') {
      initAdd();
    }
  });
})();
