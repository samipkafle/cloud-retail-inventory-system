# Testing

## Automated tests

`infrastructure/cdk/test/lambda/` has a Jest suite covering all 6 Lambda handlers (41 tests): input validation, success paths, and error paths, using `aws-sdk-client-mock` to mock DynamoDB/SNS/CloudWatch rather than hitting real AWS. Notably includes the business-logic edge cases: oversell rejection, low-stock alert creation + SNS publish when a sale crosses the reorder threshold, the sales transaction's conflict handling (409 on a concurrent stock change), and manager-only enforcement of product writes with `AUTH_ENABLED` both on and off.

```bash
cd infrastructure/cdk
npm test
```

**GitHub Actions CI** (`.github/workflows/backend-ci.yml`) runs on every PR/push touching `infrastructure/cdk/`: type-check (`tsc`), the Jest suite, and `cdk synth` — so a broken build or a failing test now blocks a PR instead of only being caught manually.

There's still no `pytest` (there's no Python code yet — see [requirements.md](requirements.md) FR-10) and no frontend test automation; see "What's not yet covered" below. All AWS-integration-level verification (does the real deployed API actually behave correctly end-to-end) remains manual — see the log below.

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

- No automated integration test suite against a real/emulated AWS backend (Postman collection exists for manual use but isn't run in CI, and there's no local DynamoDB/LocalStack setup)
- No regression coverage for the frontend (no browser automation / component tests)
- No `pytest` (no Python code exists yet — FR-10's recommendation engine)

Postman is used for manual API testing; there isn't yet a checked-in, versioned collection in this repo for the team to share.
