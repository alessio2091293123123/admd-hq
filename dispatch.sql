alter table public.hq_auftraege add column hq_private boolean not null default false;
alter table public.hq_auftraege add column hq_error text;

create or replace function public.hq_feed() returns json
language sql stable security definer set search_path = '' as $$
 select json_build_object('auftraege', coalesce(json_agg(json_build_object(
 'id',id,'bot',bot,'text',text,'status',status,'ergebnis',ergebnis) order by erstellt),'[]'::json))
 from (select * from public.hq_auftraege where not hq_private order by erstellt desc limit 50) t;
$$;

create function public.hq_submit(p_id text,p_bot text,p_text text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare existing public.hq_auftraege; result jsonb;
begin
 perform pg_advisory_xact_lock(782019461);
 select * into existing from public.hq_auftraege where id=p_id;
 if found then
   if existing.bot is distinct from p_bot or existing.text is distinct from p_text or not existing.hq_private then
     raise exception 'Task id conflict' using errcode='22023';
   end if;
   return jsonb_build_object('id',existing.id,'status',existing.status);
 end if;
 if (select count(*) from public.hq_auftraege where hq_private and status in ('offen','laeuft') and hq_error is null)>=3
 or (select count(*) from public.hq_auftraege where hq_private and erstellt>now()-interval '24 hours')>=30 then
   raise exception 'HQ request limit reached' using errcode='P0001';
 end if;
 result:=public.hq_enqueue(p_id,p_bot,p_text);
 update public.hq_auftraege set hq_private=true where id=p_id;
 return result;
end;
$$;

create function public.hq_claim_task(p_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare task public.hq_auftraege;
begin
 update public.hq_auftraege set status='laeuft',hq_claim_token=gen_random_uuid(),hq_claimed_at=clock_timestamp()
 where id=p_id and status='offen' and hq_private and hq_error is null returning * into task;
 if not found then return null; end if;
 return jsonb_build_object('id',task.id,'bot',task.bot,'text',task.text,'claim_token',task.hq_claim_token);
end;
$$;

create function public.hq_fail(p_id text,p_claim_token uuid,p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_error is null or length(p_error)>500 then raise exception 'Invalid error'; end if;
 update public.hq_auftraege set hq_error=p_error
 where id=p_id and hq_claim_token=p_claim_token and status='laeuft' and hq_error is null;
 return found;
end;
$$;

create function public.hq_dashboard()
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('auftraege',coalesce(jsonb_agg(jsonb_build_object(
 'id',id,'bot',bot,'text',text,'status',status,'ergebnis',ergebnis,'error',hq_error,
 'erstellt',erstellt,'claimed_at',hq_claimed_at,'erledigt_am',erledigt_am) order by erstellt desc),'[]'::jsonb))
 from (select * from public.hq_auftraege order by erstellt desc limit 50) t;
$$;

revoke all on function public.hq_submit(text,text,text) from public,anon,authenticated;
revoke all on function public.hq_claim_task(text) from public,anon,authenticated;
revoke all on function public.hq_fail(text,uuid,text) from public,anon,authenticated;
revoke all on function public.hq_dashboard() from public,anon,authenticated;
grant execute on function public.hq_submit(text,text,text),public.hq_claim_task(text),public.hq_fail(text,uuid,text),public.hq_dashboard() to service_role;


