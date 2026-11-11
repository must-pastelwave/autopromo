# Agentic marketing system: design

Date: 2026-11-11 · Working name: **autopromo** (my call, rename freely)

## 1. What and why

An open-source system that promotes a product on social media **with no one attending it**. The owner enters a product URL and who it is for, connects their accounts once, and leaves. The system works out what to say, makes posts, has them reviewed, publishes them, measures clicks, and gets better each week.

The first product is **l2u.co.kr**, a Korean hotel and resort booking site with member discounts, currently in beta and pushing sign-ups for its "PICK" member prices.

Success = **clicks on our tracked links**. That is the only metric. (The team's real goal is appointments and bookings, but the system can't see those, so clicks stand in for them.)

## 2. Goals, non-goals, anti-goals

**Goals**
- Zero attendance: after setup, it runs for weeks without the owner.
- Works for any product and any audience. l2u is just the first.
- Anyone can run it on their own accounts: fork, deploy, connect, done in about 15 minutes.
- More clicks over time, because it learns which topics and formats work.

**Non-goals (v1)**
- Video (Reels and Shorts). That comes in v2: the same carousel slides become simple photo-and-text videos.
- Replying to comments, liking, or following.
- Paid ads.
- Measuring bookings or sign-ups inside the product.
- A hosted service. We never run other people's copies.

**Anti-goals: if any of these happen, it has failed even if it "works"**
- It posts something false: a price, discount, or claim that isn't on the product's site.
- It sounds pushy or salesy, or mocks anyone.
- It gets an owner's account banned or shadowbanned.
- It automates channels that forbid automation.

## 3. How the owner experiences it

1. Fork the repo and deploy the dashboard to Vercel (free tier).
2. Create a Zernio account and connect social accounts **by hand** (Instagram business account, Threads, and others). Paste the Zernio API key into the dashboard.
3. In Claude Code, run one setup command that creates the scheduled cloud agents in the owner's own Claude account.
4. In the dashboard: product URL, target users, language, and posting frequency.
5. Leave. Open the dashboard whenever they want to see results.

## 4. The agents (all scheduled Claude cloud agents on the owner's subscription)

| Agent | When | What it does |
|---|---|---|
| **Researcher** | On setup, then weekly | Reads the product site and writes a **fact sheet**: every fact (price, discount, destination, how to sign up) with the page it came from. It's the only source of claims. The owner can edit it in Settings. |
| **Writer** | Daily | Picks topics useful to the target users, writes posts per channel, picks real photos, and adds a tracked link. Uses the playbook (below). |
| **Reviewer** | After every writer run, in a fresh session | Checks each post against the rules (section 6) and the fact sheet. Verdict: **pass** or **block** with a reason. The writer gets one chance to fix a blocked post; if it fails again, the post is dropped. The writer never approves its own work. |
| **Publisher** | Right after review | Sends passed posts to Zernio with their scheduled times. Posts for non-automatable channels go to "Waiting for you" instead. |
| **Analyst** | Weekly | Reads the click numbers and rewrites the **playbook**: a short note on which topics, formats, and times won and which to drop ("drop what stalls, double down on what broke out"). |

The agents talk to the dashboard app over its API with a secret token. All state lives in the app's database, not in the agents.

Running on the owner's subscription means the work happens inside Claude Code's own scheduled agents. The app never holds or uses the owner's Claude login.

**One set of agents for all products** (my call): each run loops over the active products, so adding a product doesn't add agents. Each product has its own Zernio profile and its own social accounts.

**Plan B** (my call): if scheduled cloud agents can't call the app's API or run reliably, the same agent prompts run as scheduled GitHub Actions in the owner's fork, using Claude Code with the owner's subscription token stored as a GitHub secret. The app still never holds it. Prompts are written once and work in either place.

## 5. Channels

**Automatic (via Zernio):** Instagram (business account) and Threads for l2u. Other Zernio channels (Facebook, YouTube, TikTok, X, LinkedIn, Bluesky, …) are available per product but off by default.

**Can't be automated, off by default:** Naver Blog (no posting API since 2020), Naver Cafe, Reddit, HN. If the owner turns one on, reviewed drafts appear in "Waiting for you" with "Copy & open" and "Skip". Drafts expire after 7 days. If the owner never looks, nothing breaks.

