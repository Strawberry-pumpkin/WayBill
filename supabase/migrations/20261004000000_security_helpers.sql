-- Shared security helpers. Runs first.

-- public.app_role() is defined in 20261003000000_profiles_drivers.sql (it needs the profiles table).

-- Per-user fixed-window rate limiter used by the Next.js route handlers.
create table if not exists public.rate_limits (
  user_id      uuid not null,
  bucket       text not null,
  window_start timestamptz not null,
  hits         int not null default 0,
  primary key (user_id, bucket, window_start)
);
alter table public.rate_limits enable row level security; -- no policies: only the function below touches it
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.rate_limit_hit(p_bucket text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_start timestamptz;
  v_hits  int;
begin
  if v_uid is null then return false; end if;
  if p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 3600 or length(p_bucket) > 64 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;

  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (user_id, bucket, window_start, hits)
  values (v_uid, p_bucket, v_start, 1)
  on conflict (user_id, bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  delete from public.rate_limits where user_id = v_uid and window_start < now() - interval '1 hour';
  return v_hits <= p_limit;
end;
$$;

revoke all on function public.rate_limit_hit(text, int, int) from public, anon;
grant execute on function public.rate_limit_hit(text, int, int) to authenticated;
