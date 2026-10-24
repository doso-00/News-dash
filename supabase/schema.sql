-- Cinque al Mattino: shared players table.
-- Paste into Supabase → SQL Editor → New query, then Run. Safe to run more than once.
--
-- Sign-in is by username only (no password), so anyone with the app's link can
-- read profiles and update progress. Nothing private is stored here: the app
-- never uploads the Claude API key or the written answers to reflection questions.

create table if not exists public.players (
  username   text primary key check (username ~ '^[a-z0-9_.]{3,20}$'),
  first_name text not null check (char_length(first_name) between 1 and 40),
  last_name  text not null check (char_length(last_name) between 1 and 40),
  state      jsonb not null default '{}'::jsonb check (pg_column_size(state) < 500000),
  stats      jsonb not null default '{}'::jsonb check (pg_column_size(stats) < 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.players enable row level security;

drop policy if exists "players are readable" on public.players;
create policy "players are readable" on public.players
  for select to anon, authenticated using (true);

drop policy if exists "anyone can register" on public.players;
create policy "anyone can register" on public.players
  for insert to anon, authenticated with check (true);

drop policy if exists "progress can be updated" on public.players;
create policy "progress can be updated" on public.players
  for update to anon, authenticated using (true) with check (true);

-- No delete policy: profiles can't be removed from the app.
-- Only progress columns are writable after sign-up, so names and usernames can't be changed.
revoke all on public.players from anon, authenticated;
grant select, insert on public.players to anon, authenticated;
grant update (state, stats, updated_at) on public.players to anon, authenticated;
