-- Bereits eingerichtet am 10.11.2026. Nur zur Dokumentation.
create table if not exists public.hq_auftraege (
  id text primary key,
  bot text not null check (bot in ('pixel','forge','guard','critic','planner','finance','spark','leno')),
  text text not null,
  status text not null default 'laeuft' check (status in ('offen','laeuft','erledigt')),
  ergebnis text,
  erstellt timestamptz not null default now(),
  erledigt_am timestamptz
);
alter table public.hq_auftraege enable row level security;
revoke all on public.hq_auftraege from anon, authenticated;

create or replace function public.hq_feed() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('auftraege', coalesce(json_agg(json_build_object(
    'id',id,'bot',bot,'text',text,'status',status,'ergebnis',ergebnis) order by erstellt), '[]'::json))
  from (select * from public.hq_auftraege order by erstellt desc limit 50) t;
$$;
revoke all on function public.hq_feed() from public;
grant execute on function public.hq_feed() to anon, authenticated;

-- Neuer Auftrag (STARK):
-- insert into public.hq_auftraege (id, bot, text) values ('a-20261110-1830-forge', 'forge', 'Kurzbeschreibung');
-- Auftrag fertig (STARK):
-- update public.hq_auftraege set status='erledigt', ergebnis='Kurzes Ergebnis', erledigt_am=now() where id='a-20261110-1830-forge';
