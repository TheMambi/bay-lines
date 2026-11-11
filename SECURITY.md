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
- `/api/alerts` fetches one fixed BART URL. It takes no input from the caller, caps the size of what it reads and returns, and reuses its last answer for 30 seconds so requests can't be multiplied into traffic to BART.
- Text from the alerts feed is rendered as plain text. Its link is shown only if it points to bart.gov over https.
- The browser keeps two things in local storage: the theme choice and best game scores.
- CI runs `npm audit`, lint, tests and a production build on every push. Dependabot opens update pull requests.