The system picks which channels to suggest based on the product's language and audience. Korean travel → Instagram, Threads, and Naver. English dev tool → X, Bluesky, Dev.to, and so on.

**Account-safety rules** (from Ho Young's incidents):
- A person creates every account and does every login. No automated sign-ups.
- No automated likes, follows, or comments.
- Every profile bio says AI is used.
- **Slow start** (my call): for the first 2 weeks on a channel, half the normal posting volume. The incident behind these rules was a TikTok account suspended after being signed up through an automated browser.

## 6. Content rules

- Polite, calm, and informative. Give useful information; don't sell hard.
- Only claims found in the fact sheet. No made-up numbers, reviews, or urgency.
- **No specific prices** (my call). Prices change daily and member prices sit behind a login, so posts mention the member discount only in general terms ("회원가로 더 저렴하게"). The researcher never logs in.
- No competitor comparisons and no jokes at anyone's expense.
- The member discount or offer is mentioned once per post, with the tracked link.
- An automatic banned-phrase check runs before the reviewer, with a default list plus the owner's own words. For l2u: 최저가 보장, 마감 임박, 100%, and any savings not in the fact sheet.
- When in doubt, block.

## 7. Post formats (v1)

- **Instagram: 카드뉴스 (card-news) carousels.** 5–7 slides. Each slide is a real destination photo with one short, useful tip. The last slide has the offer and the link (link also in the caption and bio).
- **Threads: text-first** posts with the same tips, plus one photo when it helps.
- **Photos:** Unsplash and Pexels APIs (free, licensed for commercial use, real places), with credit where the license asks for it. Stock photos only ever show the **area** (city, beach, street), never a building that could be mistaken for a specific hotel. The slide carries a small "이미지는 지역 사진입니다" note (my call). The owner can optionally upload their own photos that they have rights to.
- **Slides are rendered by the dashboard app** from a slide spec the writer produces (photo + text + layout) and served as image URLs that Zernio can fetch.

## 8. Tracked links

- Every post gets its own short link: `<app-domain>/go/<code>` → redirect to the product URL with UTM tags.
- Each click is counted with the post, channel, and time. No personal data is stored. Obvious bots are filtered out by user agent.
- The owner can point their own short domain at the app if they want.
- **Instagram** (my call): captions can't hold clickable links, so the app serves a **link-in-bio page** listing recent posts, each with its own tracked link. The owner sets the bio link to it once during setup. Clicks are still counted per post.

## 9. Dashboard

A login-protected web app, with a product switcher at the top, and five tabs:

- **Overview:** clicks this week, a clicks-per-day chart, top posts, what's posting next, and channel status.
- **Posts:** every post with its channel, text, slides, reviewer verdict (including blocked posts and why), and clicks.
- **Waiting for you:** drafts for non-automatable channels.
- **Channels:** an on/off switch per channel and connection status ("reconnect" when a login expires).
- **Settings:** product URL, target users, language, tone notes, banned words, posting frequency, and the editable fact sheet and playbook.

## 10. Tech choices

- **Brain:** Claude Code scheduled cloud agents on the owner's Claude subscription.
- **Posting:** Zernio API (formerly Late). Free for 2 accounts, then about $6 per account per month.
- **App:** one web app on Vercel holding the dashboard, API, link redirects, and slide rendering, plus a small Postgres database from the Vercel Marketplace.
- **Photos:** Unsplash and Pexels APIs.
- **License:** MIT (my call).

## 11. Defaults (my calls, editable in Settings)

- Instagram: 1 carousel a day. Threads: 2 posts a day. Times spread across the day in the product's timezone.
- The writer makes about 20% "new experiment" posts and 80% posts following the playbook.
- Fact sheet refreshed weekly. If a fact disappears from the site, posts using it stop.

## 12. Left to the builder

- Framework, database schema, and code structure.
- Slide layout and design.
- How the setup command creates the cloud agents.
- How retries work when Zernio or a photo API fails (sensible default: retry twice, then log it on the dashboard).

## 13. Things to verify before building

- Claude Code scheduled cloud agents can call an outside API (network access) and run daily on a subscription.
- Zernio supports Instagram carousels and Threads, and its actual pricing.
- Subscription usage limits hold up with daily runs across several products.
