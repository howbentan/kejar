-- Ping spike tables. THROWAWAY: dropped by 0002_drop_spike.sql once the
-- spike result is recorded (plan 1, task 7). Not part of the real game schema.

create table spike_devices (
  id uuid primary key,
  label text not null,
  platform text not null check (platform in ('ios', 'android', 'other')),
  subscription jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table spike_pings (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  sent_count int not null default 0,
  -- Devices the ping was sent to; the per-device denominator in the report.
  target_ids uuid[] not null default '{}'
);

create table spike_acks (
  ping_id uuid not null references spike_pings (id) on delete cascade,
  device_id uuid not null references spike_devices (id) on delete cascade,
  received_at timestamptz not null default now(),
  primary key (ping_id, device_id)
);

create table spike_checkins (
  ping_id uuid not null references spike_pings (id) on delete cascade,
  device_id uuid not null references spike_devices (id) on delete cascade,
  created_at timestamptz not null default now(),
  lat float8,
  lng float8,
  accuracy_m float8,
  error text,
  unique (ping_id, device_id)
);

alter table spike_devices enable row level security;
alter table spike_pings enable row level security;
alter table spike_acks enable row level security;
alter table spike_checkins enable row level security;

-- Anyone with the link can read the spike data (it is a short-lived test).
create policy spike_devices_read on spike_devices for select to anon using (true);
create policy spike_pings_read on spike_pings for select to anon using (true);
create policy spike_acks_read on spike_acks for select to anon using (true);
create policy spike_checkins_read on spike_checkins for select to anon using (true);

-- Phones register themselves and submit check-ins. Pings and acks are
-- written only by the server functions using the service role.
create policy spike_devices_insert on spike_devices for insert to anon with check (true);
create policy spike_devices_update on spike_devices for update to anon using (true) with check (true);
create policy spike_checkins_insert on spike_checkins for insert to anon with check (true);
