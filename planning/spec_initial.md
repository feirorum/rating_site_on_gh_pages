# GitHub Pages Ratings Hub — Option A (No‑Server) Implementation Spec

You chose: **Option A**, with **integer ratings (1–5)**, **no caching** initially, **30–100 items/year**, **no moderation for MVP**, **English‑only**. Below is an end‑to‑end spec you can drop into a repo and iterate on.

---

## 1) Overview

A static GitHub Pages site that reads/writes data in **GitHub Issues & Comments**:

* **Item = Issue** (`type:item` label)
* **Rating = Issue Comment** where first line is `rating: <1-5>` (integer)
* **Regular comments = additional Issue comments**

### Pages

1. **Home** (`/index.html`):

   * Shows **Latest 5** items (by creation time)
   * Shows **Top 5** items (by average rating; ties: higher rating count, then newer created)
2. **Add Item** (`/add.html`):

   * **Opens GitHub “New issue” form** using an **Issue Template** (user manually pastes URL, summary, thumbnail URL)
3. **Item Detail** (`/item.html?id=<issue_number>`):

   * Displays item, all comments, computed average rating & count
   * Provides **rating buttons (1–5)** that **copy a comment template** to clipboard and open the GitHub comment box anchor
   * Provides **add comment** button that opens the GitHub comment UI

> **No server** means: no URL scraper, no in‑page posting. Users **post via GitHub UI** with prefilled template fields.

---

## 2) Repository Setup

* **Repo**: `your-org/ratings-hub` (public or private; Pages works with both if enabled; public recommended for simpler access)
* **Default branch**: `main`
* **GitHub Pages**: Source = `GitHub Actions` or `main /docs` (this spec assumes **`/docs`** in `main` to keep it simple)
* **Labels**:

  * `type:item` (items)
  * *(Optional for future)*: topic tags like `tag:video`, `tag:book`, etc.

### 2.1 Issue Template (for adding items)

Create **`.github/ISSUE_TEMPLATE/item.yml`**:

```yaml
name: New Item
description: Submit a new item to be rated.
title: "[Item] <Short title here>"
labels: ["type:item"]
body:
  - type: input
    id: url
    attributes:
      label: Source URL
      description: Paste the original link for this item.
      placeholder: https://example.com/article
    validations:
      required: true
  - type: input
    id: thumbnail
    attributes:
      label: Thumbnail URL
      description: Paste an image URL (OG image, screenshot, or hosted image).
      placeholder: https://...
    validations:
      required: false
  - type: textarea
    id: summary
    attributes:
      label: Summary
      description: Short summary. Keep it concise.
      placeholder: A few sentences that capture the essence.
    validations:
      required: true
  - type: textarea
    id: notes
    attributes:
      label: Optional Notes
      description: Any extra details.
      placeholder: (optional)
    validations:
      required: false
```

> The template’s UI renders on GitHub. The structured content is stored in the issue **as checklist fields and in Markdown**. For easier parsing in the client, we’ll also embed a simple **YAML front‑matter** in the issue body (see §3.2).

---

## 3) Data Model & Conventions

### 3.1 Issue (Item)

* **Labels**: must include `type:item`
* **Title**: Free text (template prefix `[Item]` is helpful but not required for parsing)
* **Body**: Markdown with **YAML front‑matter** at top (client‑generated from the template fields; if users skip, the client will fall back to extracting lines by regex)

Example body (what we’ll *encourage* via the template’s default text block):

```md
---
schema: v1
url: https://example.com/article
thumbnail: https://images.example.com/og.jpg
summary: >
  Human‑edited short summary.
---

(Any extra notes the submitter added below)
```

> **Why front‑matter?** Fast to parse on the client without a server. If it’s missing, we’ll fall back to heuristics (scan for `url:` / `thumbnail:` lines in the body or use template fields via the Issues API `body` content).

### 3.2 Ratings (Comments)

* **Format (first line only)**: `rating: N` where **N ∈ {1,2,3,4,5}**
* Additional text can follow after a blank line.

