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
