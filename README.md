# Pony Games

Community-run directory of pony fan games, jams, and dev resources.
Static site, no build step, no dependencies.

## Running locally

Serve the folder with any static server, e.g.:

    python -m http.server 8000

Then open http://localhost:8000. Opening index.html directly via file://
won't work because the pages fetch their content from data/*.json.

## Layout

    *.html            pages (vanilla JS, one shared stylesheet)
    css/style.css     all styles
    js/main.js        cards, filters, detail panel, news, jam history
    js/timer.js       homepage jam countdown, configured by data/jam-config.json
    data/*.json       all site content (games, posts, jams, resources)
    s/<id>/           game screenshots, one folder per game id
    assets/           site images (mascot etc.)
    tools/            jam-editor.html, a form-based editor for data/jams.json
                      so jam history can be edited without touching JSON
    static/admin/     Decap CMS config. Needs a git-gateway backend (Netlify),
                      which the current hosting doesn't have, so it's inactive.

## Data conventions

- `author` is a string in old entries, an array of strings in new ones.
- Tag `type` is one of warning / black / genre / other (case-insensitive).
  Games tagged with a `warning` type are hidden behind the NSFW toggle.
- `releaseDate` is `YYYY-MM-DD`, or just `YYYY` if only the year is known,
  or empty/absent if unknown. Never DD.MM.YYYY, JS date parsing chokes on it.
- `dateAdded` is when the listing was added to the site, not when the game
  came out. It drives the "Newest" sidebar and default sort.
- Playtime buckets: `<5 min`, `5m-30m`, `30m-2h`, `2h-4h`, `4h-10h`, `10h+`,
  plus `Unknown`.

## Deploying

Hosting is a plain web server, uploaded manually. There's no CI:
zip the repo contents (minus .git) and hand it to whoever has server access.
