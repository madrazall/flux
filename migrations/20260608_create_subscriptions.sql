-- Flux migration: subscription tracking
-- Run in Supabase → SQL Editor → New Query

create table if not exists subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'inactive',
  price_id text,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Users can only read their own subscription row (not write — webhook uses service role)
alter table subscriptions enable row level security;

create policy "users can read own subscription" on subscriptions
  for select using (auth.uid() = user_id);
