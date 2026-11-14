create table if not exists products (
  id serial primary key, slug text unique not null, url text not null, name text not null,
  audience text not null, language text not null default 'ko', timezone text not null default 'Asia/Seoul',
  tone_notes text not null default '', banned_words text[] not null default '{}',
  fact_sheet jsonb not null default '[]',   -- [{fact, source_url}]
  playbook text not null default '', ig_per_day int not null default 1, threads_per_day int not null default 1,
  active boolean not null default true, created_at timestamptz not null default now());
create table if not exists channels (
  id serial primary key, product_id int not null references products, platform text not null,
  zernio_account_id text, enabled boolean not null default false, automatable boolean not null,
  started_at timestamptz, needs_reconnect boolean not null default false,
  auto_publish boolean not null default false,   -- approve-first until the owner turns this on
  unique (product_id, platform));
create table if not exists posts (
  id serial primary key, product_id int not null references products, channel_id int not null references channels,
  client_key text not null, kind text not null check (kind in ('carousel','text','video')),
  caption text not null, slides jsonb not null default '[]',   -- [{text, photo_url, photo_credit}]
  topic text not null, format_tag text not null, is_experiment boolean not null default false,
  facts_used int[] not null default '{}',   -- indexes into fact_sheet
  status text not null default 'draft' check (status in
    ('draft','blocked','dropped','passed','scheduled','published','failed','waiting','skipped','expired')),
  review_reason text, revision int not null default 0, scheduled_for timestamptz,
  zernio_post_id text, error text, link_code text unique not null, created_at timestamptz not null default now(),
  unique (product_id, client_key));
create table if not exists clicks (id bigserial primary key, post_id int not null references posts, at timestamptz not null default now());
create index if not exists clicks_post on clicks(post_id);
-- Sign-ups and purchases reported by the product site. No personal data: ids, kind, value, time.
create table if not exists conversions (
  id bigserial primary key, post_id int not null references posts, click_id bigint references clicks,
  kind text not null check (kind in ('signup','purchase')), value numeric, external_id text,
  at timestamptz not null default now(), unique (kind, external_id));
create index if not exists conversions_post on conversions(post_id);

-- Upgrades for databases created before these columns existed (safe to re-run).
alter table channels add column if not exists auto_publish boolean not null default false;
alter table products alter column threads_per_day set default 1;
alter table posts drop constraint if exists posts_kind_check;
alter table posts add constraint posts_kind_check check (kind in ('carousel','text','video'));
-- When a post last changed status: waiting expiry and stuck-post recovery count from here.
alter table posts add column if not exists status_changed_at timestamptz not null default now();
create or replace function stamp_status_change() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then new.status_changed_at := now(); end if;
  return new;
end $$;
create or replace trigger posts_status_changed before update on posts for each row execute function stamp_status_change();
-- Failed dashboard logins, for a simple global rate limit. Only timestamps.
create table if not exists login_failures (at timestamptz not null default now());
create index if not exists login_failures_at on login_failures(at);
-- One Zernio profile per product, created when the owner first connects an account from the Channels page.
alter table products add column if not exists zernio_profile_id text;
-- Dynamic products: posts per day live on each channel; the researcher fills blank product fields.
alter table channels add column if not exists per_day int not null default 1;
update channels c set per_day = greatest(1, pr.ig_per_day) from products pr where pr.id = c.product_id and c.platform = 'instagram' and c.per_day = 1;
update channels c set per_day = greatest(1, pr.threads_per_day) from products pr where pr.id = c.product_id and c.platform = 'threads' and c.per_day = 1;
alter table products add column if not exists researched_at timestamptz;
alter table products alter column audience set default '';
alter table products alter column language set default '';
-- Plans: every post comes from an item of a plan the owner confirmed.
create table if not exists plans (
  id serial primary key, product_id int not null references products,
  status text not null default 'draft' check (status in ('draft','revising','confirmed','done','superseded')),
  starts_on date not null, ends_on date not null,
  strategy jsonb not null default '{}',   -- {goal, cta, audience, channels:[{platform, why}], themes:[{name, why}], rules:[...]}
  feedback text not null default '', revision int not null default 0,
  created_at timestamptz not null default now(), confirmed_at timestamptz);
create index if not exists plans_product on plans(product_id, starts_on);
create table if not exists plan_items (
  id serial primary key, plan_id int not null references plans on delete cascade,
  day date not null, platform text not null,
  format text not null check (format in ('post','carousel','video','draft')),
  theme text not null, topic text not null, angle text not null default '', facts int[] not null default '{}',
  status text not null default 'planned' check (status in ('planned','written','skipped')));
create index if not exists plan_items_plan on plan_items(plan_id, day);
alter table posts add column if not exists plan_item_id int references plan_items;
-- The journey: when each agent last tried a product (bounds retries), and when a confirmed plan was kicked off.
alter table products add column if not exists agent_tried jsonb not null default '{}';
alter table plans add column if not exists kicked_off_at timestamptz;
-- Agent runs, so the owner can see queued → running → done with times instead of guessing.
create table if not exists agent_runs (
  id serial primary key, gh_run_id bigint unique, jobs text not null, product_ids int[] not null default '{}',
  status text not null check (status in ('queued','running','done','failed')),
  url text, requested_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz);
