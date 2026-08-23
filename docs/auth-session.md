# Auth and session management

CLI-12 adds the first authentication/session foundation for Clivyra.

## Endpoints

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/password-reset/request`
- `POST /auth/password-reset/confirm`
- `GET /auth/me`

## Passwords

Passwords are hashed with PBKDF2-SHA512, per-password random salt, and an application pepper from `AUTH_PASSWORD_PEPPER`.

The database must never store plaintext passwords. The seed also avoids creating a default plaintext password.

## Access tokens

Access tokens are HMAC-SHA256 signed and contain:

- user id
- active tenant id
- refresh session id
- issue time and expiration

The API resolves tenant context from the signed token. The frontend must not send `tenantId` as an authorization source.

## Refresh tokens

Refresh tokens are opaque random values. Only their HMAC hash is stored in `RefreshSession`.

Refresh flow rotates tokens:

1. current refresh token is validated
2. current session is revoked
3. a new refresh session is created
4. a new access token and refresh token are returned

Logout revokes the submitted refresh token.

## Password reset

Password reset request always returns a generic `ok` response to avoid user enumeration.

In non-production environments, the reset token is returned in the response so E2E tests can exercise the full flow without an email provider.

Confirming password reset:

- validates the reset token
- updates the password hash
- marks the reset token as used
- revokes active refresh sessions
