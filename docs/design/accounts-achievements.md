# Accounts and achievements

**Status:** Implemented 2026-09-30 (M1–M6). Production verified: email verification, password reset, all six 乱刃 v3 achievements, `/me` and the detail page.

Players create an account with email and password, and games report achievements that are saved to that account. Achievements are private to each user; there is no ranking or public profile.

Read first: `DEV.md` (architecture, roles, deployment), `supabase/README.md` (migration and permission conventions), `node_modules/next/dist/docs/01-app/02-guides/authentication.md` (Next 16 auth patterns). User-facing copy is Chinese, matching the rest of the site.

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | **Supabase Auth** handles credentials, email verification, password reset and sessions. | Password hashing, token rotation, reset tokens and account-enumeration handling are security-critical code we should not own. |
| D2 | Supabase Auth only answers "who is this user". All app data goes through the existing `moyufun_web` Postgres role and `security definer` functions that take the verified user ID as a parameter. No RLS policies for `authenticated`, no PostgREST, no browser Supabase client. | Keeps the current trust model (the database trusts the web server, not the browser) and the existing least-privilege role setup. |
| D3 | Supabase is used from the server only, via `@supabase/ssr`. Auth cookies are forced `HttpOnly`, `Secure` (in production), `SameSite=Lax`, host-only on `www.moyufuns.com`. `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are server-only env vars (no `NEXT_PUBLIC_`). | No browser client means no script needs to read the cookie. Host-only cookies never reach `games.moyufuns.com`. |
| D4 | Email verification is required before an account works; password reset is included. Emails go through **Resend** SMTP from `MoYuFun <noreply@moyufuns.com>`. | A forgotten password must not lose achievements; verification stops sign-ups with someone else's email. Supabase's built-in mailer only sends to team members, 2 per hour. |
| D5 | Email links land on a server route `/auth/confirm?token_hash=…&type=…&next=…` that calls `verifyOtp`. Both Supabase email templates use `{{ .TokenHash }}` and build the link from `{{ .SiteURL }}`. *Changed in M1:* `signUp`/`resetPasswordForEmail` pass no `emailRedirectTo`/`redirectTo`, because the templates ignore it. | Server-side verification without a browser client or PKCE code verifier in `localStorage`. |
| D6 | The **game decides** an unlock and sends a key; the site only checks the key exists and is active for that game. | Each game keeps its own rules; the protocol change is one message type. |
| D7 | Unlocks are **client-reported and forgeable**. Accepted because achievements are private. Must be revisited before any ranking or reward is built on them. | Games run in the player's browser; a trustworthy unlock would need server-side replay. |
| D8 | Every achievement must be **decidable within a single round**. No cross-round counters ("win 10 times", "win with every slash"). | The game has no trusted cross-session storage, and the site stores unlocks, not progress. |
| D9 | Logged-out players see the unlock popup with a "登录后可保存成就" hint. Nothing is stored or claimed later. | Simplest; avoids carrying unverified unlocks across a login. |
| D10 | Achievements belong to a **game**, not a version, keyed by `(game_id, key)`. They are retired with `is_active = false`, never deleted. Unlocks record the version they happened on. | Unlocks survive version switches; new versions can add keys. |
| D11 | Analytics stay anonymous. `events` gets no `user_id`, and there is no achievement analytics event. | Keeps the metrics protocol and privacy scope unchanged. |
| D12 | Profile is email only: no nickname, avatar or public page. The header shows the email's local part. | Nothing is public without ranking. |
| D13 | Pre-rendered pages (`/`, `/games/[slug]`, `/play/[slug]`) stay `force-static`. Anything that depends on the user loads in the browser from `/api/me*`. | Reading cookies in those pages would make every request dynamic. |
| D14 | Account deletion runs through a `security definer` function that deletes the `auth.users` row; unlocks cascade. Vercel never holds the Supabase service-role/secret key. The user must re-enter their password: the action re-runs `signInWithPassword` with the session's email, calls `delete_user_account`, then signs out. | Avoids adding the most powerful Supabase secret to the web runtime. Verified: the `postgres` owner can delete from `auth.users`, unlocks cascade, the session is cleared. |
| D15 | Passwords: minimum 8 characters, no character-class rules. No CAPTCHA; rely on Supabase's email rate limit (30/hour). Add Cloudflare Turnstile to sign-up and reset if abuse appears. | Low friction at current traffic. |
| D16 | `/privacy` and `/terms` shipped with accounts, and sign-up requires ticking a consent checkbox. This completed TODO item 7. | Collecting accounts and emails requires a privacy policy before launch. |

## Out of scope

Ranking, leaderboards, public profiles, nicknames, social login, cross-round progress, achievement analytics, claiming logged-out unlocks, CAPTCHA, email change flow.

## How it works

```text
games.moyufuns.com iframe
  └─ postMessage {source:"moyufun-game", version:1, type:"achievement", key}
       ▼
