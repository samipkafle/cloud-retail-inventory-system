# Architecture

This documents the system as actually deployed (CDK stack `CdkStack`, region `ap-southeast-2`), cross-referenced against the NIT6150 SAD report. Where the deployed system deviates from the SAD report's design, see [requirements.md](requirements.md)'s "Deviations" sections rather than repeating them here.

## High-level architecture

```text
User's browser
      |
      v
Amazon S3 static website (frontend/)
      |
      v
Amazon API Gateway (REST API, edge-optimized)
      |  Cognito User Pool authorizer on every route (FR-01)
      v
AWS Lambda functions
      |
      +-------------------+-------------------+
      |                   |                   |
      v                   v                   v
Amazon DynamoDB      Amazon SNS          Amazon CloudWatch
4 tables             Low-stock +         Custom metrics, alarms,
                      frontend-error       Logs Insights queries
                      email alerts
```

Low-stock alerts branch out from the sales flow specifically:

```text
POST /sales (sales-handler.ts)
      |
      v (stock drops to/below reorderThreshold)
DynamoDB RetailAlerts (alert history)
      |
      v
SNS RetailLowStockAlerts topic
      |
      v
Email notification
```

## AWS services

| Service | Purpose | CDK construct |
| --- | --- | --- |
| Amazon S3 | Hosts the static frontend as a public website (`FrontendBucket`); stores generated CSV reports privately, served only via presigned URL (`ReportsBucket`) | `FrontendBucket` + `BucketDeployment`, `ReportsBucket` |
| Amazon API Gateway | REST API (`InventoryApi`), edge-optimized, Cognito-authorized | `RestApi` |
| AWS Lambda | 8 TypeScript functions (`NodejsFunction`) + 1 Python function — see [Lambda functions](#lambda-functions) | `NodejsFunction`, `lambda.Function` |
| Amazon DynamoDB | 4 tables — see [Data model](#data-model) | `dynamodb.Table` |
| Amazon Cognito | User Pool + app client + `manager` group (FR-01) | `UserPool`, `UserPoolClient`, `CfnUserPoolGroup` |
| Amazon SNS | `RetailLowStockAlerts` topic — low-stock and frontend-error emails | `sns.Topic` |
| Amazon CloudWatch | Custom metrics (`GreenLeaf/Frontend`), an alarm on repeated frontend errors, and Logs Insights queries for the raw event log | `cloudwatch.Metric`, `cloudwatch.Alarm` |
| Amazon EventBridge | Daily schedule that triggers the recommendation engine's training run (FR-10) | `events.Rule` + `events.Schedule.rate()` |
| AWS IAM | Least-privilege roles per Lambda, plus explicit policy statements where table grants don't cover an action (transactions, CloudWatch, Logs Insights) | `iam.PolicyStatement` |
| AWS CDK | Infrastructure as code for all of the above | `infrastructure/cdk/lib/cdk-stack.ts` |

## Data model

Four separate DynamoDB tables (deliberately not single-table design — see the SAD report's rationale: dominant access patterns are single-partition-key lookups, and separate tables keep each one easier to reason about and test). All are `PAY_PER_REQUEST` billing with `RemovalPolicy.DESTROY` (acceptable for a $0 student prototype; would need reconsidering for anything real).

### RetailInventory (product/inventory)
Partition key: `productId` (String)

| Attribute | Type | Notes |
| --- | --- | --- |
| `productId` | String | e.g. `P001` |
| `name` | String | |
| `category` | String | Defaults to `"Other"` if omitted |
| `price` | Number | |
| `stock` | Number | Decremented transactionally by `POST /sales` |
| `reorderThreshold` | Number | Below-or-equal this value → `LOW` status |

### RetailSales
Partition key: `saleId` (String, UUID)
GSI `productId-soldAt-index`: partition `productId`, sort `soldAt` — supports querying one product's sales chronologically, which both the FR-09 forecast and any future FR-10 recommendation model need.

| Attribute | Type | Notes |
| --- | --- | --- |
| `saleId` | String | UUID, generated server-side |
| `productId` | String | FK to RetailInventory |
| `productName` | String | Denormalised at sale time so history reads don't need a join |
| `quantitySold` | Number | |
| `unitPrice` | Number | Denormalised at sale time — price changes later don't rewrite history |
| `total` | Number | `unitPrice * quantitySold`, rounded to 2dp |
| `soldAt` | String | ISO 8601 |

### RetailAlerts
Partition key: `alertId` (String, UUID)

| Attribute | Type | Notes |
| --- | --- | --- |
| `alertId` | String | UUID |
| `productId` | String | FK to RetailInventory |
| `stockAtAlert` | Number | Stock level at the moment the alert was raised |
| `reorderThreshold` | Number | Threshold captured at alert time, so it stays accurate if the product's threshold changes later |
| `raisedAt` | String | ISO 8601 |

These three fields (`stockAtAlert`, `reorderThreshold`, `raisedAt`) go beyond the SAD report's Section 4 Alert entity — see [requirements.md](requirements.md) for why.

### RetailRecommendations (FR-10)
Partition key: `productId` (String) — one current recommendation per product, overwritten by each training run.

| Attribute | Type | Notes |
| --- | --- | --- |
| `productId` | String | FK to RetailInventory |
| `predictedDemand` | Number | Predicted total demand over the next 14 days |
| `trendLabel` | String | `Increasing`, `Decreasing`, `Stable`, or `Insufficient data` |
| `modelVersion` | String | e.g. `trend-linreg-v1` |
| `generatedAt` | String | ISO 8601, when this training run wrote the item |
| `basis` | String | Human-readable explanation (days of history, R²) — the AI-as-decision-support framing depends on this being shown to the user, not hidden |
| `daysOfHistory` | Number | |
| `rSquared` | Number | Omitted when `trendLabel` is `Insufficient data` |

### RetailActivities (shared audit log)
Partition key: `activityId` (String, UUID)

| Attribute | Type | Notes |
| --- | --- | --- |
| `activityId` | String | UUID |
| `type` | String | One of `sale`, `stock`, `alert` |
| `title` | String | Max 120 chars |
| `detail` | String | Max 300 chars |
| `status` | String | `Completed` or `Attention` |
| `user` | String | Taken from the Cognito ID token's `name`/`email` claim when present, else client-supplied, max 100 chars |
| `createdAt` | String | ISO 8601 |

## Lambda functions

| Function | Entry | Routes | Table access |
| --- | --- | --- | --- |
| InventoryLambda | `lambda/inventory-handler.ts` | `GET/POST /products`, `GET/PUT/DELETE /products/{productId}` | Read/write RetailInventory |
| SalesLambda | `lambda/sales-handler.ts` | `GET/POST /sales` | Read/write RetailInventory + RetailSales (transactional), write RetailAlerts, publish to SNS |
| AlertsLambda | `lambda/alerts-handler.ts` | `GET /alerts` | Read RetailAlerts |
| ActivityLambda | `lambda/activity-handler.ts` | `GET/POST /activities` | Read/write RetailActivities |
| InventoryStatusLambda | `lambda/inventory-status-handler.ts` | `GET /inventory` | Read RetailInventory |
| ForecastLambda | `lambda/forecast-handler.ts` | `GET /forecast`, `GET /forecast/{productId}` | Read RetailInventory, Query RetailSales (`productId-soldAt-index` GSI) |
| ReportsLambda | `lambda/reports-handler.ts` | `GET /reports` | Read RetailInventory, Read RetailSales, read/write the private Reports S3 bucket |
| RecommendationEngineLambda (Python) | `lambda-python/recommendation-engine/handler.py` | None — runs on a daily EventBridge schedule, not an API route | Read RetailInventory, Read RetailSales, write RetailRecommendations |
| RecommendationsLambda | `lambda/recommendations-handler.ts` | `GET /recommendations` | Read RetailRecommendations |
| UsersLambda | `lambda/users-handler.ts` | `GET/POST /users` | Cognito admin actions (`AdminCreateUser`, `AdminAddUserToGroup`, `ListUsers`, `ListUsersInGroup`), scoped to the User Pool's ARN — no DynamoDB access |
| TelemetryLambda | `lambda/telemetry-handler.ts` | `POST/GET /telemetry`, `GET /telemetry/events` | None (CloudWatch metrics + Logs Insights only) |

All run on `NODEJS_24_X`, bundled per-function via `NodejsFunction` (esbuild, no Docker).

## Authentication and authorization (FR-01)

- **Cognito User Pool** (`RetailUserPool`): email sign-in, self-signup disabled — accounts are provisioned by an admin (`admin-create-user`), matching a retail-staff app rather than a public consumer app.
- **App client**: no client secret (required for browser-side auth); `ALLOW_USER_SRP_AUTH`, `ALLOW_USER_PASSWORD_AUTH` and `ALLOW_ADMIN_USER_PASSWORD_AUTH` all enabled. The frontend's `amazon-cognito-identity-js` library defaults to the SRP flow — this was initially missed (only `USER_PASSWORD_AUTH` was enabled), which made browser sign-in fail even though direct CLI/API testing with `USER_PASSWORD_AUTH` passed. Fixed once discovered via real end-to-end browser testing, not just API-level testing.
- **`manager` Cognito group**: members can create/update/delete products; everyone else authenticated is treated as staff (record sales, view inventory/alerts, but not manage the catalogue).
- **Enforcement is a single switch**: `AUTH_ENABLED` in `cdk-stack.ts` controls both the API Gateway authorizer (`COGNITO` vs `NONE` on every route) and an `AUTH_ENABLED` Lambda env var that `inventory-handler.ts`'s `requireManager()` checks before allowing product writes. Both must agree — the Lambda-side check is a defence-in-depth backstop, not the primary enforcement (the API Gateway authorizer is).
- **Frontend integration** (`frontend/js/auth.js`, `frontend/js/api.js`): the login form calls Cognito directly (no server-side session), decodes the ID token's `cognito:groups` claim to pick the app's manager/staff UI role, and attaches the raw ID token as the `Authorization` header on every subsequent API call.
- **Manager-controlled account creation**: self-sign-up is disabled on the User Pool, so `GET/POST /users` (`users-handler.ts`, manager-only) is the only way to create new accounts short of the AWS Console/CLI. `AdminCreateUser` lets Cognito auto-generate and email the temporary password directly to the new user — neither the creating manager nor the API ever sees or handles that password. The frontend's Team page (`frontend/index.html`'s `#teamPage`, `renderTeam()` in `render.js`) is the manager-facing UI for this.
- **CORS on error responses**: API Gateway's own `UNAUTHORIZED`/`ACCESS_DENIED` Gateway Responses bypass Lambda entirely (and therefore the CORS headers each Lambda adds itself), so they needed explicit `addGatewayResponse` CORS headers — otherwise a browser reports a real 401/403 as an opaque network/CORS failure instead of a readable error.

See [testing.md](testing.md) for the verification evidence for all of the above.

## API surface

| Method | Path | Lambda | Auth |
| --- | --- | --- | --- |
| GET | `/products` | Inventory | Any authenticated user |
| POST | `/products` | Inventory | `manager` group only |
| GET | `/products/{productId}` | Inventory | Any authenticated user |
| PUT | `/products/{productId}` | Inventory | `manager` group only |
| DELETE | `/products/{productId}` | Inventory | `manager` group only |
| GET | `/sales` | Sales | Any authenticated user |
| POST | `/sales` | Sales | Any authenticated user |
| GET | `/inventory` | InventoryStatus | Any authenticated user |
| GET | `/forecast` | Forecast | Any authenticated user |
| GET | `/forecast/{productId}` | Forecast | Any authenticated user |
| GET | `/reports` | Reports | Any authenticated user |
| GET | `/recommendations` | Recommendations | Any authenticated user |
| GET | `/users` | Users | `manager` group only |
| POST | `/users` | Users | `manager` group only |
| GET | `/alerts` | Alerts | Any authenticated user |
| GET | `/activities` | Activity | Any authenticated user |
| POST | `/activities` | Activity | Any authenticated user |
| POST | `/telemetry` | Telemetry | Any authenticated user |
| GET | `/telemetry` | Telemetry | Any authenticated user |
| GET | `/telemetry/events` | Telemetry | Any authenticated user |

Every route also gets an auto-generated `OPTIONS` method (CORS preflight, `AuthorizationType.NONE`) via `defaultCorsPreflightOptions`.

## Sales and low-stock alert flow

1. Frontend validates the product and quantity, then `POST /sales`.
2. `sales-handler.ts` reads the current product with a consistent read.
3. Rejects (400) if the requested quantity exceeds current stock.
4. A `TransactWriteItemsCommand` atomically decrements stock (conditioned on `stock >= quantity`) and inserts the sale record — a sale is never recorded without its matching stock update, and vice versa. A `ConditionalCheckFailedException`/`TransactionCanceledException` (stock changed concurrently) returns 409 for the frontend to retry against fresh data.
5. Re-reads the product's remaining stock. If it's at or below `reorderThreshold`, writes a `RetailAlerts` item and publishes an SNS notification (both best-effort — a failure here is logged but doesn't fail the sale itself).
6. Frontend reloads shared products, sales and activity data.

## Demand recommendation engine (FR-10)

1. `RecommendationSchedule` (an EventBridge rule, `rate(1 day)`) invokes `RecommendationEngineLambda` — the one deliberate Python function in an otherwise all-TypeScript stack. It can also be invoked manually (`aws lambda invoke`) to refresh recommendations on demand, e.g. right after seeding data.
2. The function scans RetailInventory and RetailSales, groups each product's sales into a zero-filled daily series (days with no sale count as 0, not "missing"), and fits an ordinary-least-squares line (`numpy.polyfit`) to that series.
3. A product needs at least 7 days of history to get a real prediction; fewer than that writes `trendLabel: "Insufficient data"` instead of guessing.
4. `trendLabel` is decided by R² first, not raw slope magnitude: a trend is only called `Increasing`/`Decreasing` if the line explains at least 10% of the day-to-day variance (`rSquared >= 0.1`); otherwise it's `Stable` regardless of the slope's sign or size. An earlier version used a fixed slope-magnitude threshold instead, which miscalibrated across products with different sales volumes — see the commit history / [testing.md](testing.md) for the bug this real-data verification caught.
5. Every product gets a recommendation row (never skipped silently) — `predictedDemand`, `trendLabel`, `basis`, `daysOfHistory` and `rSquared` are written to RetailRecommendations via one `batch_writer` call, keyed so a new run overwrites the previous one rather than accumulating history.
6. `GET /recommendations` (`recommendations-handler.ts`) reads that table back, ranked by `predictedDemand` descending.

**Why numpy, and why R² instead of scikit-learn's own diagnostics:** see [requirements.md](requirements.md)'s technology-stack deviation section for the scikit-learn substitution, and [testing.md](testing.md) for the real-data verification that caught both the NaN-on-zero-variance bug and the slope-threshold miscalibration before this was considered done.

**Training data:** the SAD report's top-flagged risk is "Insufficient sales history for ML" (High/High), mitigated by seeding a synthetic ~9-month history. `scripts/seed-synthetic-sales.ts` does exactly that — a dry-run-by-default, idempotent script (deterministic `saleId`s, tagged `synthetic: true`) that gives each real product a distinct deliberate pattern (steady growth, decline, weekend-heavy, seasonal, flat) rather than uniform noise, so the engine visibly produces different trend labels across products.

## Monitoring and telemetry

- The frontend posts health/error events to `POST /telemetry` (fire-and-forget, `keepalive: true`). `telemetry-handler.ts` logs each event as a structured `FRONTEND_EVENT` line (Lambda ships stdout to CloudWatch Logs automatically) and records it as a `GreenLeaf/Frontend` custom metric (`FrontendErrorCount`/`FrontendSuccessCount`/`FrontendResponseTime`).
- `GET /telemetry?minutes=N` aggregates those metrics via `GetMetricDataCommand` for the Monitoring page's summary tiles.
- `GET /telemetry/events?limit=N` runs a CloudWatch Logs Insights query against the Telemetry Lambda's own log group to return raw recent events for the detail log — Logs Insights queries are asynchronous, so the handler polls `GetQueryResultsCommand` until it completes (function timeout extended to 20s to cover this).
- A CloudWatch alarm (`GreenLeafFrontendErrors`) fires on 3+ frontend errors in a 5-minute window and publishes to the same SNS topic used for low-stock alerts, so both flow into one inbox.
- The Telemetry Lambda's name is set explicitly (`GreenLeaf-TelemetryLambda`) rather than left to CDK auto-naming, so its own `logs:StartQuery` IAM policy can reference the log group by a literal ARN instead of `telemetryLambda.functionName` — a self-reference there creates a circular CloudFormation dependency (the function's role policy would depend on the function, which the API's Deployment/Stage in turn depend on). See [aws/aws-cdk#11020](https://github.com/aws/aws-cdk/issues/11020).

## Frontend

Static HTML/CSS/vanilla JavaScript ES modules (`frontend/`), no build step or bundler — deployed to S3 as-is by `BucketDeployment`. See [requirements.md](requirements.md) for why this deviates from the SAD report's planned React SPA.

| File | Responsibility |
| --- | --- |
| `index.html` | Login screen, navigation, dashboard pages, forms, modals |
| `style.css` | Layout, responsive design, styling |
| `script.js` | Bootstraps the app on `DOMContentLoaded` |
| `js/app.js` | Event wiring, login/logout, page navigation |
| `js/auth.js` | Real Cognito sign-in/sign-out, `cognito:groups` → app role mapping |
| `js/api.js` | All API Gateway requests, including attaching the Cognito ID token |
| `js/actions.js` | Product/sale forms, restocking, CSV export, data loading |
| `js/config.js` | Runtime config: API URL, Cognito Pool/Client IDs, shared `state` |
| `js/inventory.js` | Stock status, sales-history helpers used by the dashboard charts |
| `js/render.js` | Renders dashboard pages, tables, charts, reports |
| `js/ui.js` | Modals, navigation, role-based visibility, loading states |
| `js/utils.js` | Formatting, validation, HTML/CSV helpers |

The Cognito SDK (`amazon-cognito-identity-js`) loads via a pinned CDN `<script>` tag as a global (`AmazonCognitoIdentity`) rather than an npm dependency, since there's no build step to bundle one.

## Infrastructure and deployment

Everything above is defined in `infrastructure/cdk/lib/cdk-stack.ts` and deployed as a single CloudFormation stack (`CdkStack`):

```bash
cd infrastructure/cdk
npm install
npm run build
npm run cdk -- synth
npm run cdk -- deploy
```

A deploy updates Lambda code, API Gateway configuration, DynamoDB tables (schema-compatible changes only — CDK will refuse or replace on breaking changes), Cognito, and re-syncs the frontend to S3. There's no CI pipeline yet enforcing `synth`/tests on PRs (see [testing.md](testing.md)), so this currently relies on whoever deploys running it manually and reviewing the CloudFormation changeset.
