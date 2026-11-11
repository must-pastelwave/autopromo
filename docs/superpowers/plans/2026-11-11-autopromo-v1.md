# autopromo v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An open-source system that promotes a product on Instagram and Threads with nobody attending it. Claude agents write posts and review them, one web app publishes them through Zernio, and every post is measured by clicks.

**Architecture:** One Next.js app on Vercel holds all state (Postgres), the dashboard, the agent API, tracked-link redirects, slide image rendering, and the Zernio publishing. The agents (researcher, writer, reviewer, analyst) are prompt files in the repo. They run as scheduled Claude cloud agents on the owner's subscription, or as GitHub Actions (plan B), and they talk to the app only through its HTTP API with a bearer token.

**Tech Stack:** Next.js 16 (App Router, TypeScript), `postgres` (porsager) on Neon via the Vercel Marketplace, `next/og` for slides, Vitest, Zernio REST API (`https://zernio.com/api/v1`), Unsplash and Pexels APIs.

**Spec:** `docs/superpowers/specs/2026-11-11-agentic-marketing-design.md`

## Plan-level calls (deviations from the spec, on purpose)

- **The Publisher is code, not an agent.** When the reviewer passes a post, the app picks a time slot and calls Zernio itself. Deterministic work doesn't need an LLM, and it removes one scheduled agent.
- **The banned-phrase check is code** and runs when the writer submits a post, before the reviewer sees it.
- **Photo search goes through the app** (`/api/agent/photos`), so the Unsplash and Pexels keys live in one place.
- **Deferred to after v1:** owners uploading their own photos (needs file storage), and automatic channel suggestions (the Channels tab lists every platform, and the owner switches them on).

## Global Constraints

- Success metric is clicks on tracked links only. Store no personal data per click: post id and time only.
- Tone: polite, calm, informative. Only claims from the fact sheet. No specific prices. No competitor comparisons.
- Default banned phrases: `최저가 보장`, `마감 임박`, `100%`, plus each product's own list.
- When in doubt, block. The writer gets one revision of a blocked post; a second block means `dropped`.
- Defaults: Instagram 1 carousel/day, Threads 2 posts/day; half volume for the first 14 days of a channel (`started_at`); 20% experiments.
- Carousels have 5–7 slides. Every slide that shows a stock photo carries the note `이미지는 지역 사진입니다`.
- Non-automatable channels (`naver_blog`, `naver_cafe`, `reddit`, `hackernews`) are off by default. Their posts go to `waiting` and expire after 7 days.
- Zernio: `Authorization: Bearer $ZERNIO_API_KEY`, `POST /v1/posts`, accounts by `_id`, `Idempotency-Key` = our post id. Treat HTTP 207 and `post.status` of `partial` or `failed` as failures.
- The app never holds the owner's Claude login. Secrets live only in env vars: `DATABASE_URL`, `DASHBOARD_PASSWORD`, `AGENT_TOKEN`, `ZERNIO_API_KEY`, `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`, `APP_URL`.
- MIT license. Repo: `github.com/must-pastelwave/autopromo`.

## Review Focus

1. **Link-preview bots count as clicks.** Threads and Instagram fetch every link when posted (`facebookexternalhit`, `meta-externalagent`, `Threadsbot`). These must not be counted. Test in Task 3.
2. **Long Korean text overflows a slide.** A 120-character tip must wrap and shrink, not run off the image. Test in Task 6.
3. **Slots on the wrong day.** "Today" means today in the product's timezone (`Asia/Seoul`), not in UTC. A post made at 23:30 UTC is already the next day in Seoul. Test in Task 8.
4. **Agent retries create duplicate posts.** The writer may resubmit the same post after a timeout. Use the client-supplied `client_key`, unique per product. Test in Task 5.
5. **Zernio partly fails but returns 2xx.** A 207 response, or a status of `partial`, must mark the post `failed` with the error shown on the dashboard. Test in Task 8.

---

## File map

