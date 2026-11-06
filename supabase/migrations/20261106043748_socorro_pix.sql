-- Apenas o servidor do Pix acessa esta tabela. Não há acesso anon/authenticated.
create table public.socorro_pix_payments (
  token text primary key check (token ~ '^[a-f0-9]{64}$'),
  owner_hash text not null check (owner_hash ~ '^[a-f0-9]{64}$'),
  request_id uuid not null,
  external_reference text not null unique,
  transaction_id text unique,
  amount integer not null check (amount in (1000,2000,3000,5000,10000,25000,50000,100000)),
  status text not null check (status in ('creating','unknown','pending','paid','expired','failed')),
  pix_copy_paste text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  checked_at timestamptz,
  ip_hash text not null,
  mode text not null check (mode in ('sandbox','production')),
  unique (owner_hash,request_id,mode)
);
alter table public.socorro_pix_payments enable row level security;
revoke all on public.socorro_pix_payments from public,anon,authenticated;
grant all on public.socorro_pix_payments to service_role;
create index socorro_pix_recent_owner on public.socorro_pix_payments(owner_hash,mode,amount,created_at desc) where status='pending';
create index socorro_pix_recent_ip on public.socorro_pix_payments(ip_hash,created_at desc);

create function public.socorro_reserve_pix(p_owner text,p_request uuid,p_amount integer,p_ip text,p_mode text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.socorro_pix_payments;
begin
  if p_amount not in (1000,2000,3000,5000,10000,25000,50000,100000) or p_mode not in ('sandbox','production') then
    raise exception 'Invalid payment parameters' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner:'||p_owner,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ip:'||p_ip,0));
  select * into r from public.socorro_pix_payments where owner_hash=p_owner and request_id=p_request and mode=p_mode;
  if found then
    if r.amount<>p_amount then raise exception 'Amount mismatch' using errcode='22023'; end if;
    return jsonb_build_object('created',false,'payment',to_jsonb(r));
  end if;
  select * into r from public.socorro_pix_payments where owner_hash=p_owner and mode=p_mode and amount=p_amount and status='pending'
    and created_at>now()-interval '30 minutes' and (expires_at is null or expires_at>now()) order by created_at desc limit 1;
  if found then return jsonb_build_object('created',false,'payment',to_jsonb(r)); end if;
  if (select count(*) from public.socorro_pix_payments where ip_hash=p_ip and created_at>now()-interval '10 minutes')>=10 then
    return jsonb_build_object('rate_limited',true);
  end if;
  insert into public.socorro_pix_payments(token,owner_hash,request_id,external_reference,amount,status,ip_hash,mode)
  values(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),p_owner,p_request,'SA-'||gen_random_uuid()::text,p_amount,'creating',p_ip,p_mode)
  returning * into r;
  return jsonb_build_object('created',true,'payment',to_jsonb(r));
end $$;

create function public.socorro_update_pix(p_token text,p_status text,p_transaction text default null,p_code text default null,p_expires timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.socorro_pix_payments;
begin
  select * into r from public.socorro_pix_payments where token=p_token for update;
  if not found then return null; end if;
  if r.transaction_id is not null and p_transaction is not null and r.transaction_id<>p_transaction then
    raise exception 'Transaction mismatch' using errcode='22023';
  end if;
  update public.socorro_pix_payments set
    status=case when status='paid' then 'paid' else p_status end,
    transaction_id=coalesce(p_transaction,transaction_id),pix_copy_paste=coalesce(p_code,pix_copy_paste),
    expires_at=coalesce(p_expires,expires_at),checked_at=now()
    where token=p_token returning * into r;
  return to_jsonb(r);
end $$;

create function public.socorro_claim_pix(p_token text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.socorro_pix_payments;
begin
  update public.socorro_pix_payments set checked_at=now() where token=p_token and status<>'paid' and (checked_at is null or checked_at<now()-interval '4 seconds') returning * into r;
  if found then return jsonb_build_object('claimed',true,'payment',to_jsonb(r)); end if;
  select * into r from public.socorro_pix_payments where token=p_token;
  return jsonb_build_object('claimed',false,'payment',to_jsonb(r));
end $$;

revoke all on function public.socorro_reserve_pix(text,uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.socorro_update_pix(text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.socorro_claim_pix(text) from public,anon,authenticated;
grant execute on function public.socorro_reserve_pix(text,uuid,integer,text,text) to service_role;
grant execute on function public.socorro_update_pix(text,text,text,text,timestamptz) to service_role;
grant execute on function public.socorro_claim_pix(text) to service_role;
