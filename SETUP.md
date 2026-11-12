# Setup (about 30 minutes)

You'll need: a GitHub account, a Vercel account, a Claude Pro/Max subscription, a Zernio account, and the social accounts you'll post from.

## 1. Deploy the app

1. Fork this repo.
2. In Vercel: **Add New → Project**, import your fork.
3. In the project: **Storage → Marketplace → Neon (Postgres)**, connect it. This sets `DATABASE_URL`.
4. Run the schema once: `psql "$DATABASE_URL" -f schema.sql` (from your machine, with the URL from Vercel's env vars). Re-run it after updates; it's safe to re-run.
5. In **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `DASHBOARD_PASSWORD` | your dashboard password |
| `AGENT_TOKEN` | a long random string (`openssl rand -hex 32`) |
| `CONVERSION_TOKEN` | another long random string (for your product site, step 6) |
| `CRON_SECRET` | another long random string |
| `ZERNIO_API_KEY` | from Zernio (step 2) |
| `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY` | optional, free keys from unsplash.com/developers and pexels.com/api. Without them slides are text on a plain background |
| `APP_URL` | your Vercel URL, e.g. `https://autopromo-you.vercel.app` |

6. Redeploy. Open the URL, sign in.

## 2. Connect social accounts (by hand)

1. Create each social account **yourself**, in the app or a normal browser. Add "AI가 작성을 돕습니다" (or "Posts are written with AI") to every bio.
2. Post once by hand from each account so it's healthy.
3. Make a Zernio account and connect the accounts there. Copy the API key into `ZERNIO_API_KEY`.

Never sign up or log in to social accounts with scripts or automated browsers. That gets accounts banned.

**You don't need the business's own accounts.** Any account you control works. The best start is **TikTok + YouTube**: both show videos to people by interest, so a brand-new account with no followers still gets seen. Make the TikTok account a **business account** (needed for a link in the bio), and don't mark the YouTube channel as made for kids. Zernio's first 2 accounts are free.

## 3. Add your product

In the dashboard → **Settings → Add a product**: the URL tracked links should land on, target users, language, timezone, and extra banned words. Then **Channels**: switch on the channels you'll use and pick each one's Zernio account. Leave **Auto-publish off** for now ("Approve first").

TikTok, YouTube and Instagram don't make links in captions clickable. Paste the bio link shown in Settings into each profile's bio once.

## 4. Turn on the agents

In your fork on GitHub → **Settings → Secrets and variables → Actions**:

- Secrets: `CLAUDE_CODE_OAUTH_TOKEN` (run `claude setup-token` in your terminal and paste what it prints), `APP_URL`, `AGENT_TOKEN` (same value as in Vercel).
- Variable (optional): `AGENT_MODEL` (default `claude-opus-5-5`; `claude-sonnet-5-5` costs about half).

**Heads-up:** GitHub turns off scheduled workflows after 60 days with no commits to the repo. If the Actions tab says the workflow is disabled, click **Enable workflow** (or push any small commit once a month).

Then **Actions → agents → Run workflow → researcher** once to build the fact sheet. Check it in Settings and fix anything wrong. The schedule takes over from there. Actions must be enabled on forks (Actions tab → enable).

The agents run on **your own** Claude subscription, in your own repo, for your own products. Runs count toward your plan's usage limits. Prefer pay-per-use? Add an `ANTHROPIC_API_KEY` secret instead.

## 5. Daily use, then hands-off

- **Waiting for you:** approve or skip each reviewed post. That's your quality check.
- When a channel's posts go through cleanly for a couple of weeks (you rarely skip or wish you'd changed something), switch it to **Auto** in Channels.
- Keep new accounts at 1 post a day (Settings). Raise slowly.
- Judge it month over month. The first real verdict comes after about 3 months.

## 6. Measure sign-ups (optional, recommended)

Tracked links land on your site with `ap_click=<id>`. Keep that value (cookie or session). When someone signs up or buys, have your **server** call:

```bash
curl -X POST "$APP_URL/api/conversions" \
  -H "Authorization: Bearer $CONVERSION_TOKEN" -H 'content-type: application/json' \
  -d '{"click_id": 123, "kind": "signup", "external_id": "lead-8841"}'
```

`kind` is `signup` or `purchase`; `value` (number) is optional; `external_id` is your own opaque id (never an email or phone), so retries don't double-count. Send it from your server, never from the browser, because the token is secret.

## Cost

| Item | Cost |
|---|---|
| Anthropic API (4 agents, 1 product, Opus 5.5) | about **$50–60/month** (estimate; ~$1 per writer run, ~$0.50 per reviewer run). Sonnet 5.5: about half. Check real spend in the Anthropic Console → Usage after the first week. |
| GitHub Actions | free for public repos (private: within the free minutes for this load) |
| Vercel + Neon | free tiers |
| Zernio | free for 2 accounts, then about $6 per account per month |
| Unsplash / Pexels | free |
