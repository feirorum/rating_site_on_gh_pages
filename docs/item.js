(async function() {
  const qs = new URLSearchParams(location.search);
  const id = parseInt(qs.get('id'), 10);

  if (!id) {
    document.getElementById('content').innerHTML = '<p class="error">No item ID provided.</p>';
    return;
  }

  const main = document.getElementById('content');
  main.innerHTML = '<p class="loading">Loading...</p>';

  try {
    const cfg = window.RH_CONFIG;
    const issue = (await gh(`${apiBase}/repos/${cfg.owner}/${cfg.repo}/issues/${id}`)).data;
    const comments = await listAllComments(id);
    const ratings = extractRatings(comments);
    const d = issueToCardData(issue);

    main.innerHTML = `
      <article class="item">
        ${d.thumb ? `<img class="hero" src="${d.thumb}" alt="" onerror="this.style.display='none'" />` : ''}
        <h1>${escapeHtml(d.title)}</h1>
        <p class="meta">
          Average rating: <strong>${ratings.count ? ratings.avg.toFixed(1) : '—'}</strong>
          (${ratings.count} rating${ratings.count !== 1 ? 's' : ''})
        </p>
        ${d.url ? `<p><a href="${d.url}" target="_blank" rel="noopener" class="source-link">→ Open source link</a></p>` : ''}
        <div class="summary">${escapeHtml(d.summary)}</div>

        <div class="rate">
          <h2>Rate this item</h2>
          <div class="stars">
            ${[1,2,3,4,5].map(n=>`<button data-n="${n}" aria-label="Rate ${n} stars">${n}★</button>`).join('')}
          </div>
          <p class="hint">Click a rating to copy a template to your clipboard, then paste it in the GitHub comment box.</p>
        </div>

        <div class="comments">
          <h2>Comments</h2>
          <a class="button" target="_blank" rel="noopener" href="${d.gh}#new_comment_field">Add a comment on GitHub</a>
          <ul id="commentList"></ul>
        </div>
      </article>`;

    // Hook up rating buttons
    main.querySelectorAll('.stars button').forEach(btn => {
      btn.addEventListener('click', () => {
        const n = btn.getAttribute('data-n');
        const text = `rating: ${n}\n\nYour comment here...`;

        // Copy to clipboard
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => {
            showToast('Rating template copied! Opening GitHub...');
            setTimeout(() => {
              window.open(`${d.gh}#new_comment_field`, '_blank');
            }, 500);
          }).catch(err => {
            console.error('Failed to copy:', err);
            alert('Could not copy to clipboard. Please manually copy:\n\n' + text);
          });
        } else {
          // Fallback for older browsers
          alert('Copy this template:\n\n' + text);
          window.open(`${d.gh}#new_comment_field`, '_blank');
        }
      });
    });

    // Render comments
    const ul = document.getElementById('commentList');
    if (comments.length === 0) {
      ul.innerHTML = '<li class="empty">No comments yet.</li>';
    } else {
      for (const c of comments) {
        const li = document.createElement('li');
        const firstLine = (c.body || '').split(/\r?\n/)[0].trim();
        const isRating = /^rating:\s*[1-5]$/i.test(firstLine);

        // For rating comments, show the rating and skip the first line in body
        let bodyText = c.body || '';
        let ratingBadge = '';

        if (isRating) {
          const ratingValue = firstLine.match(/rating:\s*([1-5])/i)[1];
          ratingBadge = `<span class="rating-badge">${ratingValue}★</span>`;
          // Remove first line and empty line after it
          bodyText = bodyText.split(/\r?\n/).slice(2).join('\n').trim();
        }

        li.innerHTML = `
          <div class="cmeta">
            ${ratingBadge}
            <strong>@${escapeHtml(c.user.login)}</strong> on ${new Date(c.created_at).toLocaleString()}
          </div>
          ${bodyText ? `<div class="cbody">${escapeHtml(bodyText)}</div>` : ''}`;
        ul.appendChild(li);
      }
    }

  } catch (error) {
    console.error('Error loading item:', error);
    main.innerHTML = `<p class="error">Error loading item: ${escapeHtml(error.message)}</p>`;
  }
})();

// Toast notification helper
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