/play/[slug] GamePlayer (client)
  ├─ readGameMessage(): origin + window + shape checks
  ├─ lifecycle: only while a round is in progress (play_id set); once per key per iframe load
  ├─ logged out → popup + login hint
  └─ logged in  → POST /api/achievements  (cookie)
                    ├─ Origin check → Supabase getClaims() → user id
                    ├─ consumeRateLimit("achievement-rate-limit:<user id>")
                    └─ unlock_achievement(user, game, version, key)  [moyufun_web]

/signup /login /forgot-password /reset-password   Server Actions → Supabase Auth
/auth/confirm                                      route handler → verifyOtp → redirect
/me                                                server component → get_user_achievements
Header / detail page                               client fetch /api/me, /api/me/achievements
```

### Code map

| File | Role |
| --- | --- |
| `src/lib/auth.ts` | server-only; `createSupabaseServerClient()` (cookies from `next/headers`, `setAll` hardened, swallowed in Server Components), `getCurrentUser()` via `auth.getClaims()` (never `getSession()`), `siteUrl()`. |
| `src/lib/auth-request.ts` | pure; `safeNext()` (same-site relative `next`, default `/me`), `hardenCookie()` (HttpOnly, Lax, host-only, Secure in production), `isConfirmType()`. Unit-tested. |
| `src/lib/auth-actions.ts` | `"use server"`; `signUp`, `logIn`, `resendConfirmation`, `forgotPassword`, `resetPassword`, `logOut`, `deleteAccount`. |
| `src/proxy.ts` | one Next proxy: `/stats/:path*` keeps Basic Auth; `/me`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/:path*` refresh the Supabase session cookie and get `Cache-Control: private, no-store`. Route handlers and Server Actions refresh sessions themselves, so `/api/*` is not matched. |
| `src/components/auth-form.tsx` | client `AuthForm` (`useActionState`): optional email (controlled, survives React's post-action form reset) and password inputs, error/message lines, optional resend button (`formAction`). |
| `src/components/auth-shell.tsx`, `account-menu.tsx`, `game-achievements.tsx` | page shell for auth pages; header island fetching `/api/me`; detail-page achievement list fetching `/api/me/achievements?game_id=`. |
| `src/app/{signup,login,forgot-password,reset-password,me}/page.tsx`, `src/app/auth/confirm/route.ts`, `src/app/{privacy,terms}/page.tsx` | the auth pages (all `force-dynamic`, `noindex`), the email-link handler, the legal pages. |
| `src/app/api/me/route.ts`, `api/me/achievements/route.ts`, `api/achievements/route.ts` | HTTP API below. |
| `src/lib/game-events.ts` | `readGameMessage()` → `{ type: "ready" \| "start" \| "end" } \| { type: "achievement", key }`; lifecycle `unlock` option. |
| `src/lib/achievement-request.ts`, `src/lib/achievements.ts` | pure request handler (deps injected, unit-tested) and server-only rate limit + DB calls (`unlockAchievement`, `getUserAchievements`, `deleteUserAccount`). `consumeRateLimit(bucket)` in `events.ts` is shared with the events endpoint. |
| `src/lib/games.ts` | `Game.achievements` (`key`, `name`, `description`, `symbol`, in `sort_order`, active only) loaded in the same cached `readGames()` query under the `game-catalog` tag. |
| `supabase/migrations/20260930120000_add_achievements.sql`, `20260930130000_publish_slash_v3.sql` | schema, functions, grants, assertions; v3 version + six achievements + current-version switch. |
| `supabase/tests/achievements.sql` | rollback test: unknown/inactive key, wrong version, double unlock, per-game filter, retired unlocks, cascade on delete, privilege matrix. |
| `supabase/templates/confirmation.html`, `recovery.html`, `supabase/config.toml` `[auth*]` | Chinese email templates and local auth settings (mirrored in the Dashboard). |
| `scripts/m5-production-wizard.sh` | the owner runbook for production setup (Resend, Supabase Dashboard, Vercel, R2, `db push`, deploy, revalidate). |
| `games/slash/v3/` | 乱刃 with `emitMoYuFunAchievement(key)` and six single-round achievements; `test_headless.js` asserts message order. |

### Auth flows (all copy Chinese)

| Route | Behaviour |
| --- | --- |
| `/signup` | Email, password (≥ 8), consent checkbox linking `/privacy` and `/terms`. `signUp({ email, password })`. Always shows "请查收验证邮件" whether or not the email already exists; only `email_address_invalid` and `over_email_send_rate_limit` get specific errors. |
| `/login` | `signInWithPassword`. Wrong email or password → one generic error. Unconfirmed email → prompt plus a "重新发送验证邮件" button (`auth.resend({ type: "signup" })`, then redirect `/login?message=resent`). Honours `next` through `safeNext()`; default `/me`. `?error=link` shows the bad-link notice. |
| `/forgot-password` | `resetPasswordForEmail(email)`. Always shows the same success message. |
| `/auth/confirm` | GET: validates `type ∈ {email, recovery}` and `next`, calls `verifyOtp({ type, token_hash })`, `303` to `next`; on failure `303` to `/login?error=link`. |
| `/reset-password` | Requires a session (the recovery link created one; otherwise `/login?error=link`); `updateUser({ password })`, `same_password` gets its own error, then redirect `/me`. |
| `/me` | Redirects to `/login?next=/me` when logged out. Shows email, log-out, achievements grouped by listed game with `unlocked / total` (active only; retired unlocks listed by key with "已下线"), and 删除账号 requiring the current password. |
| Log out | Server Action (header menu and `/me`): `signOut({ scope: "local" })`, redirect `/`. |

Site origin for email links and redirects comes from `SITE_URL`, never from the request `Host` header.

### Supabase Auth configuration

`supabase/config.toml` is the source of truth; the production Dashboard mirrors it (Authentication → URL Configuration, Sign In / Providers → Email, Emails → Templates and SMTP Settings, Rate Limits).

- `site_url`: `http://localhost:3000` locally, `https://www.moyufuns.com` in production; `additional_redirect_urls`: `https://www.moyufuns.com/auth/confirm`, `http://localhost:3000/auth/confirm`.
- `[auth.email] enable_confirmations = true`, `secure_password_change = true`; `[auth] minimum_password_length = 8`; `[auth.rate_limit] email_sent = 30`.
- Templates wired under `[auth.email.template.confirmation]` / `[auth.email.template.recovery]`. Link format: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/me` and `…&type=recovery&next=/reset-password`. Token hashes carry a `pkce_` prefix with `@supabase/ssr`; `verifyOtp` accepts them.
- Production SMTP: host `smtp.resend.com`, port 465, user `resend`, password = Resend API key (sending-only, stored only in the Dashboard). Sender `noreply@moyufuns.com`; the domain is verified in Resend with SPF/DKIM in Cloudflare DNS and a DMARC `p=none` record. Resend free tier is 100 emails/day.
- Locally, Mailpit at `http://127.0.0.1:54324` catches mail (`/api/v1/messages` for scripting).

### Data model

```sql
achievements (
  id uuid pk default gen_random_uuid(),
  game_id uuid not null references games(id) on delete restrict,
  key text not null check (key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$' and length(key) <= 40),
  name text not null,            -- Chinese, 1–20 chars
  description text not null,     -- Chinese, 1–60 chars
  symbol text not null,          -- 1–2 characters, drawn like the game cover glyph
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (game_id, key),
  unique (game_id, id)
)

user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null,
  game_id uuid not null,
  game_version_id uuid not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id),
  foreign key (game_id, achievement_id) references achievements(game_id, id),
  foreign key (game_id, game_version_id) references game_versions(game_id, id)
)
```

Achievement colour comes from the game's `cover.accent`.

Functions (all `security definer`, `set search_path = pg_catalog, public`, execute revoked from `public, anon, authenticated, moyufun_publisher`, granted to `moyufun_web`):

| Function | Contract |
| --- | --- |
| `unlock_achievement(p_user_id uuid, p_game_id uuid, p_game_version_id uuid, p_key text) returns text` | `'unknown'` if the version does not belong to the game, or no active achievement has that key. Otherwise inserts `on conflict do nothing`; returns `'unlocked'` or `'already_unlocked'`. Any version of the game is accepted (a tab may outlive a version switch). |
| `get_user_achievements(p_user_id uuid, p_game_id uuid default null) returns table (game_id uuid, key text, unlocked_at timestamptz)` | The user's unlocks, optionally for one game, including retired achievements. |
| `delete_user_account(p_user_id uuid) returns void` | `delete from auth.users where id = p_user_id`. |

Grants and RLS: `achievements` has RLS on; `moyufun_web` selects active achievements of listed games (same shape as `games_web_select`); `moyufun_publisher` has `select, insert, update` (no delete). `user_achievements` has RLS on and no grants to any app role; it is reached only through the functions. The migration ends with a `do $$ … $$` block asserting these privileges.

### Game protocol

```js
{ source: "moyufun-game", version: 1, type: "achievement", key: "first_win" }
```

- `readGameMessage` accepts exactly these four keys for `achievement`, with `key` matching the DB regex and ≤ 40 chars. The three existing messages keep their exact three-key shape.
- The lifecycle forwards an achievement only while a round is in progress (`play_id` set) and once per key per lifecycle instance (one per iframe load; "重新加载" starts a new one and the API answers `already_unlocked`). Keys not in the catalog definitions are dropped without a request.
- **Ordering rule for games:** send achievements earned at round end **before** `end`; the site ignores achievements once the round has ended.
- SDK helper in games: `emitMoYuFunAchievement(key)`, next to `emitMoYuFunEvent`, with the same fixed parent origin.
- Gotcha: the play page is static HTML, so an iframe game that posts `ready` synchronously on load can beat hydration and be missed. 乱刃 is large enough not to; a tiny fixture game needs a short delay.

### HTTP API

| Endpoint | Contract |
| --- | --- |
| `GET /api/me` | `200 { user: { email } \| null }`. |
| `GET /api/me/achievements?game_id=<uuid>` | `401` when logged out; `400` for a malformed `game_id`; `200 { unlocked: [{ key, unlocked_at }] }`. `game_id` optional. |
| `POST /api/achievements` | JSON body exactly `{ game_id, game_version_id, key }`, ≤ 1 KiB, `Content-Type: application/json`, `Origin` must equal `SITE_URL`'s origin. `400` bad body, bad content type or unknown key, `401` logged out, `403` bad origin, `429` rate-limited (`Retry-After: 60`), `200 { status: "unlocked" \| "already_unlocked" }`. Database errors → generic `500`. |

All auth and `/api/me*` responses send `Cache-Control: private, no-store`. The unlock rate limit reuses `consume_event_rate_limit` with bucket `"achievement-rate-limit:" + user_id` (HMAC with the DB URL), i.e. 120 per minute per user.

### UI

- **Header**: `AccountMenu` fetches `/api/me`: "登录" link when logged out; email local part linking `/me` plus 退出 when logged in.
- **Play page**: `GamePlayer` receives the game's achievement definitions. Popup inside the player container (visible in fullscreen), top-right, 4 s, queued. Logged out: same popup plus "登录后可保存成就" linking `/login?next=/play/<slug>`. The player fetches `/api/me` once on mount.
- **Detail page**: "成就" section from the catalog; `GameAchievements` marks unlocked ones; logged out shows "登录后记录成就". Omitted when the game has no achievements.
- **Footer**: links to `/privacy` and `/terms`.

### 乱刃 v3 achievements

| key | name | Rule (single round) | symbol |
| --- | --- | --- | --- |
| `first_blood` | 初见血 | Player gets a kill. | 血 |
| `first_win` | 首胜 | Player wins the round. | 胜 |
| `flawless` | 无伤 | Player wins with 0 deaths. | 完 |
| `rampage` | 连斩 | Player gets 5 kills without dying in between (`streak`). | 连 |
| `swift` | 速战 | Player wins with `gameT` < 120 s. | 速 |
| `ranged` | 远斩 | Player wins with loadout exactly 剑气 + 穿刺 (`wave` + `thrust`). | 远 |

Each unlock is emitted at most once per round (`roundAchievements` reset in `startGame()`). Win-time achievements are emitted in `kill()` before `emitMoYuFunEvent('end')`. `games/slash/v3/test_headless.js` asserts the exact message sequence `start, first_blood, rampage, first_win, flawless, swift, ranged, end`.

## Operating the feature

**Environment variables** (server-only, in `.env.example` and Vercel): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SITE_URL`. The Resend API key lives only in the Supabase Dashboard SMTP settings.

**Local development**: `pnpm supabase start`, then `.env.local` with `SUPABASE_URL=http://127.0.0.1:54321`, the publishable key from `supabase status`, `SITE_URL=http://localhost:3000`, and `MOYUFUN_WEB_DATABASE_URL=postgresql://moyufun_web.local:<pw>@127.0.0.1:54322/postgres`. `database.ts` requires the pooler username format, so create the local login role once:

```sql
create role "moyufun_web.local" login password '<pw>' in role moyufun_web;
```

**Tests**: `pnpm test` (auth-request, achievement-request, game-events), `node games/slash/v3/test_headless.js`, and the SQL test:

```bash
docker exec -i supabase_db_MoYuFun psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/achievements.sql
```

**Adding achievements to a game**: insert `achievements` rows with the publisher role (or a migration like `publish_slash_v3`), ship a game version that emits the keys, then call `POST /api/revalidate/games`. Retire with `is_active = false`; never delete.

**Production setup or a new environment**: run `bash scripts/m5-production-wizard.sh` and follow the stages. Do not edit the script while a run is in progress; bash reads it incrementally.

**Rollback of a game version**: switch `current_version_id` back with the publisher role and revalidate; unlocks are per game, so they survive.

## Gotchas found while building

- React 19 resets uncontrolled form fields after a Server Action; `AuthForm` keeps the email controlled so it survives an error.
- `signOut` after `delete_user_account` gets a 401/404 from Auth, which auth-js ignores while clearing the local session.
- The proxy must be `async`; the `/stats` tests await it.
- Node's test runner does not resolve the `@/` alias; pure modules imported by tests use relative `.ts` imports.
