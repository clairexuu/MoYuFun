begin;

insert into public.games (id, slug, name, short_description, description, cover, is_listed)
values (
  'a1000000-0000-4000-8000-000000000001',
  'achievement-fixture',
  'Achievement fixture',
  'Achievement fixture',
  'Achievement fixture',
  '{"symbol":"A","eyebrow":"TEST","accent":"#000000","accentSecondary":"#ffffff"}',
  false
);

insert into public.game_versions (id, game_id, version_key, entry_path)
values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'v1', '/games/achievement-fixture/v1/index.html'),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'v2', '/games/achievement-fixture/v2/index.html');

insert into public.achievements (id, game_id, key, name, description, symbol, is_active)
values
  ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'first_win', '首胜', '赢下一局', '胜', true),
  ('a3000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'retired', '退役', '已下线', '退', false);

insert into auth.users (id, email)
values ('a4000000-0000-4000-8000-000000000001', 'achievement-fixture@example.com');

do $$
declare
  slash_game uuid := (select id from public.games where slug = 'slash');
  slash_version uuid := (select current_version_id from public.games where slug = 'slash');
  fixture_user uuid := 'a4000000-0000-4000-8000-000000000001';
  fixture_game uuid := 'a1000000-0000-4000-8000-000000000001';
  fixture_v1 uuid := 'a2000000-0000-4000-8000-000000000001';
  fixture_v2 uuid := 'a2000000-0000-4000-8000-000000000002';
begin
  if public.unlock_achievement(fixture_user, fixture_game, fixture_v1, 'nope') <> 'unknown' then
    raise exception 'unknown key must be rejected';
  end if;

  if public.unlock_achievement(fixture_user, fixture_game, fixture_v1, 'retired') <> 'unknown' then
    raise exception 'inactive key must be rejected';
  end if;

  if public.unlock_achievement(fixture_user, fixture_game, slash_version, 'first_win') <> 'unknown' then
    raise exception 'version of another game must be rejected';
  end if;

  if public.unlock_achievement(fixture_user, fixture_game, fixture_v1, 'first_win') <> 'unlocked' then
    raise exception 'first unlock must succeed';
  end if;

  if public.unlock_achievement(fixture_user, fixture_game, fixture_v2, 'first_win') <> 'already_unlocked' then
    raise exception 'second unlock on another version must report already_unlocked';
  end if;

  if (select count(*) from public.user_achievements where user_id = fixture_user) <> 1 then
    raise exception 'exactly one unlock row expected';
  end if;

  if (select count(*) from public.get_user_achievements(fixture_user)) <> 1
    or (select count(*) from public.get_user_achievements(fixture_user, fixture_game)) <> 1
    or (select count(*) from public.get_user_achievements(fixture_user, slash_game)) <> 0 then
    raise exception 'per-game filter is wrong';
  end if;

  if (select key from public.get_user_achievements(fixture_user, fixture_game)) <> 'first_win' then
    raise exception 'unlock key must be reported';
  end if;

  -- Retired achievements keep their unlocks (D10).
  update public.achievements set is_active = false where key = 'first_win';
  if (select count(*) from public.get_user_achievements(fixture_user)) <> 1 then
    raise exception 'retired unlocks must still be listed';
  end if;

  perform public.delete_user_account(fixture_user);

  if exists (select 1 from auth.users where id = fixture_user) then
    raise exception 'delete_user_account must remove the auth user';
  end if;

  if exists (select 1 from public.user_achievements where user_id = fixture_user) then
    raise exception 'unlocks must cascade on user delete';
  end if;

  if exists (
    select 1
    from (values ('anon'), ('authenticated'), ('moyufun_web'), ('moyufun_publisher'))
      as roles(role_name)
    cross join (values ('select'), ('insert'), ('update'), ('delete'))
      as privileges(privilege_name)
    where has_table_privilege(role_name, 'public.user_achievements', privilege_name)
  ) then
    raise exception 'application roles must not touch user_achievements';
  end if;

  if not has_table_privilege('moyufun_web', 'public.achievements', 'select')
    or has_table_privilege('moyufun_web', 'public.achievements', 'insert')
    or not has_table_privilege('moyufun_publisher', 'public.achievements', 'update')
    or has_table_privilege('moyufun_publisher', 'public.achievements', 'delete')
    or has_table_privilege('anon', 'public.achievements', 'select')
    or has_table_privilege('authenticated', 'public.achievements', 'select') then
    raise exception 'achievements table privileges are wrong';
  end if;

  if exists (
    select 1
    from (values ('anon'), ('authenticated'), ('moyufun_publisher')) as roles(role_name)
    cross join (
      values
        ('public.unlock_achievement(uuid,uuid,uuid,text)'),
        ('public.get_user_achievements(uuid,uuid)'),
        ('public.delete_user_account(uuid)')
    ) as functions(function_name)
    where has_function_privilege(role_name, function_name, 'execute')
  ) then
    raise exception 'only moyufun_web may execute achievement functions';
  end if;
end
$$;

rollback;