```
schema.sql                      all tables
src/lib/db.ts                   sql client
src/lib/rules.ts                banned-phrase check
src/lib/links.ts                link codes, UTM url, bot filter
src/lib/auth.ts                 owner cookie + agent token checks
src/lib/slots.ts                pick next publish time
src/lib/zernio.ts               Zernio calls
src/lib/photos.ts               Unsplash/Pexels search
src/proxy.ts                    protects dashboard + agent API
src/app/go/[code]/route.ts      tracked redirect
src/app/l/[slug]/page.tsx       link-in-bio page
src/app/api/agent/...           agent API (Task 5)
src/app/api/slide/[postId]/[n]/route.tsx   slide PNG
src/app/(dash)/...              dashboard tabs (Task 9)
agents/*.md                     agent prompts
.github/workflows/agents.yml    plan B scheduler
SETUP.md, README.md, LICENSE
```

---

### Task 0: Check the three unknowns (manual, about 30 min, before any code)

The spec's section 13 lists things that could change the build. Check them by hand and write the answers in `docs/verify.md`.

- [ ] **Step 1: Zernio carousel and Threads.** Make a free Zernio account, connect a test Instagram business account and a Threads account, and send one `POST /v1/posts` with 3 `mediaItems` to Instagram and one text post to Threads (`publishNow: true`). Expected: a carousel on Instagram and a post on Threads. Record the exact `platform` values and any `platformSpecificData` that was needed.
- [ ] **Step 2: Cloud agent network access.** Create a test scheduled cloud agent (`/schedule`) whose prompt runs `curl -s https://httpbin.org/get`. Expected: the output shows JSON. If it's blocked, note it. Plan B (Task 10, GitHub Actions) then becomes the default.
- [ ] **Step 3: Zernio pricing.** Record the real price for 2 and 5 accounts from zernio.com/pricing.
- [ ] **Step 4: Commit** `docs/verify.md`. If any answer contradicts this plan, stop and tell your human partner.

### Task 1: App skeleton and database

**Files:** Create `package.json`, `schema.sql`, `src/lib/db.ts`, `vitest.config.ts`, `.env.example`, `LICENSE` (MIT), `.gitignore`

**Interfaces:**
- Produces: `sql` (tagged template from `postgres`) exported from `src/lib/db.ts`.
- Produces the tables below. Later tasks use these exact column names.

```sql
create table products (
  id serial primary key, slug text unique not null, url text not null, name text not null,
  audience text not null, language text not null default 'ko', timezone text not null default 'Asia/Seoul',
  tone_notes text not null default '', banned_words text[] not null default '{}',
  fact_sheet jsonb not null default '[]',   -- [{fact, source_url}]
  playbook text not null default '', ig_per_day int not null default 1, threads_per_day int not null default 2,
  active boolean not null default true, created_at timestamptz not null default now());
create table channels (
  id serial primary key, product_id int not null references products, platform text not null,
  zernio_account_id text, enabled boolean not null default false, automatable boolean not null,
  started_at timestamptz, needs_reconnect boolean not null default false, unique (product_id, platform));
create table posts (
  id serial primary key, product_id int not null references products, channel_id int not null references channels,
  client_key text not null, kind text not null check (kind in ('carousel','text')),
  caption text not null, slides jsonb not null default '[]',   -- [{text, photo_url, photo_credit}]
  topic text not null, format_tag text not null, is_experiment boolean not null default false,
  facts_used int[] not null default '{}',   -- indexes into fact_sheet
  status text not null default 'draft' check (status in
    ('draft','blocked','dropped','passed','scheduled','published','failed','waiting','skipped','expired')),
  review_reason text, revision int not null default 0, scheduled_for timestamptz,
  zernio_post_id text, error text, link_code text unique not null, created_at timestamptz not null default now(),
  unique (product_id, client_key));
create table clicks (id bigserial primary key, post_id int not null references posts, at timestamptz not null default now());
```

- [ ] **Step 1:** `npx create-next-app@16 . --ts --app --src-dir --no-tailwind --eslint`, then `npm i postgres` and `npm i -D vitest`. Add `"test": "vitest run"`.
- [ ] **Step 2:** Write `schema.sql` (above), `src/lib/db.ts` (`export const sql = postgres(process.env.DATABASE_URL!)`), and `.env.example` listing every env var from Global Constraints.
- [ ] **Step 3:** Run `psql $DATABASE_URL -f schema.sql` against a local Postgres. Expected: no errors. Run `npm run build`. Expected: success.
- [ ] **Step 4: Commit** `chore: app skeleton and schema`.

### Task 2: Banned-phrase check

**Files:** Create `src/lib/rules.ts`, `src/lib/rules.test.ts`

