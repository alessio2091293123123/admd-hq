begin;
set local role service_role;
do $$
declare task jsonb; other jsonb; tok uuid;
begin
  if has_function_privilege('anon','public.hq_claim(text)','EXECUTE')
     or has_function_privilege('authenticated','public.hq_enqueue(text,text,text)','EXECUTE')
     or has_function_privilege('anon','public.hq_finish(text,uuid,text)','EXECUTE') then
    raise exception 'Public write access'; end if;
  perform public.hq_enqueue('__hq_verify_20261110','forge','Rollback-only orchestration test');
  perform public.hq_enqueue('__hq_verify_20261110','forge','Rollback-only orchestration test');
  begin
    perform public.hq_enqueue('__hq_verify_20261110','forge','Changed');
    raise exception 'Conflict accepted';
  exception when invalid_parameter_value then null;
  end;
  task := public.hq_claim('forge');
  if task->>'id' <> '__hq_verify_20261110' then raise exception 'Unexpected claim'; end if;
  tok := (task->>'claim_token')::uuid;
  other := public.hq_claim('forge');
  if other is not null then raise exception 'Duplicate claim'; end if;
  if public.hq_finish(task->>'id',gen_random_uuid(),'Wrong') then raise exception 'Wrong token accepted'; end if;
  if not public.hq_finish(task->>'id',tok,'Verified') then raise exception 'Finish failed'; end if;
  if not public.hq_finish(task->>'id',tok,'Verified') then raise exception 'Retry failed'; end if;
  if public.hq_finish(task->>'id',tok,'Overwritten') then raise exception 'Overwrite accepted'; end if;
  if (select count(*) from public.hq_auftraege where id='__hq_verify_20261110' and status='erledigt')<>1 then raise exception 'Bad final state'; end if;
end;
$$;
rollback;