create index if not exists agent_runs_products on agent_runs using gin (product_ids);
-- Independent campaign tracking: platform metrics per post and followers per account, synced from Zernio.
create table if not exists post_metrics (
  post_id int primary key references posts on delete cascade,
  impressions int not null default 0, reach int not null default 0, views int not null default 0,
  likes int not null default 0, comments int not null default 0, shares int not null default 0, saves int not null default 0,
  platform_clicks int not null default 0, engagement_rate numeric not null default 0, post_url text,
  updated_at timestamptz not null default now());
create table if not exists follower_counts (
  channel_id int not null references channels on delete cascade, day date not null, followers int not null,
  primary key (channel_id, day));
create table if not exists sync_state (key text primary key, at timestamptz not null, note text not null default '');
-- Owner asked to write a plan item again (after its post was blocked): bypasses the writer cool-down once.
alter table plan_items add column if not exists retry_at timestamptz;
-- Goals: any number autopromo can measure, several per product. The planner works backwards from them.
create table if not exists goals (
  id serial primary key, product_id int not null references products on delete cascade,
  metric text not null check (metric in ('signups','purchases','clicks','seen','engaged','followers','github_stars')),
  source text not null default '',   -- github_stars: "owner/repo"
  target_1m int, target_3m int, created_at timestamptz not null default now());
create index if not exists goals_product on goals(product_id);
-- Outside counters (GitHub stars), one value per day.
create table if not exists counter_snapshots (
  source text not null, metric text not null, day date not null, value int not null, primary key (source, metric, day));
-- 2026-11-13 had one goal as product columns: move it into goals once.
do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'products' and column_name = 'goal_1m') then
    insert into goals (product_id, metric, target_1m, target_3m)
      select id, case goal_kind when 'purchase' then 'purchases' else 'signups' end, goal_1m, goal_3m
      from products where goal_1m is not null or goal_3m is not null;
    alter table products drop column goal_kind, drop column goal_1m, drop column goal_3m;
  end if;
end $$;
-- Channels posted to directly, without Zernio. target: the Telegram chat ("@channel" or its id) or the Discord webhook URL.
alter table channels add column if not exists target text;
insert into channels (product_id, platform, automatable)
  select p.id, x.platform, true from products p cross join (values ('telegram'), ('discord')) x(platform)
  where not exists (select 1 from channels c where c.product_id = p.id and c.platform = x.platform);
-- A person, counted once per post: a one-way hash of IP + browser (no raw IP kept). Old clicks have none.
alter table clicks add column if not exists visitor text;
-- Channels dropped on 2026-11-14. Ones with posts stay (history), switched off; the app hides them.
update channels set enabled = false where platform in ('instagram','facebook','x','youtube','bluesky','naver_blog','naver_cafe','hackernews');
delete from channels c where platform in ('instagram','facebook','x','youtube','bluesky','naver_blog','naver_cafe','hackernews')
  and not exists (select 1 from posts x where x.channel_id = c.id);

-- Places: communities beyond our own channels (Telegram/Discord groups, subreddits, forums, newsletters...).
-- The scout suggests them, the owner approves. 'auto' places post by themselves (their admin added our bot or gave a webhook);
-- 'paste' places get the post on the Places page for the owner to paste there.
create table if not exists places (
  id serial primary key, product_id int not null references products on delete cascade,
  name text not null, url text not null, kind text not null,
  how text not null default 'paste' check (how in ('auto','paste')),
  target text,   -- auto places: Telegram chat id or Discord webhook URL
  members int, rules text not null default '', why text not null default '', per_week int not null default 1,
  status text not null default 'suggested' check (status in ('suggested','approved','rejected')),
  created_at timestamptz not null default now(), unique (product_id, url));
-- One published post shared to one place, with its own tracked link, so people are counted per place.
create table if not exists shares (
  id serial primary key, post_id int not null references posts, place_id int not null references places on delete cascade,
  link_code text unique not null, status text not null default 'todo' check (status in ('todo','posted','skipped','failed')),
  error text, created_at timestamptz not null default now(), posted_at timestamptz, unique (post_id, place_id));
alter table clicks add column if not exists share_id int references shares on delete set null;
-- A person counts once per post and place (share_id 0 = our own channel).
drop index if exists clicks_post_visitor;
create unique index if not exists clicks_person on clicks(post_id, (coalesce(share_id, 0)), visitor);
-- Each share is written for its place (the writer adapts the post to the place's rules and format) and reviewed before it's shown or sent.
alter table shares add column if not exists text text;
alter table shares add column if not exists text_status text not null default 'needed';
alter table shares add column if not exists review_reason text;
alter table shares add column if not exists revision int not null default 0;
