# autopromo

Give it your product's web page. It promotes the product on social media for you.

AI agents (Claude) read your site, plan a 4-week campaign, write the posts, check each other's work, and publish through [Zernio](https://zernio.com). Then they look at what brought clicks and sign-ups and adjust the next plan.

Posts it makes: short videos for TikTok and YouTube Shorts, Instagram carousels, Threads and LinkedIn posts (through Zernio), and Telegram and Discord posts (sent directly, no Zernio account needed).

## How it works

1. **You add a product**: just its URL.
2. **Researcher** reads your site and writes a fact sheet, with the source page for every fact. Posts may only claim what's on it.
3. **Planner** drafts a 4-week plan: who it's for, themes, and a day-by-day calendar. You edit it or ask for changes, then confirm.
4. **Writer** writes each post on its day.
5. **Reviewer** checks every post against the fact sheet and rules. Anything doubtful is blocked.
6. **You approve** posts at first. Once a channel runs cleanly, switch it to auto.
7. **Analyst** reads the results weekly and tells the next plan what to keep and what to drop.

Every post gets its own tracked link, so you see which posts bring customers, not just views.

## Using it

Everything happens in the dashboard:

| Page | What you do there |
|---|---|
| Home | See where each product is (research → channels → plan → running) and this week's posts |
| Plan | Review, edit and confirm the 4-week plan |
| Waiting for you | Approve or skip reviewed posts |
| Posts | Every post, its status and its numbers |
| Channels | Connect accounts, turn channels on, switch to auto |
| Settings | Products, fact sheet, posts per day, bio link |

## Setup

About 30 minutes. You need GitHub, Vercel, a Claude subscription, a Zernio account, and the social accounts you'll post from.

Step by step: **[SETUP.md](SETUP.md)**

Running cost for one product: about $50–60/month in Claude usage (half with Sonnet). Vercel, Neon and GitHub Actions fit in free tiers. Zernio is free for 2 accounts.

## Ground rules

- **Honest:** no claim without a source on your site, conditions included.
- **Safe for accounts:** you do every login yourself. No bots liking, following or commenting. Bios say AI helps write the posts. New accounts start at 1 post a day.
- **Yours:** runs on your Vercel, your database, your Claude subscription, your accounts. Nothing is hosted for you.

## Where things are

| | |
|---|---|
| `agents/*.md` | What each agent does, in plain words. Run by `.github/workflows/agents.yml` |
| `src/` | Next.js app on Vercel: dashboard, agent API, tracked links, slide images and videos, publishing |
| `schema.sql` | Postgres tables |

Local dev: `npm install`, copy `.env.example` to `.env.local`, `npm run dev`. Tests: `npm test`.

MIT licensed.
