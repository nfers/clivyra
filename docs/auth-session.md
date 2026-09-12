# Auth and session management (CLI-12)

Authentication for professionals and studio admins: strong password hashing, short-lived access JWT, opaque rotatable refresh tokens, logout, password recovery, and route protection on API and web.

## Decisions

| ID | Decision |
| --- | --- |
| D1 | Refresh token for web travels in an `httpOnly` cookie set by the Next.js BFF (`/api/session/*`). Non-browser clients opt in with `X-Client: api` to receive the refresh token in the JSON body. |
| D2 | `AUTH_SELF_SIGNUP_ENABLED=false` by default. Studio signup (`POST /auth/signup`) creates a new tenant + OWNER only when enabled. Joining an existing tenant is invitation-only (CLI-13). |
| D3 | Passwords use PBKDF2-SHA512 with 210k iterations, random salt, and `AUTH_PASSWORD_PEPPER`. Hash format `pbkdf2$<iter>$<salt>$<hash>` allows future argon2id migration. |
| D5 | `MailerPort` with `noop` (dev), `test-mailbox` (tests), and `smtp` (HTTP bridge via `SMTP_URL`). |

## Endpoints

| Method | Path | Auth |
| --- | --- | --- |
| `POST` | `/auth/signup` | public (feature flag) |
| `POST` | `/auth/login` | public |
| `POST` | `/auth/refresh` | public (refresh token) |
| `POST` | `/auth/logout` | public (idempotent) |
| `POST` | `/auth/logout-all` | authenticated |
| `POST` | `/auth/switch-tenant` | authenticated |
| `GET` | `/auth/me` | authenticated |
| `GET` | `/auth/sessions` | authenticated |
| `DELETE` | `/auth/sessions/:id` | authenticated |
| `POST` | `/auth/password-reset/request` | public |
| `POST` | `/auth/password-reset/confirm` | public |

There is **no** `POST /auth/register` that accepts `tenantSlug` + `role`.

## Tokens

- Access token: HS256 JWT, 15 minutes, claims `sub`, `tid`, `sid`, `typ=access`, `iat`, `exp`, `jti`.
- Refresh token: opaque 32-byte `base64url`, stored only as HMAC. Rotation keeps `familyId`; reuse of a revoked token revokes the whole family (`reuse_detected`).
- Web cookies: `clivyra_at` (access, path `/`) and `clivyra_rt` (refresh, path `/api/session`).

## Protections

- Global `AuthGuard` with `@Public()`; health endpoints are public.
- Global `ThrottlerGuard` plus per-route `@Throttle` on login, refresh, and password reset.
- Progressive account lockout via `failedLoginCount` / `lockedUntil`.
- `AUTH_EXPOSE_RESET_TOKEN` may return the reset token only in `development`; boot fails if it is `true` in production.
- `passwordChangedAt` / `sessionsInvalidatedAt` compared to access-token `iat` for immediate revocation after reset / logout-all.

## Web

- `/login`, `/recuperar-senha`, `/redefinir-senha/[token]`, authenticated shell `/app`
- `middleware.ts` redirects `/app/*` to login when no session cookies exist
- Service worker skips caching `/api/` and `/app`

## Configuration

See `.env.example` for `AUTH_*`, `MAILER_DRIVER`, and `SMTP_URL`.
