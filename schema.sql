-- Run this in Supabase -> SQL Editor -> New Query

-- User daily data (blocks, tasks, mood, legacy journal fields)
create table if not exists user_data (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  today_key text,
  blocks jsonb default '[]',
  tasks jsonb default '[]',
  tags jsonb default '[]',
  mood int default 2,
  day_note text default '',
  wins text default '',
  hard text default '',
  updated_at timestamptz default now()
);

-- Archived days
create table if not exists archive (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  day_key text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  unique(user_id, day_key)
);

-- Calendar events
create table if not exists events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  event_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  unique(user_id, event_id)
);

-- Journal entry type enum
do $$
begin
  create type journal_entry_type as enum ('note', 'done', 'stuck', 'follow_up');
exception
  when duplicate_object then null;
end
$$;

-- Journal entries
create table if not exists journal_entries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  day_key text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  type journal_entry_type not null,
  text text not null,

  tag_id text,
  tag_label text,
  block_id text,
  task_id text,

  pinned boolean default false not null,
  archived boolean default false not null,
  source text not null check (source in ('manual', 'eod_generated', 'task_converted')),

  position integer,
  mood_delta smallint,
  deleted_at timestamptz,

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

-- Row Level Security (locks data to each user)
alter table user_data enable row level security;
alter table archive enable row level security;
alter table events enable row level security;
alter table journal_entries enable row level security;

create policy "users own their data" on user_data
  for all using (auth.uid() = user_id);

create policy "users own their archive" on archive
  for all using (auth.uid() = user_id);

create policy "users own their events" on events
  for all using (auth.uid() = user_id);

create policy "users own their journal entries" on journal_entries
  for all using (auth.uid() = user_id);

-- Idempotent compatibility backfill from existing archive JSON fields
insert into journal_entries (
  user_id, day_key, type, text, pinned, archived, source, legacy_source
)
select
  a.user_id,
  a.day_key,
  'done'::journal_entry_type,
  a.data->>'wins',
  false,
  false,
  'eod_generated',
  'legacy_wins'
from archive a
where coalesce(nullif(trim(a.data->>'wins'), ''), '') <> ''
on conflict do nothing;

insert into journal_entries (
  user_id, day_key, type, text, pinned, archived, source, legacy_source
)
select
  a.user_id,
  a.day_key,
  'stuck'::journal_entry_type,
  a.data->>'hard',
  false,
  false,
  'eod_generated',
  'legacy_hard'
from archive a
where coalesce(nullif(trim(a.data->>'hard'), ''), '') <> ''
on conflict do nothing;

insert into journal_entries (
  user_id, day_key, type, text, pinned, archived, source, legacy_source
)
select
  a.user_id,
  a.day_key,
  'note'::journal_entry_type,
  a.data->>'day_note',
  false,
  false,
  'eod_generated',
  'legacy_day_note'
from archive a
where coalesce(nullif(trim(a.data->>'day_note'), ''), '') <> ''
on conflict do nothing;

-- Idempotent compatibility backfill from current user_data fields
insert into journal_entries (
  user_id, day_key, type, text, pinned, archived, source, legacy_source
)
select
  u.user_id,
  u.today_key,
  'done'::journal_entry_type,
  u.wins,
  false,
  false,
  'eod_generated',
  'legacy_wins'
from user_data u
where coalesce(nullif(trim(u.today_key), ''), '') <> ''
  and coalesce(nullif(trim(u.wins), ''), '') <> ''
on conflict do nothing;

insert into journal_entries (
  user_id, day_key, type, text, pinned, archived, source, legacy_source
)
select
  u.user_id,
  u.today_key,
  'stuck'::journal_entry_type,
  u.hard,
  false,
  false,
  'eod_generated',
  'legacy_hard'
from user_data u
where coalesce(nullif(trim(u.today_key), ''), '') <> ''
  and coalesce(nullif(trim(u.hard), ''), '') <> ''
on conflict do nothing;

insert into journal_entries (
  user_id, day_key, type, text, pinned, archived, source, legacy_source
)
select
  u.user_id,
  u.today_key,
  'note'::journal_entry_type,
  u.day_note,
  false,
  false,
  'eod_generated',
  'legacy_day_note'
from user_data u
where coalesce(nullif(trim(u.today_key), ''), '') <> ''
  and coalesce(nullif(trim(u.day_note), ''), '') <> ''
on conflict do nothing;
