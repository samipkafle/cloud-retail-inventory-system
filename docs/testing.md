# Testing

## Automated tests

`infrastructure/cdk/test/lambda/` has a Jest suite covering all 10 TypeScript Lambda handlers (74 tests): input validation, success paths, and error paths, using `aws-sdk-client-mock` to mock DynamoDB/SNS/CloudWatch/Cognito rather than hitting real AWS. Notably includes the business-logic edge cases: oversell rejection, low-stock alert creation + SNS publish when a sale crosses the reorder threshold, the sales transaction's conflict handling (409 on a concurrent stock change), manager-only enforcement of product writes with `AUTH_ENABLED` both on and off, and a test asserting `POST /users` never returns a password value.

```bash
cd infrastructure/cdk
npm test
```

`lambda-python/recommendation-engine/` has a separate pytest suite (15 tests) for the Python recommendation engine, using `moto` to mock DynamoDB rather than hitting real AWS:

```bash
cd infrastructure/cdk/lambda-python/recommendation-engine
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
```

**GitHub Actions CI** (`.github/workflows/backend-ci.yml`) runs on every PR/push touching `infrastructure/cdk/`: type-check (`tsc`), the Jest suite, `cdk synth`, and the pytest suite (separate job) — so a broken build or a failing test now blocks a PR instead of only being caught manually.

There's still no frontend test automation; see "What's not yet covered" below. All AWS-integration-level verification (does the real deployed API actually behave correctly end-to-end) remains manual — see the log below.

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

### FR-10 recommendation engine — 2026-09-06

Two real bugs were found and fixed only by verifying against the real deployed Lambda/DynamoDB, not just the pytest suite's contrived unit-test inputs:

| # | Check | Method | Result |
| --- | --- | --- | --- |
| 1 | First deploy attempt: `RecommendationEngineLambda` with pandas+numpy+scipy layers | `cdk deploy` | `CREATE_FAILED` — combined layer size exceeded Lambda's 250MB unzipped limit |
| 2 | Retry with just pandas+scipy | `cdk deploy` | Still `CREATE_FAILED` on the same limit |
| 3 | Switched to numpy-only, rewrote the regression/aggregation logic without pandas/scipy | `cdk deploy` | `CREATE_FAILED` again — turned out to be a local pytest venv (332MB) sitting inside the Lambda asset directory and getting zipped up as "function code" by `fromAsset()`, unrelated to the layer at all. Fixed by deleting the venv and adding an explicit `exclude` list to `Code.fromAsset()` |
| 4 | Redeploy after the real fix | `cdk deploy` | `UPDATE_COMPLETE` |
| 5 | Manually invoked the Lambda against real (sparse) production data | `aws lambda invoke` | Ran successfully — 9 products processed, 4 scored, 5 correctly marked "Insufficient data" |
| 6 | `GET /recommendations` | curl | `200`, ranked list, all R² values near zero (0.001–0.05) — expected given how little real sales history exists |
| 7 | Seeded ~9 months of synthetic history (`scripts/seed-synthetic-sales.ts --confirm`), re-invoked the Lambda | `aws lambda invoke` | 9/9 products scored, R² up to 0.68 |
| 8 | Re-checked `GET /recommendations` against the seeded data | curl | **Bug found**: every product showed `trendLabel: "Stable"`, including ones with a strong, well-explained decline (R²=0.68) — the fixed absolute slope threshold (0.05 units/day) was miscalibrated against the actual slope magnitudes involved |
| 9 | Fixed classification to key off R² (≥0.1) instead of raw slope magnitude, added regression tests, redeployed, re-invoked | `aws lambda invoke` + curl | Trend labels now correctly match each of the 9 products' designed synthetic pattern (2 growers → Increasing, 2 decliners → Decreasing, flat/weekend/seasonal products → Stable) |
| 10 | `GET /recommendations` with no token | curl | `401` |

### FR-09 forecast switched to the backend endpoint — 2026-09-06

Before switching the frontend from its client-side calculation to `GET /forecast`, verified via curl that the endpoint's numbers matched the existing client-side calculation exactly for the same data (ranking, `daysRemaining`, `suggestedRestockQuantity`). After switching, verified in a real browser (Playwright, real Cognito sign-in, real deployed API): the Dashboard forecast card and Insights recommendation cards render correct data, zero console errors. Confirmed the deployed frontend actually served the new code (`getForecasts` present in the live `js/api.js`, absent from `js/inventory.js`) — not just that the local copy worked.

### FR-08 reports endpoint — 2026-09-06

| # | Check | Method | Result |
| --- | --- | --- | --- |
| 1 | `GET /reports?type=inventory` | curl | `200`, presigned S3 URL returned |
| 2 | Fetched the presigned URL directly | curl | Real CSV content, correct columns/values, UTF-8 BOM present |
| 3 | `GET /reports?type=sales&from=&to=` (date range filter) | curl | `200`, correctly filtered row count |
| 4 | Unsigned direct request to the same S3 object URL | curl | `403` — bucket is genuinely private, not just "unlisted" |
| 5 | Invalid `type`, and `from` after `to` | curl | `400` for both |
| 6 | No token | curl | `401` |

### Users/Team page (manager account creation) — 2026-09-06

| # | Check | Method | Result |
| --- | --- | --- | --- |
| 1 | Staff-role session | Manual browser test | Team nav item never appears |
| 2 | Manager creates a real test account via the Team page form | Playwright, live API | `201`, directory refreshed to show it immediately |
| 3 | Directory list | Playwright, live API | Correctly shows email, role pill, status, created date for all existing accounts |
| 4 | Cleanup | `aws cognito-idp admin-delete-user` | Test account removed (no DELETE endpoint exists by design — account removal is a Console/CLI operation) |

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

Postman is used for manual API testing; there isn't yet a checked-in, versioned collection in this repo for the team to share.