Examples:

```md
rating: 5

Fantastic overview and examples.
```

```md
rating: 3

Good ideas, but missing depth in section 2.
```

* **One rating per GitHub user per item** is not enforced in Option A. For averages we’ll **use the most recent `rating:` comment per user** (client‑side deduping by `user.login`).

### 3.3 Regular Comments

* Any comment without a valid `rating:` line is considered a non‑rating discussion comment.

---

## 4) Frontend Structure (Static, no build step required)

```
/docs
  ├─ index.html        # home
  ├─ item.html         # detail view
  ├─ add.html          # helper page that links to GitHub New Issue
  ├─ styles.css        # minimal styles
  ├─ app.js            # shared helpers
  └─ config.js         # owner/repo + options
```

### 4.1 `config.js`

```js
window.RH_CONFIG = {
  owner: "your-org",
  repo: "ratings-hub",
  itemsLabel: "type:item",
  siteTitle: "Ratings Hub",
  perPage: 50, // for issues/comments pagination
};
```

### 4.2 `app.js` (core helpers)

Key responsibilities:

* **API**: `GET /repos/{owner}/{repo}/issues` (filter by label), `GET /issues/{n}/comments`
* **Pagination**: follow `Link` headers for next pages
* **Parsing**: extract front‑matter, compute avg rating & count
* **Utilities**: date formatting, HTML sanitization (basic), querystring helpers

Pseudocode outline (trimmed for brevity):

```js
const apiBase = "https://api.github.com";
const cfg = window.RH_CONFIG;

async function gh(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' }});
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const data = await res.json();
  const links = parseLinkHeader(res.headers.get('Link'));
  return { data, links };
}

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

function parseFrontMatter(body) {
  const m = body.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const yaml = m[1];
  const obj = {};
  yaml.split(/\r?\n/).forEach(line => {
    const mm = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (mm) obj[mm[1]] = mm[2];
  });
  return obj;
}

function extractRatings(comments) {
  // Use latest rating per user
  const latestByUser = new Map();
  for (const c of comments) {
    const firstLine = (c.body || "").split(/\r?\n/)[0].trim();
    const m = firstLine.match(/^rating:\s*([1-5])$/i);
    if (m) latestByUser.set(c.user.login, { value: parseInt(m[1], 10), date: c.created_at });
  }
  const values = [...latestByUser.values()].map(x => x.value);
  const count = values.length;
  const avg = count ? (values.reduce((a,b)=>a+b,0) / count) : 0;
  return { avg, count };
}

function toIssueUrl(n) { return `https://github.com/${cfg.owner}/${cfg.repo}/issues/${n}`; }
function toNewIssueUrl() { return `https://github.com/${cfg.owner}/${cfg.repo}/issues/new?template=item.yml`; }
```

> For MVP we keep the parser tiny (hand‑rolled YAML subset). You can swap in a small YAML parser later if needed.

### 4.3 `index.html` (Home)

**Flow at runtime:**

1. Load all `type:item` issues
2. For **Latest 5**: sort by `created_at` descending, take first 5
3. For **Top 5**: for each issue, load comments, compute `(avg, count)`, then sort by `avg desc, count desc, created_at desc` and take first 5

> This is **N+1** calls (1 for issues + comments per item). With ~100 items it’s OK, but load time will be noticeable. You can show a loader and stream results as they resolve.

**UI details:**

* Card shows: title, thumbnail (if any), summary (trimmed), link to `item.html?id=<number>`, and quick link to the GitHub issue

### 4.4 `item.html` (Item Details)

**Flow:**

1. Read `id` from query
2. Fetch issue and comments
3. Parse front‑matter; compute `avg,count`
4. Render:

   * Title, link to source URL, thumbnail
   * Summary
   * **Average rating** (integer average rounded or one decimal — pick one; spec recommends **one decimal** display even though inputs are integers)
   * **Buttons**: Rate 1…5 → on click:

     1. Copy to clipboard: `rating: N\n\n<your comment here>`
     2. Open `https://github.com/<owner>/<repo>/issues/<id>#new_comment_field` in new tab
     3. Toast: “Template copied. Paste into GitHub comment box.”
   * **Add comment** button: opens the same anchor without a copied rating line

