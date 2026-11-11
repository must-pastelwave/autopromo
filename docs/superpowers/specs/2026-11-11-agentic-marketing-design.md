# Agentic marketing system: design

Date: 2026-11-11 · v2 (after Ho Young's review the same day) · Working name: **autopromo**

## What changed in v2

1. **Claude runs on an API key, not the owner's subscription.** Anthropic's Agent SDK docs don't allow third-party products to offer claude.ai login or subscription rate limits. Agents run as scheduled GitHub Actions with the owner's `ANTHROPIC_API_KEY`. The cost line is now API usage.
2. **The first product is Stay2U (stay2u.com) and its membership**, not l2u.co.kr.
3. **Success = membership sign-ups and purchases** that came through our tracked links. Clicks are the early signal.
4. **Prices are allowed**, but only as stated on the product site (the membership is a paid product).
5. **Every channel starts in "approve first" mode.** A person approves each post until the owner turns on auto-publish for that channel.
6. **Low volume on new accounts:** 1 post a day per account by default. Raise it only after posts go through cleanly.
7. **This is judged over months.** Weekly numbers are signals for tuning, not the verdict.

## 1. What and why

An open-source system that promotes a product on social media with as little attention as possible. The owner enters the product URL and who it's for, connects their accounts once, and approves posts while trust is built. After that, they switch channels to auto-publish and leave it. It works out what to say, makes the posts, has them reviewed, publishes them, measures what they bring in, and improves over time.

**First product: Stay2U (stay2u.com).** S2U is a lodging membership from 레저투유 (the company behind L2U). The member pays a refundable deposit (Silver 5,000,000 / Gold 10,000,000 / Platinum 20,000,000 KRW) and gets monthly lodging support (100,000 / 220,000 / 480,000 KRW) for 3 years. The deposit comes back at the end of the term after settlement. Leaving early costs a 20% penalty plus deductions. People sign up through a free consultation request (a form on the site, phone, or KakaoTalk), then sign a contract.

**Success** = membership sign-ups (consultation requests) and purchases (signed contracts) that came through our tracked links. Clicks are the leading indicator we can see right away.

## 2. Goals, non-goals, anti-goals

**Goals**
- After the approval period, it runs for weeks with no one attending.
- Works for any product and audience. Stay2U is just the first.
- Anyone can run their own copy: fork, deploy, connect, done in about 30 minutes.
- More sign-ups over months, because it learns which topics and formats bring them.

**Non-goals (v1)**
- Video (Reels and Shorts). That comes in v2, made from the same slides.
- Replying to comments, liking, or following.
- Paid ads.
- Attributing phone and KakaoTalk sign-ups (only the site form can report back automatically).
- A hosted service.

**Anti-goals: any of these is a failure, even if it "works"**
- It posts something false or misleading, such as a price, a benefit, or "deposit back" without its conditions.
- It sounds pushy, or like an investment ("수익", "원금 보장", "공짜 숙박").
- It gets an owner's account banned or restricted, including the owner's Claude account.
- It automates channels that forbid automation.

## 3. How the owner experiences it

1. Fork the repo and deploy the dashboard to Vercel (free tier) with a Postgres database (Neon via the Vercel Marketplace).
2. Create a Zernio account and connect the social accounts **by hand**. Paste the Zernio API key into Vercel's env vars.
3. In the fork's GitHub settings, add `ANTHROPIC_API_KEY`, `APP_URL` and `AGENT_TOKEN` as secrets. The agents run on GitHub Actions' schedule.
4. In the dashboard, enter the product URL (the page tracked links go to), target users, language, and timezone.
5. For a while: open **Waiting for you**, approve or skip each reviewed post.
6. When a channel's posts go through cleanly, switch it to **auto-publish**. Check the dashboard occasionally.

## 4. The agents

Claude Code runs headless in GitHub Actions (`anthropics/claude-code-action`) with the owner's API key, reading prompt files from the repo.

| Agent | When | What it does |
|---|---|---|
| **Researcher** | Weekly + on setup | Reads the product site and writes the **fact sheet**: every fact, including membership prices, benefits and conditions, with the page it came from. It's the only source of claims, and the owner can edit it. |
| **Writer** | Daily | Picks useful topics for the target users and writes posts per enabled channel. Adds real photos and makes about 20% experiments. Revises blocked posts once. |
| **Reviewer** | Daily, after the writer, in a fresh session | Checks every draft against the rules and the fact sheet. Passes it or blocks it with a reason. When unsure, it blocks. |
| **Analyst** | Weekly | Rewrites the **playbook** from 28- and 90-day numbers, weighted toward sign-ups, not clicks. |

**Publishing is code, not an agent.** A post the reviewer passes goes to "Waiting for you" if the channel is in approve-first mode, or straight to Zernio if it's on auto-publish.

**Cost (my estimate, to measure after week 1):** with Claude Opus 5.5 ($4 input / $20 output per million tokens, $0.20 for cached reads), about **$1 per writer run** and $0.50 per reviewer run. That's roughly **$50–60 a month per product**. Switching the agents to Sonnet 5.5 would be about half that. Each job has a turn cap so a confused run can't run up a bill. GitHub Actions is free for public repos. Zernio is free for 2 accounts.

## 5. Channels

**Automatic (via Zernio):** Instagram (business account) and Threads for Stay2U. Other Zernio channels are available but off.

**Every automatable channel starts in approve-first mode.** Reviewed posts wait for one tap. The owner turns on auto-publish per channel after posts go through cleanly (Ho Young's guide: when fewer than about 10% need correcting).

**Can't be automated:** Naver Blog, Naver Cafe, Reddit, HN. Drafts only, with "Copy & open".

**Account safety** (from Ho Young's incidents):
- A person creates every account and does every login.
- No automated likes, follows, or comments.
- Every bio says AI is used.
- New accounts post 1 a day. Each channel's first 14 days run at half volume if the owner raises it.

## 6. Content rules

- Polite, calm, and informative. Useful first, selling second.
- Only claims from the fact sheet. **Prices and benefits exactly as on the site.** A fact's conditions travel with it: never "deposit back" without "at the end of the 3-year term, after settlement".
- Never hotel room rates, which change daily. Membership prices are fine.
- No competitor comparisons, no jokes at anyone's expense, no investment language.
- One call to action per post, with the tracked link.
- Automatic banned-phrase check before review: the defaults (`최저가 보장`, `마감 임박`, `100%`) plus the product's own list. For Stay2U: `수익`, `원금 보장`, `공짜`, `무료 숙박`, `무조건`.
- When in doubt, block.

## 7. Post formats (v1)

- **Instagram:** 카드뉴스 carousels, 5–7 slides. A real photo with one short tip per slide. The last slide carries the offer, and the link goes in the bio.
- **Threads:** text-first, optionally one photo, with the link in the post.
- **Photos:** Unsplash and Pexels (licensed, real places), credited. Slides with stock photos say `이미지는 지역 사진입니다`.

## 8. Tracked links and conversions

- Every post has its own link: `<app>/go/<code>`. Each real click is counted (bots filtered out) and redirects to the product URL with UTM tags plus `ap_click=<click id>`.
- **Conversions:** the product site keeps `ap_click` from the landing URL. When a consultation request or contract happens, its backend calls `POST <app>/api/conversions` with a secret token: `{click_id, kind: 'signup'|'purchase', value?, external_id?}`. That ties the sign-up to the exact post. `external_id` keeps retries from double-counting.
- No personal data is stored: no names, phones, or emails. Only ids, kind, value, and time.
- **Stay2U needs one change on its site:** keep `ap_click` and report consultation requests (and later, contracts) to that endpoint. Phone and KakaoTalk sign-ups won't be attributed.

## 9. Dashboard

Login-protected, with a product switcher and five tabs:

- **Overview:** sign-ups, purchases, and clicks for the last 7 days, 28 days, 90 days, and since start. A clicks/sign-ups chart, top posts by sign-ups then clicks, what's posting next, and channel status. A note says weekly numbers are signals.
- **Posts:** every post with its slides, reviewer verdict, clicks, sign-ups, and purchases.
- **Waiting for you:** reviewed posts to approve (scheduled via Zernio) or skip, plus drafts-only channels with "Copy & open".
- **Channels:** on/off, auto-publish on/off, Zernio account, and reconnect status.
- **Settings:** product fields, fact sheet, playbook, and the Instagram bio link.

## 10. How we judge it

- Look at month-over-month sign-ups, not one week.
- The analyst drops a topic or format only after at least 8 posts and 4 weeks of data.
- First real verdict after about 3 months. Weekly reports are for tuning.

## 11. Tech

Next.js on Vercel (dashboard, API, redirects, slide rendering, publishing). Postgres on Neon. Zernio API. Unsplash and Pexels APIs. Claude Code in GitHub Actions with `ANTHROPIC_API_KEY`. MIT license.

## 12. Things to verify before launch

- Zernio supports Instagram carousels and Threads, and its real pricing (Task 0).
- Stay2U's site change for `ap_click` and the conversion call: who builds it.
- Measured API cost after the first week, compared with the estimate.
