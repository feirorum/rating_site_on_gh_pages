# Ratings Hub (GitHub Pages)

Static front-end that surfaces GitHub issues and comments as a lightweight ratings hub. Configure the repository in `docs/config.js` and publish the `/docs` folder through GitHub Pages.

Once these files are committed to a GitHub repository, you can enable Pages on the repo and the site will be publicly viewable without any additional build steps.

## Setup

1. Update `docs/config.js` with your GitHub `owner` and `repo`.
2. Ensure the repo has the `type:item` label.
3. Copy the `.github/ISSUE_TEMPLATE/item.yml` into your repo (already included here).
4. Enable GitHub Pages from the `/docs` folder on the default branch.

## Publishing to GitHub Pages

1. Push this repository (or your fork) to GitHub.
2. In the repository settings, open **Pages** and set the source to `main` → `/docs`.
3. Save the settings—GitHub will provision the site within a minute or two.
4. Visit `https://<your-username>.github.io/<repository-name>/` to view the app. Update the `owner` and `repo` fields in `docs/config.js` so the site points at the same repository where you enabled Pages.

GitHub serves the static HTML, CSS, and JavaScript directly, and the JavaScript calls GitHub's public REST API from the browser to populate items and ratings in real time.

## Usage

- New items are created by opening the issue template from `docs/add.html`.
- Ratings are collected via issue comments whose first line is `rating: <1-5>`.
- Home page shows latest items and top rated entries. Item page lists ratings and comments with quick actions.
