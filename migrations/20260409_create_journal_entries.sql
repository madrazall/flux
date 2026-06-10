-- Flux migration: add journal_entries model with RLS and indexes
-- Safe to run multiple times.

do $$
begin
  create type public.journal_entry_type as enum ('note', 'done', 'stuck', 'follow_up');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  type public.journal_entry_type not null,
  text text not null check (char_length(trim(text)) > 0),

  tag_id text null,
  tag_label text null,
  block_id text null,
  task_id text null,

  pinned boolean not null default false,
  archived boolean not null default false,
  source text not null check (source in ('manual', 'eod_generated', 'task_converted')),

  position integer null,
  mood_delta smallint null,
  deleted_at timestamptz null,

  legacy_source text null
);

create unique index if not exists uq_journal_legacy_once
  on public.journal_entries (user_id, day_key, legacy_source)
  where legacy_source is not null;

create index if not exists idx_journal_user_day_created
  on public.journal_entries (user_id, day_key, created_at);

create index if not exists idx_journal_user_pinned_archived
  on public.journal_entries (user_id, pinned, archived);

create index if not exists idx_journal_user_type
  on public.journal_entries (user_id, type);

create index if not exists idx_journal_user_task
  on public.journal_entries (user_id, task_id);

create index if not exists idx_journal_user_block
  on public.journal_entries (user_id, block_id);

alter table public.journal_entries enable row level security;

drop policy if exists "journal select own" on public.journal_entries;
drop policy if exists "journal insert own" on public.journal_entries;
drop policy if exists "journal update own" on public.journal_entries;
drop policy if exists "journal delete own" on public.journal_entries;

create policy "journal select own"
on public.journal_entries
for select
using (auth.uid() = user_id);

create policy "journal insert own"
on public.journal_entries
for insert
with check (auth.uid() = user_id);

create policy "journal update own"
on public.journal_entries
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "journal delete own"
on public.journal_entries
for delete
using (auth.uid() = user_id);