**Optional convenience**: after user returns from GitHub, they can refresh to see updated average.

### 4.5 `add.html` (Add Item)

Two simple approaches:

* **Approach A (clean)**: Just a button that opens **New Issue** with your template.

  ```html
  <a class="button" href="https://github.com/OWNER/REPO/issues/new?template=item.yml" target="_blank">Add a new item on GitHub</a>
  ```
* **Approach B (helper form)**: A small form that helps users **compose** the title/front‑matter, then opens the New Issue URL **without** autofilling (GitHub UI will still show the template). You can display instructions like: “Paste URL, Summary, Thumbnail into the template fields.” (Since we can’t POST to GitHub from the client without auth, opening the template is the correct MVP.)

---

## 5) Visual & UX Guidelines

* Minimal responsive CSS, system fonts
* Thumbnails: fixed aspect ratio container (e.g., 16:9) with `object-fit: cover`
* Accessibility:

  * Keyboard focus states on links/buttons
  * Rating controls are plain buttons with aria‑labels (e.g., `aria-label="Rate 3 stars"`)

---

## 6) Rate Limits & Performance (No Caching)

* Unauthenticated requests: **60/hour/IP**. Home page worst case: ~1 + (#items) calls. For 100 items, ~101 requests → **add progressive loading** (e.g., render Latest 5 first using only the issue list; then lazily compute Top 5 as comments load).
* If you hit the limit:

  * Display a banner: “GitHub rate limit reached; try again later or sign in on GitHub and refresh.”
  * (Optional future) Let users provide a **personal access token** in localStorage for higher limits (not storing server‑side). **MVP skips this.**

---

## 7) Sorting Rules (Exact)

* **Latest**: sort by `issue.created_at` **desc**; take 5
* **Top**: for each issue compute `{avg,count}`; sort by:

  1. `avg` **desc**
  2. `count` **desc**
  3. `issue.created_at` **desc**

  * take 5
* **Average display**: one decimal (e.g., `4.2`) — purely presentation; compute with full numbers

---

## 8) Edge Cases

* **No ratings yet**: show `No ratings` and exclude from Top 5
* **Missing front‑matter**: try to extract template fields via heuristics; otherwise show minimal card (title + link to issue)
* **Broken thumbnails**: add `onerror` fallback to placeholder image
* **Long summaries**: clamp to ~3 lines on cards

---

## 9) Security & Privacy

* All writes happen on GitHub, so **auth & audit** are handled by GitHub
* The site only performs **GET** requests
* No cookies, no tracking beyond GitHub’s own

---

## 10) Step‑by‑Step Setup Checklist

1. Create repo with `/docs` Pages
2. Add **labels** and **issue template** (from §2.1)
3. Add the frontend files (`index.html`, `item.html`, `add.html`, `styles.css`, `app.js`, `config.js`)
4. Enable GitHub Pages → Branch `main`, folder `/docs`
5. Create a couple of test items via the template
6. Visit Home, confirm Latest & Top render

---

## 11) Sample Frontend Snippets (MVP‑level)

> These are **snippets**. Keep the full files small and readable; you can expand later.

**`/docs/index.html`** (sketch)

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ratings Hub</title>
  <link rel="stylesheet" href="styles.css" />
  <script defer src="config.js"></script>
  <script defer src="app.js"></script>
  <script defer src="home.js"></script>
</head>
<body>
  <header>
    <h1 id="siteTitle"></h1>
    <nav><a href="add.html">Add Item</a></nav>
  </header>
  <main>
    <section id="latest"><h2>Latest</h2><div class="grid" id="latestGrid"></div></section>
    <section id="top"><h2>Top Rated</h2><div class="grid" id="topGrid"></div></section>
  </main>
</body>
</html>
```

**`/docs/home.js`** (sketch)

```js
(async function(){
  const cfg = window.RH_CONFIG;
  document.getElementById('siteTitle').textContent = cfg.siteTitle;

  const issues = await listAllIssuesWithLabel(cfg.itemsLabel);

  // Latest 5
  const latest = [...issues].sort((a,b)=> new Date(b.created_at)-new Date(a.created_at)).slice(0,5);
  renderCardList(document.getElementById('latestGrid'), latest);

  // Top 5 (compute progressively)
  const withRatings = [];
  for (const issue of issues) {
    const comments = await listAllComments(issue.number);
    const r = extractRatings(comments);
    if (r.count > 0) withRatings.push({ issue, ...r });
  }
  const top = withRatings.sort((a,b)=>
    b.avg - a.avg || b.count - a.count || new Date(b.issue.created_at)-new Date(a.issue.created_at)
  ).slice(0,5).map(x=>x.issue);
  renderCardList(document.getElementById('topGrid'), top);
})();
```

**`/docs/app.js`** — **rendering helpers** (sketch)

```js
function issueToCardData(issue){
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

function renderCardList(root, issues){
  root.innerHTML = '';
  for (const iss of issues){
    const d = issueToCardData(iss);
    const el = document.createElement('article');
    el.className = 'card';
    el.innerHTML = `
      <a class="thumb" href="item.html?id=${d.number}">
        <img src="${d.thumb}" alt="" onerror="this.style.display='none'"/>
      </a>
      <h3><a href="item.html?id=${d.number}">${escapeHtml(d.title)}</a></h3>
      <p>${escapeHtml(d.summary).slice(0,240)}</p>
      <div class="links">
        <a href="${d.gh}" target="_blank">GitHub</a>
        ${d.url ? `<a href="${d.url}" target="_blank">Source</a>` : ''}
      </div>`;
    root.appendChild(el);
  }
}
```

**`/docs/item.html`** (sketch)

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Item</title>
  <link rel="stylesheet" href="styles.css" />
  <script defer src="config.js"></script>
  <script defer src="app.js"></script>
  <script defer src="item.js"></script>
</head>
<body>
  <header><a href="index.html">← Back</a></header>
  <main id="content"></main>
</body>
</html>
```

**`/docs/item.js`** (sketch)

```js
(async function(){
  const qs = new URLSearchParams(location.search);
  const id = parseInt(qs.get('id'),10);
  if (!id) return;

  const apiBase = 'https://api.github.com';
  const cfg = window.RH_CONFIG;
  const issue = (await gh(`${apiBase}/repos/${cfg.owner}/${cfg.repo}/issues/${id}`)).data;
  const comments = await listAllComments(id);
  const ratings = extractRatings(comments);
  const d = issueToCardData(issue);

  const main = document.getElementById('content');
  main.innerHTML = `
    <article class="item">
      ${d.thumb ? `<img class="hero" src="${d.thumb}" alt="" />` : ''}
      <h1>${escapeHtml(d.title)}</h1>
      <p class="meta">Average rating: ${ratings.count ? ratings.avg.toFixed(1) : '—'} (${ratings.count})</p>
      ${d.url ? `<p><a href="${d.url}" target="_blank">Open source link</a></p>` : ''}
      <p>${escapeHtml(d.summary)}</p>

      <div class="rate">
        <h2>Rate this item</h2>
        <div class="stars">
          ${[1,2,3,4,5].map(n=>`<button data-n="${n}" aria-label="Rate ${n} stars">${n}★</button>`).join('')}
        </div>
        <p class="hint">We’ll copy a template to your clipboard, then open the GitHub comment box. Paste it and submit.</p>
      </div>

      <div class="comments">
        <h2>Comments</h2>
        <a class="button" target="_blank" href="${d.gh}#new_comment_field">Add a comment on GitHub</a>
        <ul id="commentList"></ul>
      </div>
    </article>`;

  // Hook up rating buttons
  main.querySelectorAll('.stars button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const n = btn.getAttribute('data-n');
      const text = `rating: ${n}\n\nYour comment here...`;
      navigator.clipboard?.writeText(text);
      window.open(`${d.gh}#new_comment_field`, '_blank');
    });
  });

  // Render comments (exclude rating-only lines in the displayed body if desired)
  const ul = document.getElementById('commentList');
  for (const c of comments){
    const li = document.createElement('li');
    const isRating = /^rating:\s*[1-5]$/i.test((c.body||'').split(/\r?\n/)[0].trim());
    li.innerHTML = `
      <div class="cmeta">@${c.user.login} on ${new Date(c.created_at).toLocaleString()}</div>
      <pre>${escapeHtml(isRating ? (c.body||'').split(/\r?\n/).slice(2).join('\n') : c.body || '')}</pre>`;
    ul.appendChild(li);
  }
})();
```

---

## 12) Import (Later)

You mentioned Pluralsight lists and coding agents. Here are three pragmatic upgrade paths when you’re ready:

### 12.1 “Import file → GitHub Action creates issues”

* Put a file `imports/items.csv` (columns: `title,url,thumbnail,summary,tags`)
* GitHub Action (manual dispatch) reads CSV and creates issues via `gh` CLI using the repository **GITHUB_TOKEN**.
* **Pros**: auditable via PR/commit; no local tokens needed.
* **Cons**: Actions YAML & scripting required.

**Sample Action (`.github/workflows/import-items.yml`)**

```yaml
name: Import Items
on:
  workflow_dispatch:
    inputs:
      path:
        description: CSV path
        required: true
        default: imports/items.csv
