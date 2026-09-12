do $$
begin
  if has_table_privilege('anon', 'public.games', 'select') then
    raise exception 'anon must not be able to read games';
  end if;

  if has_table_privilege('anon', 'public.events', 'insert') then
    raise exception 'anon must not be able to insert events';
  end if;

  if has_table_privilege('authenticated', 'public.games', 'select') then
    raise exception 'authenticated must not be able to read games directly';
  end if;

  if has_table_privilege('authenticated', 'public.events', 'insert') then
    raise exception 'authenticated must not be able to insert events directly';
  end if;

  if not has_table_privilege('moyufun_web', 'public.games', 'select') then
    raise exception 'moyufun_web must be able to read games';
  end if;

  if not has_table_privilege('moyufun_web', 'public.events', 'insert') then
    raise exception 'moyufun_web must be able to insert events';
  end if;

  if has_table_privilege('moyufun_web', 'public.events', 'select') then
    raise exception 'moyufun_web must not be able to read raw events';
  end if;

  if not has_table_privilege('moyufun_publisher', 'public.games', 'update') then
    raise exception 'moyufun_publisher must be able to update games';
  end if;

  if not has_table_privilege('moyufun_publisher', 'public.game_versions', 'insert') then
    raise exception 'moyufun_publisher must be able to insert game versions';
  end if;

  if has_table_privilege('moyufun_publisher', 'public.events', 'select') then
    raise exception 'moyufun_publisher must not be able to read events';
  end if;

  if (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('games', 'game_versions', 'events')
      and c.relrowsecurity
  ) <> 3 then
    raise exception 'RLS must be enabled on all core tables';
  end if;

end
$$;