**Interfaces:**
- Produces: `DEFAULT_BANNED: string[]`; `findBanned(text: string, extra: string[]): string[]` returns every banned phrase found (case-insensitive, ignoring spaces inside Korean phrases).

- [ ] **Step 1: Failing tests:**

```ts
test('finds defaults', () => expect(findBanned('지금 최저가 보장!', [])).toEqual(['최저가 보장']))
test('ignores spacing', () => expect(findBanned('마감임박', [])).toEqual(['마감 임박']))
test('product words', () => expect(findBanned('Best DEAL ever', ['best deal'])).toEqual(['best deal']))
test('clean text', () => expect(findBanned('겨울 삿포로 여행 팁', [])).toEqual([]))
```

- [ ] **Step 2:** `npm test rules`. Expected: FAIL.
- [ ] **Step 3:** Implement: compare after lower-casing and removing all whitespace from both sides.
- [ ] **Step 4:** `npm test rules`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: banned-phrase check`.

### Task 3: Tracked links, redirect and link-in-bio page

**Files:** Create `src/lib/links.ts`, `src/lib/links.test.ts`, `src/app/go/[code]/route.ts`, `src/app/l/[slug]/page.tsx`

**Interfaces:**
- Produces: `newCode(): string` (8 chars, `[a-z0-9]`, from `crypto.randomBytes`); `trackedUrl(productUrl: string, p: {channel: string, postId: number, topic: string}): string` adds `utm_source=<channel>&utm_medium=social&utm_campaign=autopromo&utm_content=<postId>` and keeps existing query params; `isBot(ua: string | null): boolean`.

- [ ] **Step 1: Failing tests:**

```ts
test('utm keeps existing params', () =>
  expect(trackedUrl('https://l2u.co.kr/?a=1', {channel:'threads', postId:7, topic:'x'}))
    .toBe('https://l2u.co.kr/?a=1&utm_source=threads&utm_medium=social&utm_campaign=autopromo&utm_content=7'))
test.each(['facebookexternalhit/1.1', 'meta-externalagent/1.1', 'Threadsbot', 'Googlebot', null, ''])
  ('bot: %s', ua => expect(isBot(ua)).toBe(true))
