# autopromo

Hands-off social promotion for one product. Claude agents learn your product from its own website, write useful posts (Instagram card-news carousels, Threads posts), review each other's work, publish through [Zernio](https://zernio.com), and learn from what brings sign-ups. You approve posts at first, then let channels run on their own.

- **Honest by design:** posts may only claim what's on your product's site (a fact sheet with sources), conditions included. A separate reviewer agent blocks anything doubtful.
- **Safe for accounts:** people do every login; no automated likes, follows or comments; AI noted in bios; new accounts start at 1 post a day.
- **Measured on results:** every post gets its own tracked link; your site can report sign-ups and purchases back, so you see which posts bring customers, not just clicks.
- **Yours to run:** your Vercel, your database, your Claude subscription, your accounts. Nothing is hosted for you.

Start with [SETUP.md](SETUP.md). How it works: [docs/superpowers/specs](docs/superpowers/specs/2026-11-11-agentic-marketing-design.md).

| | |
|---|---|
| Agents | `agents/*.md`, run by `.github/workflows/agents.yml` |
| App | Next.js on Vercel: dashboard, agent API, `/go/<code>` links, slide images, publishing |
| Data | Postgres (`schema.sql`) |

MIT licensed.
