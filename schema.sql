create table if not exists products (
  id serial primary key, slug text unique not null, url text not null, name text not null,
  audience text not null, language text not null default 'ko', timezone text not null default 'Asia/Seoul',
  tone_notes text not null default '', banned_words text[] not null default '{}',
  fact_sheet jsonb not null default '[]',   -- [{fact, source_url}]
  playbook text not null default '', ig_per_day int not null default 1, threads_per_day int not null default 2,
  active boolean not null default true, created_at timestamptz not null default now());
create table if not exists channels (
  id serial primary key, product_id int not null references products, platform text not null,
  zernio_account_id text, enabled boolean not null default false, automatable boolean not null,
  started_at timestamptz, needs_reconnect boolean not null default false, unique (product_id, platform));
create table if not exists posts (
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
create table if not exists clicks (id bigserial primary key, post_id int not null references posts, at timestamptz not null default now());
create index if not exists clicks_post on clicks(post_id);
