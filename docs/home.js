(async function() {
  const cfg = window.RH_CONFIG;
  document.getElementById('siteTitle').textContent = cfg.siteTitle;

  // Show loading state
  const latestGrid = document.getElementById('latestGrid');
  const topGrid = document.getElementById('topGrid');
  latestGrid.innerHTML = '<p class="loading">Loading...</p>';
  topGrid.innerHTML = '<p class="loading">Loading...</p>';

  try {
    const issues = await listAllIssuesWithLabel(cfg.itemsLabel);

    if (issues.length === 0) {
      latestGrid.innerHTML = '<p class="empty">No items yet. <a href="add.html">Add the first one!</a></p>';
      topGrid.innerHTML = '<p class="empty">No items yet.</p>';
      return;
    }

    // Latest 5: sort by created_at descending
    const latest = [...issues]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);
    renderCardList(latestGrid, latest);

    // Top 5: compute ratings progressively
    const withRatings = [];
    for (const issue of issues) {
      const comments = await listAllComments(issue.number);
      const r = extractRatings(comments);
      if (r.count > 0) {
        withRatings.push({ issue, ...r });
      }
    }

    if (withRatings.length === 0) {
      topGrid.innerHTML = '<p class="empty">No rated items yet.</p>';
      return;
    }

    // Sort by: avg desc, count desc, created_at desc
    const top = withRatings
      .sort((a, b) => {
        if (b.avg !== a.avg) return b.avg - a.avg;
        if (b.count !== a.count) return b.count - a.count;
        return new Date(b.issue.created_at) - new Date(a.issue.created_at);
      })
      .slice(0, 5)
      .map(x => x.issue);

    renderCardList(topGrid, top);

  } catch (error) {
    console.error('Error loading items:', error);
    latestGrid.innerHTML = `<p class="error">Error loading items: ${escapeHtml(error.message)}</p>`;
    topGrid.innerHTML = `<p class="error">Error loading items: ${escapeHtml(error.message)}</p>`;
  }
})();
