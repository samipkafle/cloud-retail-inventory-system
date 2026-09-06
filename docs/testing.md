# Testing

## Current state: no automated test suite

Despite `jest` being listed as a dependency in `infrastructure/cdk/package.json`, there are currently **no** `.test.ts`/`.spec.ts` files anywhere in the repo, no `pytest` (there's no Python code yet either — see [requirements.md](requirements.md) FR-10), and no CI workflow (`.github/workflows/` doesn't exist). All verification to date has been manual, either through the deployed frontend, Postman, or direct AWS CLI/curl calls against the live stack. This is a real gap against the SAD report's testing plan (Jest + aws-sdk-client-mock for TS Lambdas, Postman collections, GitHub Actions CI) and should be treated as outstanding work, not evidence that the system is untested — see the manual verification log below for what has actually been checked.

## Manual verification log

### FR-01 authentication and authorization — 2026-09-06

Performed against the live deployed stack (`ap-southeast-2`, stack `CdkStack`) after enabling the Cognito authorizer, using two real Cognito accounts created via `admin-create-user`/`admin-set-user-password` (`manager@greenleaf.demo` in the `manager` group, `staff@greenleaf.demo` with no group).

| # | Check | Method | Result |
| --- | --- | --- | --- |
| 1 | `GET /products` with no `Authorization` header | curl | `401`, `{"message":"Unauthorized"}` |
| 2 | Manager sign-in (`USER_PASSWORD_AUTH` via CLI) | `aws cognito-idp initiate-auth` | Returned valid ID token |
| 3 | `GET /products` with manager token | curl | `200`, product list returned |
| 4 | Staff sign-in | `aws cognito-idp initiate-auth` | Returned valid ID token |
| 5 | `GET /products` with staff token | curl | `200` — staff can view |
| 6 | `POST /products` with staff token | curl | `403`, `{"message":"Only managers can manage products"}` |
| 7 | `POST /products` with manager token | curl | `201`, product created |
| 8 | `DELETE /products/{id}` with manager token, cleanup | curl | `200`, product deleted |
| 9 | CORS preflight (`OPTIONS /products`, `Access-Control-Request-Headers: authorization,content-type`) | curl | `204`, `Access-Control-Allow-Headers: Content-Type,Authorization` |
| 10 | Real browser sign-in (SRP flow via `amazon-cognito-identity-js`) | Manual browser test | Initially **failed** — see note below |

**Note on #10:** the first round of checks above (1–9) used the AWS CLI's `USER_PASSWORD_AUTH` flow, which passed and gave false confidence that sign-in worked end-to-end. The actual frontend SDK (`amazon-cognito-identity-js`'s `authenticateUser()`) defaults to the **SRP** auth flow, which was not enabled on the Cognito app client (only `USER_PASSWORD_AUTH`/`ADMIN_USER_PASSWORD_AUTH` were). This made real browser sign-in fail silently while every CLI-based check passed — a reminder that testing the API in isolation isn't the same as testing the actual client integration. Fixed by enabling `ALLOW_USER_SRP_AUTH` on the app client; a related bug found in the same pass — API Gateway's own 401/403 Gateway Responses (bypassing Lambda) lacked CORS headers, making a real auth rejection look like a generic connection failure in the browser — was fixed by adding `addGatewayResponse` CORS headers for `UNAUTHORIZED`/`ACCESS_DENIED`. Re-verified with checks 1–9 above after both fixes; confirmed working in a real browser session afterward.

### Feature testing (ongoing, manual)

- Product CRUD via the deployed frontend and Postman
- Sale recording, stock decrement, and oversell rejection
- Low-stock alert creation and SNS email delivery
- Cross-device sales/activity history consistency (shared DynamoDB state, not local storage)
- 14-day demand forecast and suggested restock quantities against known seed data
- CSV export (inventory and sales) and dashboard chart rendering
- TypeScript compilation (`npm run build`) and `cdk synth` before every deploy

## What's not yet covered

- No unit tests for any Lambda handler (input validation, DynamoDB error paths, the sales transaction's conditional-check/conflict handling, alert-raising logic)
- No automated integration test suite (Postman collection exists for manual use but isn't run in CI)
- No CI pipeline — nothing currently blocks a PR with a broken build or a failing `cdk synth`
- No regression coverage for the frontend (no browser automation / component tests)

Postman is used for manual API testing; there isn't yet a checked-in, versioned collection in this repo for the team to share.
