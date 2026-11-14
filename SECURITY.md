# Security

Bay Lines is a static site plus one read-only serverless function. It has no accounts, stores no personal data on a server, and needs no API keys.

## Reporting a problem

Please report security problems privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Please don't open a public issue for something that could be exploited.

Include what you found, how to reproduce it, and which URL or file it affects.

## What is in scope

- The code in this repository.
- The deployment at https://bay-lines.vercel.app, including `/api/alerts`.

BART's own websites and feeds are not part of this project. Report problems with those to BART.

## How the app is hardened

- A Content-Security-Policy in `vercel.json` allows scripts, styles, fonts and network requests from the site's own origin only. Inline scripts and styles are blocked.
- `/api/alerts` fetches one fixed BART URL and refuses to follow a redirect away from it. It takes no input from the caller and caps the size of what it reads and returns, including the length of each route and stop id. Each running copy of the function asks BART at most once every 30 seconds while BART answers and once every 15 seconds while it fails, and requests that arrive together share one call. A copy older than 15 minutes is not served. Vercel can run several copies at once, and each keeps its own count.
- Text from the alerts feed is rendered as plain text. Its link is shown only if it points to bart.gov over https.
- The browser keeps two things in local storage: the theme choice and best game scores.
- CI runs `npm audit`, lint, tests and a production build on every push to `dev`, on every pull request, and once a week so an advisory published between pushes is still seen. Dependabot opens update pull requests.
