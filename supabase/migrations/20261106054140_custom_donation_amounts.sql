-- Accept positive integer cents for preset and custom donations.
-- The existing integer column also enforces the upper bound of 2147483647 cents.
alter table public.socorro_pix_payments
  drop constraint socorro_pix_payments_amount_check;
alter table public.socorro_pix_payments
  add constraint socorro_pix_payments_amount_check check (amount >= 1);

create or replace function public.socorro_reserve_pix(p_owner text,p_request uuid,p_amount integer,p_ip text,p_mode text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.socorro_pix_payments;
begin
  if p_amount is null or p_amount < 1 or p_mode is null or p_mode not in ('sandbox','production') then
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
