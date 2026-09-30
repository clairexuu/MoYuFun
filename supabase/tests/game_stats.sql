begin;

insert into public.games (id, slug, name, short_description, description, cover, is_listed)
values (
  'b1000000-0000-4000-8000-000000000001',
  'stats-fixture',
  'Stats fixture',
  'Stats fixture',
  'Stats fixture',
  '{"symbol":"S","eyebrow":"TEST","accent":"#000000","accentSecondary":"#ffffff"}',
  false
);

insert into public.game_versions (id, game_id, version_key, entry_path)
values
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'v1', '/games/stats-fixture/v1/index.html');

insert into public.game_stats (game_id, key, name, max_per_round, sort_order, is_active)
values
  ('b1000000-0000-4000-8000-000000000001', 'rounds', '对局', 1, 1, true),
  ('b1000000-0000-4000-8000-000000000001', 'kills', '击杀', 10, 2, true),
  ('b1000000-0000-4000-8000-000000000001', 'retired', '退役', 5, 3, false);

insert into auth.users (id, email)
values ('b4000000-0000-4000-8000-000000000001', 'stats-fixture@example.com');

create function pg_temp.rejects(p_stats jsonb, p_version uuid default 'b2000000-0000-4000-8000-000000000001')
returns boolean
language plpgsql
as $$
begin
  perform public.record_round_stats(
    'b4000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    p_version,
    p_stats
  );
  return false;
exception
  when check_violation then
    return true;
end
$$;

do $$
declare
  slash_version uuid := (select current_version_id from public.games where slug = 'slash');
  fixture_user uuid := 'b4000000-0000-4000-8000-000000000001';
  fixture_game uuid := 'b1000000-0000-4000-8000-000000000001';
  fixture_v1 uuid := 'b2000000-0000-4000-8000-000000000001';
begin
  if not pg_temp.rejects('{"rounds": 1, "nope": 1}') then
    raise exception 'undeclared key must reject the report';
  end if;
  if not pg_temp.rejects('{"rounds": 1, "retired": 1}') then
    raise exception 'retired key must reject the report';
  end if;
  if not pg_temp.rejects('{"rounds": 1, "kills": 11}') then
    raise exception 'value over the cap must reject the report';
  end if;
  if not pg_temp.rejects('{"rounds": 1, "kills": -1}') then
    raise exception 'negative value must reject the report';
  end if;
  if not pg_temp.rejects('{"rounds": 1, "kills": 1.5}') then
    raise exception 'non-integer value must reject the report';
  end if;
  if not pg_temp.rejects('{"rounds": 1, "kills": "3"}') then
    raise exception 'string value must reject the report';
  end if;
  if not pg_temp.rejects('{}') or not pg_temp.rejects('[1]') then
    raise exception 'empty object and non-object must reject the report';
  end if;
  if not pg_temp.rejects('{"rounds": 1}', slash_version) then
    raise exception 'version of another game must reject the report';
  end if;
  if exists (select 1 from public.user_game_stats where user_id = fixture_user) then
    raise exception 'a rejected report must write nothing';
  end if;

  perform public.record_round_stats(fixture_user, fixture_game, fixture_v1, '{"rounds": 1, "kills": 7}');
  perform public.record_round_stats(fixture_user, fixture_game, fixture_v1, '{"rounds": 1, "kills": 0}');
  perform public.record_round_stats(fixture_user, fixture_game, fixture_v1, '{"kills": 10}');

  if (select value from public.user_game_stats where user_id = fixture_user and stat_key = 'rounds') <> 2
    or (select value from public.user_game_stats where user_id = fixture_user and stat_key = 'kills') <> 17 then
    raise exception 'totals must accumulate across reports';
  end if;

  if (select string_agg(stat_key || '=' || value, ',' order by stat_key)
      from public.get_user_stats(fixture_user, fixture_game)) <> 'kills=17,rounds=2' then
    raise exception 'get_user_stats must return the totals';
  end if;

  -- A retired stat keeps its rows but leaves the board (D9).
  update public.game_stats set is_active = false where game_id = fixture_game and key = 'kills';
  if (select count(*) from public.get_user_stats(fixture_user, fixture_game)) <> 1
    or (select count(*) from public.user_game_stats where user_id = fixture_user) <> 2 then
    raise exception 'retired stats must be kept but not listed';
  end if;

  perform public.delete_user_account(fixture_user);
  if exists (select 1 from public.user_game_stats where user_id = fixture_user) then
    raise exception 'totals must cascade on user delete';
  end if;

  if exists (
    select 1
    from (values ('anon'), ('authenticated'), ('moyufun_web'), ('moyufun_publisher'))
      as roles(role_name)
    cross join (values ('select'), ('insert'), ('update'), ('delete'))
      as privileges(privilege_name)
    where has_table_privilege(role_name, 'public.user_game_stats', privilege_name)
  ) then
    raise exception 'application roles must not touch user_game_stats';
  end if;

  if not has_table_privilege('moyufun_web', 'public.game_stats', 'select')
    or has_table_privilege('moyufun_web', 'public.game_stats', 'insert')
    or not has_table_privilege('moyufun_publisher', 'public.game_stats', 'update')
    or has_table_privilege('moyufun_publisher', 'public.game_stats', 'delete')
    or has_table_privilege('anon', 'public.game_stats', 'select')
    or has_table_privilege('authenticated', 'public.game_stats', 'select') then
    raise exception 'game_stats table privileges are wrong';
  end if;

  if exists (
    select 1
    from (values ('anon'), ('authenticated'), ('moyufun_publisher')) as roles(role_name)
    cross join (
      values
        ('public.record_round_stats(uuid,uuid,uuid,jsonb)'),
        ('public.get_user_stats(uuid,uuid)')
    ) as functions(function_name)
    where has_function_privilege(role_name, function_name, 'execute')
  ) then
    raise exception 'only moyufun_web may execute stats functions';
  end if;
end
$$;

rollback;