jobs:
  import:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install CSV parser
        run: npm i -g csvtojson
      - name: Import
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REPO: ${{ github.repository }}
        run: |
          csvtojson ${{ github.event.inputs.path }} | node -e '
            const fs = require("fs");
            const { execSync } = require("child_process");
            const items = JSON.parse(fs.readFileSync(0, "utf8"));
            for (const it of items) {
              const body = `---\nschema: v1\nurl: ${it.url||""}\nthumbnail: ${it.thumbnail||""}\nsummary: >\n  ${it.summary||""}\n---\n`;
              const title = `[Item] ${it.title||"Untitled"}`;
              execSync(`gh issue create --repo ${process.env.REPO} --title ${JSON.stringify(title)} --label type:item --body ${JSON.stringify(body)}`);
            }
          '
```

### 12.2 “Local script with MCP / coding agent”

* Export list from Pluralsight (HTML/CSV)
* Let your MCP‑enabled agent parse & call **GitHub tool** to create issues with the body front‑matter; same schema as above.

### 12.3 “Bookmarklet to seed issue”

* Bookmarklet that grabs `document.title`, `location.href`, best‑guess OG image, then opens `issues/new?template=item.yml` and copies a proposed summary to clipboard for quick paste.

---

## 13) Roadmap (beyond MVP)

* **Friendly auth**: optional user PAT in localStorage for higher rate limits
* **Computed index & caching**: precompute `top` and `latest` via Action to speed up Home
* **URL scraping (serverless)** for auto‑title/images
* **Moderation**: hide by closing issues or using `status:hidden`
* **Search & filters**: client‑side search; tag pills
* **i18n**: Swedish toggle

---

## 14) Definition of Done (MVP)

* [ ] Repo created, Pages enabled from `/docs`
* [ ] Labels present; issue template working
* [ ] Home shows Latest 5 and Top 5 from live Issues/Comments
* [ ] Item page shows average rating, count, all comments
* [ ] Rating buttons copy template and open GitHub comment anchor
* [ ] Add Item page opens template form on GitHub
* [ ] Tested with a handful of sample items & ratings

---

## 15) Notes on Limitations (explicit)

* No in‑page posting; users must finalize on GitHub
* No automatic URL scraping or image uploads
* Top 5 computation requires loading **all comments** for candidate items (OK at ~100 items)

---

### That’s it — paste these files in `/docs`, add the template, create a couple of issues, and you have the MVP running. When you’re ready, we can wire the import Action or a bookmarklet to accelerate seeding from Pluralsight.

