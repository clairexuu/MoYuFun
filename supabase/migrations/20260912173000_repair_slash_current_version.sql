update public.games g
set
  current_version_id = v.id,
  is_listed = true,
  updated_at = now()
from public.game_versions v
where g.slug = 'slash'
  and v.game_id = g.id
  and v.version_key = 'v1'
  and (
    g.current_version_id is distinct from v.id
    or not g.is_listed
  );

do $$
begin
  if not exists (
    select 1
    from public.games g
    join public.game_versions v
      on v.game_id = g.id
      and v.id = g.current_version_id
    where g.slug = 'slash'
      and g.is_listed
      and v.version_key = 'v1'
  ) then
    raise exception 'slash v1 must be the listed current version';
  end if;
end
$$;
