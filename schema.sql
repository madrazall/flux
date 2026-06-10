-- Flux — run this in Supabase -> SQL Editor -> New Query
-- Fresh install. Safe to re-run.

-- ── User daily data ───────────────────────────────────────────────────────
create table if not exists user_data (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) on delete cascade not null unique,
  today_key  text,
  blocks     jsonb default '[]',
  tasks      jsonb default '[]',
  tags       jsonb default '[]',
  mood       int  default 2,
  day_note   text default '',
  wins       text default '',
  hard       text default '',
  shifts     jsonb default '[]',
  updated_at timestamptz default now()
);

-- ── Archived days ─────────────────────────────────────────────────────────
create table if not exists archive (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  day_key    text not null,
  data       jsonb not null,
  created_at timestamptz default now(),
  unique(user_id, day_key)
);

-- ── Calendar events ───────────────────────────────────────────────────────
create table if not exists events (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  event_id   text not null,
  data       jsonb not null,
  created_at timestamptz default now(),
  unique(user_id, event_id)
);

-- ── Journal entry type ────────────────────────────────────────────────────
do $$
begin
  create type journal_entry_type as enum ('note', 'done', 'stuck', 'follow_up');
exception
  when duplicate_object then null;
end
$$;

-- ── Journal entries ───────────────────────────────────────────────────────
create table if not exists journal_entries (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references auth.users(id) on delete cascade not null,
  day_key      text not null,
  created_at   timestamptz default now() not null,
  updated_at   timestamptz default now() not null,
  type         journal_entry_type not null,
  text         text not null,
  tag_id       text,
  tag_label    text,
  block_id     text,
  task_id      text,
  pinned       boolean default false not null,
  archived     boolean default false not null,
  source       text not null check (source in ('manual', 'eod_generated', 'task_converted')),
  position     integer,
  mood_delta   smallint,
  deleted_at   timestamptz,
  legacy_source text,
  check (char_length(trim(text)) > 0)
);

create unique index if not exists uq_journal_legacy_once
  on journal_entries (user_id, day_key, legacy_source)
  where legacy_source is not null;

create index if not exists idx_journal_user_day_created
  on journal_entries (user_id, day_key, created_at);

create index if not exists idx_journal_user_pinned_archived
  on journal_entries (user_id, pinned, archived);

create index if not exists idx_journal_user_type
  on journal_entries (user_id, type);

create index if not exists idx_journal_user_task
  on journal_entries (user_id, task_id);

create index if not exists idx_journal_user_block
  on journal_entries (user_id, block_id);

-- ── Subscriptions ─────────────────────────────────────────────────────────
create table if not exists subscriptions (
  id                       uuid default gen_random_uuid() primary key,
  user_id                  uuid references auth.users(id) on delete cascade not null unique,
  stripe_customer_id       text,
  stripe_subscription_id   text,
  status                   text not null default 'inactive',
  price_id                 text,
  current_period_end       timestamptz,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

-- ── Row Level Security ────────────────────────────────────────────────────
alter table user_data      enable row level security;
alter table archive        enable row level security;
alter table events         enable row level security;
alter table journal_entries enable row level security;
alter table subscriptions  enable row level security;

do $$ begin
  create policy "users own their data"
    on user_data for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "users own their archive"
    on archive for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "users own their events"
    on events for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "users own their journal entries"
    on journal_entries for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "users can read own subscription"
    on subscriptions for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
