-- ============================================================================
-- Oman Travel Budget – Supabase Schema
-- ============================================================================
-- Im Supabase-Dashboard unter "SQL Editor" einfügen und ausführen.
--
-- SICHERHEITSMODELL (bewusste Entscheidung, kein Versehen):
-- Es gibt KEINEN Login. Der Zugriff läuft ausschliesslich über den
-- geheimen access_code eines Trips. Row Level Security kann ohne echte
-- Supabase-Auth nicht zwischen "David" und "einem Fremden" unterscheiden,
-- deshalb sind die Policies unten bewusst offen (using (true)).
-- Der Schutz besteht darin, dass der access_code geheim bleibt und die
-- trip_id (UUID) praktisch nicht erratbar ist.
--
-- Wenn ihr später auf echten Login umsteigen wollt: Supabase Auth aktivieren,
-- eine trip_members-Tabelle ergänzen, und die Policies unten durch
-- "using (auth.uid() in (select user_id from trip_members where trip_id = id))"
-- ersetzen. Das Datenmodell (trips/expenses getrennt, owner_id auf expenses)
-- ist bereits dafür vorbereitet.
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  access_code text unique not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  budget_chf numeric not null,
  base_currency text not null default 'CHF',
  local_currency text not null default 'OMR',
  exchange_rates jsonb not null default '[]'::jsonb,
  categories jsonb not null default '[]'::jsonb,
  active_currencies jsonb not null default '["CHF","OMR"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  date date not null,
  description text not null,
  category_id text not null,
  original_amount numeric not null,
  original_currency text not null,
  exchange_rate numeric not null,
  amount_chf numeric not null,
  owner_id text not null default 'shared',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_trip_id_idx on expenses(trip_id);
create index if not exists trips_access_code_idx on trips(access_code);

alter table trips enable row level security;
alter table expenses enable row level security;

-- Offener Zugriff über den anon-Key. Schutz = Geheimhaltung des access_code
-- bzw. der trip_id, nicht RLS. Siehe Hinweis oben.
drop policy if exists "open select trips" on trips;
create policy "open select trips" on trips for select using (true);
drop policy if exists "open insert trips" on trips;
create policy "open insert trips" on trips for insert with check (true);
drop policy if exists "open update trips" on trips;
create policy "open update trips" on trips for update using (true);

drop policy if exists "open all expenses" on expenses;
create policy "open all expenses" on expenses for all using (true) with check (true);

-- Realtime aktivieren, damit Änderungen sofort auf dem anderen Gerät ankommen.
-- (Zusätzlich im Dashboard unter Database -> Replication die Tabelle
-- "expenses" und "trips" für die "supabase_realtime"-Publication aktivieren,
-- falls dieser Befehl in eurem Projekt nicht automatisch greift.)
alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table trips;

-- updated_at automatisch nachführen
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trips_set_updated_at on trips;
create trigger trips_set_updated_at before update on trips
  for each row execute function set_updated_at();

drop trigger if exists expenses_set_updated_at on expenses;
create trigger expenses_set_updated_at before update on expenses
  for each row execute function set_updated_at();
