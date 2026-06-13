# LabSplit Black Gold API

All API routes live under `/api`.

All request bodies must be validated with Zod. Private routes require a valid `labsplit_session` cookie. Admin routes also require admin authorization.

## Standard Error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Amount must be greater than zero",
    "details": {}
  }
}
```

## Error Codes

```txt
UNAUTHORIZED
FORBIDDEN
VALIDATION_ERROR
NOT_FOUND
CONFLICT
OAUTH_VERIFICATION_FAILED
SPLIT_TOTAL_MISMATCH
INTERNAL_ERROR
NOT_IMPLEMENTED
```

## Auth

### POST `/api/auth/google`

Request:

```json
{
  "credential": "GOOGLE_ID_TOKEN"
}
```

The Worker must verify the token with Google before creating a local session.

### POST `/api/auth/apple`

Temporarily disabled while Apple review is pending. The login screen still displays the Apple control, but it is disabled. API calls to this route return:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Sign in with Apple is temporarily disabled.",
    "details": {}
  }
}
```

The request shape below applies after Sign in with Apple is enabled.

Request:

```json
{
  "identityToken": "APPLE_ID_TOKEN",
  "authorizationCode": "AUTH_CODE",
  "user": {
    "name": {
      "firstName": "Pony",
      "lastName": "Lab"
    },
    "email": "pony@example.com"
  }
}
```

When enabled, the Worker must verify the Apple identity token and must key identity by provider subject, not email.

### GET `/api/auth/me`

Returns the current authenticated user.

### POST `/api/auth/logout`

Clears `labsplit_session`.

## Members

### GET `/api/members`

Private. Returns active and historical members visible to the group.

### PATCH `/api/members/:userId`

Admin only. Updates role or status and writes audit logs for role/status changes.

## Expenses

### GET `/api/expenses`

Private. Supports filters:

```txt
from
to
category
paidBy
limit
cursor
```

### POST `/api/expenses`

Private active member route. Creates an expense and participant shares. The sum of shares must equal `amount`.

Required split methods:

```txt
equal
custom
ratio
```

### GET `/api/expenses/:expenseId`

Private. Returns the expense detail with participant shares.

### PATCH `/api/expenses/:expenseId`

Creator or admin only. Deleted expenses cannot be edited.

### DELETE `/api/expenses/:expenseId`

Admin only for MVP. Soft-deletes by setting `deleted_at`.

## Settlements

### GET `/api/settlements/summary`

Private. Returns balances and simplified suggested transfers.

Soft-deleted expenses are ignored. Pending payments do not reduce balances. Confirmed payments reduce outstanding balances.

### POST `/api/payments`

Private. Records a pending payment.

### PATCH `/api/payments/:paymentId/confirm`

Receiver or admin only. Confirms a pending payment and writes an audit log.

## Admin

### GET `/api/admin/audit-logs`

Admin only.

### GET `/api/admin/export.csv`

Admin only. Must write an `admin_csv_export` audit log.

### PATCH `/api/admin/easter-eggs/:eggId`

Admin only. Enables or disables an Easter egg and writes an audit log.
