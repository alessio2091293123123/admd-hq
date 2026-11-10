-- Additive server-only orchestration. Existing feed and grants are unchanged.
alter table public.hq_auftraege add column hq_claim_token uuid;
alter table public.hq_auftraege add column hq_claimed_at timestamptz;

create function public.hq_enqueue(p_id text, p_bot text, p_text text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare task public.hq_auftraege;
begin
  if p_id is null or length(btrim(p_id)) = 0 or length(p_id) > 200
     or p_text is null or length(btrim(p_text)) = 0 or length(p_text) > 20000 then
    raise exception 'Invalid task id or text' using errcode = '22023';
  end if;
  insert into public.hq_auftraege(id, bot, text, status)
    values (p_id, p_bot, p_text, 'offen') on conflict (id) do nothing;
  select * into strict task from public.hq_auftraege where id = p_id;
  if task.bot <> p_bot or task.text <> p_text then
    raise exception 'Task id already used with different input' using errcode = '22023';
  end if;
  return jsonb_build_object('id',task.id,'bot',task.bot,'status',task.status);
end;
$$;

create function public.hq_claim(p_bot text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare task public.hq_auftraege;
begin
  if p_bot is null or p_bot not in ('pixel','forge','guard','critic','planner','finance','spark','leno') then
    raise exception 'Unknown bot' using errcode = '22023';
  end if;
  select * into task from public.hq_auftraege
    where status = 'offen' and bot = p_bot
    order by erstellt, id for update skip locked limit 1;
  if not found then return null; end if;
  update public.hq_auftraege
    set status='laeuft', hq_claim_token=gen_random_uuid(), hq_claimed_at=clock_timestamp()
    where id=task.id returning * into task;
  return jsonb_build_object('id',task.id,'bot',task.bot,'text',task.text,'claim_token',task.hq_claim_token);
end;
$$;

create function public.hq_finish(p_id text, p_claim_token uuid, p_result text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare task public.hq_auftraege;
begin
  if p_result is null or length(btrim(p_result))=0 or length(p_result)>100000 then
    raise exception 'Invalid result' using errcode='22023';
  end if;
  select * into task from public.hq_auftraege where id=p_id for update;
  if not found or p_claim_token is null or task.hq_claim_token is distinct from p_claim_token then
    return false;
  end if;
  if task.status='erledigt' then return task.ergebnis is not distinct from p_result; end if;
  if task.status<>'laeuft' then return false; end if;
  update public.hq_auftraege set status='erledigt',ergebnis=p_result,erledigt_am=clock_timestamp()
    where id=p_id;
  return true;
end;
$$;

revoke all on function public.hq_enqueue(text,text,text) from public,anon,authenticated;
revoke all on function public.hq_claim(text) from public,anon,authenticated;
revoke all on function public.hq_finish(text,uuid,text) from public,anon,authenticated;
grant execute on function public.hq_enqueue(text,text,text) to service_role;
grant execute on function public.hq_claim(text) to service_role;
grant execute on function public.hq_finish(text,uuid,text) to service_role;
