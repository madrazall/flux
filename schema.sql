-- Run this in Supabase → SQL Editor → New Query

-- User daily data (blocks, tasks, mood, journal)
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
  created_at timestamptz default now()
);

-- Row Level Security (locks data to each user)
alter table user_data enable row level security;
alter table archive enable row level security;
alter table events enable row level security;

create policy "users own their data" on user_data
  for all using (auth.uid() = user_id);

create policy "users own their archive" on archive
  for all using (auth.uid() = user_id);

create policy "users own their events" on events
  for all using (auth.uid() = user_id);
