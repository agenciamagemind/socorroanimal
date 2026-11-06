create policy socorro_deny_client_access on public.socorro_pix_payments for all to anon,authenticated using (false) with check (false);