test('real phone', () => expect(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Instagram 350.0')).toBe(false))
test('code shape', () => expect(newCode()).toMatch(/^[a-z0-9]{8}$/))
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `links.ts`. Bot rule: an empty or missing UA, or a match on `/bot|crawl|spider|externalhit|externalagent|preview|curl|wget/i`. The Instagram in-app browser is not a bot.
- [ ] **Step 4:** `GET /go/[code]`: look up the post. If it's unknown, return 404. If `!isBot(ua)`, insert into `clicks(post_id)`. Then return a 302 to `trackedUrl(...)`.
- [ ] **Step 5:** `/l/[slug]`: a public page listing the product's last 12 `published` Instagram posts (first slide image + topic), each linking to `/go/<link_code>`. Mobile-first, no login.
- [ ] **Step 6:** Run the tests. Expected: PASS. Manual check: `curl -I localhost:3000/go/<code>` returns 302 and adds no click (curl counts as a bot).
- [ ] **Step 7: Commit** `feat: tracked links and link-in-bio`.

### Task 4: Owner login and agent token

**Files:** Create `src/lib/auth.ts`, `src/lib/auth.test.ts`, `src/proxy.ts`, `src/app/login/page.tsx`

**Interfaces:**
- Produces: `checkAgent(req: Request): boolean` (header `Authorization: Bearer <AGENT_TOKEN>`, constant-time compare); `sessionValue(): string` = HMAC-SHA256 of the string `'owner'` keyed with `DASHBOARD_PASSWORD`, stored in an httpOnly, secure cookie `ap_session`.
- Rules: `/api/agent/*` requires the agent token. `/go/*`, `/l/*`, `/api/slide/*`, and `/login` are public. Everything else requires the owner cookie, otherwise a redirect to `/login`.

- [ ] **Step 1: Failing tests** for `checkAgent`: right token → true, wrong token → false, missing header → false, `AGENT_TOKEN` unset → false for every request.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with `crypto.timingSafeEqual` (compare equal-length buffers; a length mismatch returns false). Add the login page (a single password field, server action sets the cookie) and `proxy.ts`.
- [ ] **Step 4:** Run. Expected: PASS. Manual check: `/` redirects to `/login`, `/l/x` loads without login.
- [ ] **Step 5: Commit** `feat: owner login and agent token`.

### Task 5: Agent API

**Files:** Create the routes under `src/app/api/agent/` and `src/app/api/agent/agent.test.ts` (calls the route handlers against a test database at `TEST_DATABASE_URL`).

**Interfaces (all JSON, all need the agent token). Used by the agent prompts in Task 10:**

| Method & path | Body / query | Does |
|---|---|---|
| `GET /api/agent/products` | — | active products, each with its enabled channels |
| `PUT /api/agent/products/[id]/facts` | `{facts: [{fact, source_url}]}` | replaces the fact sheet. Any `draft`/`passed`/`scheduled`/`waiting` post whose `facts_used` points at a removed fact → `dropped` (Zernio-scheduled ones are cancelled via Task 8's `cancelPost`) |
| `PUT /api/agent/products/[id]/playbook` | `{playbook}` | saves the playbook |
| `POST /api/agent/posts` | `{product_id, channel_id, client_key, kind, caption, slides, topic, format_tag, is_experiment, facts_used}` | creates the post with a new `link_code`. If `findBanned` hits on the caption or any slide text → `blocked` with reason `banned: ...`. A repeated `client_key` returns the existing post with 200 |
| `GET /api/agent/posts?status=draft` | — | posts waiting for review, including the product's fact sheet and rules |
| `POST /api/agent/posts/[id]/review` | `{verdict: 'pass'|'block', reason}` | `pass` → calls `publish(postId)` from Task 8. `block` → `blocked` |
| `PUT /api/agent/posts/[id]` | same fields as create | revision of a `blocked` post: if `revision` is already 1 → 409 and status `dropped`; otherwise `revision+1`, rerun the banned check, back to `draft` |
| `GET /api/agent/stats?product_id&days=28` | — | per post: topic, format_tag, is_experiment, channel, scheduled_for, clicks |
| `GET /api/agent/photos?q=&n=` | — | Task 7 |

- [ ] **Step 1: Failing tests:** banned caption → `blocked`; same `client_key` twice → one row, second call 200; a second revision → 409 + `dropped`; removing a fact drops a post that used it but not one that didn't; no token → 401.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the routes. Validate the body shape at the boundary (reject unknown `kind`, a carousel with fewer than 5 or more than 7 slides, or an empty caption → 400).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** `feat: agent API`.

### Task 6: Slide images

**Files:** Create `src/app/api/slide/[postId]/[n]/route.tsx`, `public/fonts/NotoSansKR-Bold.ttf` (OFL), `src/lib/fit.ts`, `src/lib/fit.test.ts`

**Interfaces:**
- Produces: `GET /api/slide/<postId>/<n>.png` → a 1080×1350 PNG (`next/og` `ImageResponse`): the photo full-bleed with a dark bottom gradient, the slide text in white, a small credit line `Photo: <credit>` and `이미지는 지역 사진입니다` at the bottom. A slide without a photo uses a plain brand-colour background and no note.
- `fontSizeFor(text: string): number`: 64 for ≤40 chars, 52 for ≤80, 44 above that. Text over 140 chars is cut at 140 with `…`. The writer prompt says keep it under 80.

- [ ] **Step 1: Failing tests** for `fontSizeFor`: 20 chars → 64, 60 → 52, 120 → 44. And `clip(text)`: 150 chars → 141 chars ending in `…`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `fit.ts` and the route.
- [ ] **Step 4:** Run the tests. Expected: PASS. Manual check: open the slide URL for a post with a 120-character Korean tip and confirm the text wraps inside the image and the note is visible.
- [ ] **Step 5: Commit** `feat: slide images`.

### Task 7: Photo search

**Files:** Create `src/lib/photos.ts`, `src/lib/photos.test.ts`, `src/app/api/agent/photos/route.ts`

**Interfaces:**
- Produces: `searchPhotos(q: string, n: number): Promise<{url: string, credit: string, source: 'unsplash'|'pexels'}[]>`. Unsplash first (`GET https://api.unsplash.com/search/photos?query=&orientation=portrait`, header `Authorization: Client-ID <key>`), then Pexels (`GET https://api.pexels.com/v1/search?query=&orientation=portrait`, header `Authorization: <key>`) when Unsplash returns fewer than `n`. Credit format: `<name> / Unsplash` or `<name> / Pexels`. For Unsplash, also hit the photo's `links.download_location` once when used (their API terms).

- [ ] **Step 1: Failing test** with `fetch` mocked: Unsplash returns 1 and Pexels returns 3 → 3 results when `n=3`, Unsplash's result first, credits formatted as above.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Missing keys → skip that source. Both missing → empty array.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** `feat: photo search`.

### Task 8: Publishing (slots + Zernio)

**Files:** Create `src/lib/slots.ts`, `src/lib/slots.test.ts`, `src/lib/zernio.ts`, `src/lib/zernio.test.ts`, `src/lib/publish.ts`, `src/app/api/cron/route.ts`, `vercel.json` (cron every 20 min → `/api/cron`, protected by `CRON_SECRET`)

**Interfaces:**
- `nextSlot(o: {now: Date, tz: string, perDay: number, startedAt: Date | null, taken: Date[]}): Date`: the day is split into `perDay` slots between 09:00 and 21:00 local time, each shifted by +7 minutes. During the first 14 days after `startedAt`, `perDay` is `Math.max(1, Math.ceil(perDay/2))`. Returns the first free slot after `now + 10 min`, rolling over to later days. Days are counted in `tz`.
- `createPost(p: {postId: number, accountId: string, platform: string, caption: string, mediaUrls: string[], scheduledFor: Date}): Promise<{zernioId: string}>`: `POST https://zernio.com/api/v1/posts` with `Idempotency-Key: post-<postId>`. Throws on a non-201/200 status, or if `post.status` is `partial` or `failed`.
- `cancelPost(zernioId: string): Promise<void>`
- `publish(postId: number): Promise<void>`: if the channel isn't automatable → `waiting`. Otherwise compute `nextSlot`, set `scheduled_for`, call `createPost` with the caption plus `\n\n<APP_URL>/go/<code>` for Threads (and for Instagram, `\n\n프로필 링크에서 확인하세요` instead, since links don't work there), the slide URLs as `mediaUrls` → `scheduled`. On an error → `failed` with the message in `error`.
- `/api/cron`: retries `failed` posts once (if `error` isn't a 4xx); marks `scheduled` posts past their time as `published` after checking Zernio's status; marks `waiting` posts older than 7 days as `expired`; sets `channels.needs_reconnect` when Zernio reports an auth error for that account.

- [ ] **Step 1: Failing tests** for `nextSlot`:

```ts
// 2026-11-11T23:30Z is 08:30 on 2026-11-12 in Seoul → first slot that day
expect(nextSlot({now: new Date('2026-11-11T23:30:00Z'), tz:'Asia/Seoul', perDay:2, startedAt:null, taken:[]}))
  .toEqual(new Date('2026-11-12T00:07:00Z'))        // 09:07 KST
// slow start: perDay 2 → 1 in the first 14 days, so the 2nd slot rolls over to the next day
// taken slot rolls to the next one; perDay 1 → 09:07 only
```

  And for `createPost` (fetch mocked): 207 → throws; 201 with `post.status:'partial'` → throws; 201 `scheduled` → returns the id; the `Idempotency-Key` header is `post-42`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Use `Intl.DateTimeFormat` with `timeZone` for local dates. No date library.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** `feat: publishing via Zernio`.

### Task 9: Dashboard

**Files:** Create `src/app/(dash)/layout.tsx` (product switcher via `?p=<slug>` + tab nav), `page.tsx` (Overview), `posts/page.tsx`, `waiting/page.tsx`, `channels/page.tsx`, `settings/page.tsx`, and server actions in `src/app/(dash)/actions.ts`

Server components reading `sql` directly. Plain CSS, light/dark. No chart library: the clicks-per-day chart is an inline SVG polyline.

- **Overview:** this week's clicks, clicks/day for 28 days (SVG), the top 5 posts by clicks, the next 5 scheduled posts, channel status.
- **Posts:** a table of every post: channel, topic, status, review reason, clicks, scheduled time, and the slide thumbnails (`/api/slide/...`). Filter by status.
- **Waiting for you:** `waiting` posts with "Copy & open" (copies the caption + the `/go/` link, opens the platform's write page in a new tab, marks the post `published`) and "Skip" (→ `skipped`).
- **Channels:** per platform, an on/off toggle (enabling sets `started_at` the first time), a Zernio account picker (from `GET /v1/accounts`), and a "reconnect in Zernio" badge when `needs_reconnect` is set. Non-automatable platforms are listed with the label "drafts only".
- **Settings:** a new-product form and edit fields for url, name, audience, language, timezone, tone notes, banned words, per-day counts, the fact sheet (editable rows), the playbook (textarea), and the link-in-bio URL to paste into the Instagram bio.

- [ ] **Step 1:** Build the five pages and the actions.
- [ ] **Step 2: Manual check:** seed one product with two posts and three clicks (`scripts/seed.sql`), open each tab, toggle a channel, and edit a fact. Expected: every change persists after a reload.
- [ ] **Step 3: Commit** `feat: dashboard`.

### Task 10: Agent prompts, scheduling and setup docs

**Files:** Create `agents/researcher.md`, `agents/writer.md`, `agents/reviewer.md`, `agents/analyst.md`, `agents/common.md` (how to call the API: `curl -H "Authorization: Bearer $AGENT_TOKEN" $APP_URL/api/agent/...`, tone rules, "when in doubt, block"), `.github/workflows/agents.yml`, `SETUP.md`, `README.md`

Each prompt says exactly which endpoints to call, in which order, and what "done" means:

- **researcher** (weekly + on demand): for each product, read the product URL and up to 10 linked pages on the same domain. Write only facts that appear on a page, each with its URL. Never log in. Never record prices. `PUT .../facts`.
- **writer** (daily): for each product and each enabled channel, read the fact sheet, playbook, and last 28 days of stats. Make today's posts (Instagram: a 5–7 slide carousel, first slide a hook, last slide the member-discount line; Threads: text under 400 characters). Each slide's text is under 80 characters. About 20% are `is_experiment: true` trying a new topic or format. Photos from `/photos` show areas, never a specific hotel. `client_key` = `<date>-<channel>-<n>`. Then revise any `blocked` post with `revision = 0` once.
- **reviewer** (daily, 1 hour after the writer, fresh session): for each `draft`, check every rule in `common.md` and that every claim matches a fact sheet entry. Output `pass` or `block` + reason. If unsure → `block`.
- **analyst** (weekly): read 28 days of stats and rewrite the playbook in ≤15 lines: which topics, formats, and times win, what to stop, and 2 experiments to try next week.

- [ ] **Step 1:** Write the prompts.
- [ ] **Step 2:** `SETUP.md`: deploy to Vercel → add Neon from the Marketplace → run `schema.sql` → set env vars → Zernio account + connect accounts by hand (AI note in each bio) → open the dashboard, add the product, enable channels → paste `/l/<slug>` into the Instagram bio → create the 4 scheduled agents with `/schedule` (exact prompts: "Read agents/common.md and agents/writer.md in github.com/<you>/autopromo and do it", with times: researcher Mon 06:00, writer daily 07:00, reviewer daily 08:00, analyst Sun 20:00, owner's timezone). Plan B section: the GitHub Actions workflow plus `claude setup-token`, stored as the `CLAUDE_CODE_OAUTH_TOKEN` secret.
- [ ] **Step 3:** `agents.yml`: four scheduled jobs using `anthropics/claude-code-action` with `claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}`, `AGENT_TOKEN` and `APP_URL` from secrets, each prompt `Read agents/common.md and agents/<name>.md and do it`. Disabled by default (`if: vars.USE_ACTIONS == 'true'`).
- [ ] **Step 4: End-to-end check on l2u:** deploy, add l2u.co.kr (audience: "국내외 여행을 계획하는 20–40대 한국인", timezone Asia/Seoul), and run researcher → writer → reviewer once by hand in Claude Code. Expected: a fact sheet with source URLs, at least 1 carousel + 2 Threads posts reviewed, passed ones `scheduled` in Zernio, slides rendering, and `/go/` links redirecting to l2u.co.kr with UTM tags.
- [ ] **Step 5: Commit** `feat: agents and setup docs`.

### Task 11: Publish the repo

- [ ] **Step 1:** Ask your human partner to confirm before creating the public repo. Then `gh repo create must-pastelwave/autopromo --public --source . --push`.
- [ ] **Step 2:** Confirm the README renders and `.env` is not in the repo (`git ls-files | grep -c '^\.env$'` → 0).
