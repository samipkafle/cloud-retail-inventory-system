# Requirements

Source of truth: the NIT6150 System Analysis and Design (SAD) Report (approved 12/08/2026). This document tracks implementation status against that report's functional requirements and records any deviations discovered during implementation, so the design and the code stay traceable to each other as the project progresses.

## Functional requirements status

| ID | Requirement | Priority | Status |
| --- | --- | --- | --- |
| FR-01 | Authenticate users and apply role-based access | Must | Implemented and enforced — the frontend signs in against the real Cognito User Pool (SRP flow via `amazon-cognito-identity-js`), attaches the ID token to every API call, and the API Gateway Cognito authorizer (`AUTH_ENABLED = true` in `cdk-stack.ts`) rejects unauthenticated requests. The `manager` Cognito group gates product create/update/delete in the handler; staff (any authenticated non-manager) can record sales and view inventory/alerts. See [architecture.md](architecture.md#authentication-and-authorization-fr-01) and [testing.md](testing.md#fr-01-authentication-and-authorization--2026-09-06) for the implementation and verification detail |
| FR-02 | Create, edit, archive, search and view products | Must | Implemented (`/products` CRUD) |
| FR-03 | Record daily sales with product, quantity, price and timestamp | Must | Implemented (`POST /sales`) |
| FR-04 | Automatically update inventory after each valid sale | Must | Implemented (`POST /sales`) |
| FR-05 | Reject sales that exceed available stock | Must | Implemented (`POST /sales`, conditional update) |
| FR-06 | Display current stock and low-stock products | Must | Implemented (`GET /inventory` — returns each product's stock, threshold, OK/LOW status, and a below-threshold count) |
| FR-07 | Publish low-stock notifications and store alert history | Must | Implemented — alert history is written on each sale and readable via `GET /alerts`; an SNS topic (`RetailLowStockAlerts`) emails a low-stock notification whenever an alert is raised |
| FR-08 | Generate sales reports and export report files | Should | Implemented — `GET /reports?type=inventory\|sales&from=&to=` (Lambda `reports-handler.ts`) generates a CSV server-side, stores it in a private S3 bucket, and returns a time-limited presigned download URL. The frontend's original client-side CSV export (`frontend/js/actions.js`) still exists alongside it as an instant, no-network-round-trip option — not yet switched to call the endpoint, unlike FR-09's forecast |
| FR-09 | Calculate smart reorder quantities using 14-day sales velocity | Must | Implemented — `GET /forecast` and `GET /forecast/{productId}` (Lambda `forecast-handler.ts`) compute the 14-day velocity, safety buffer and suggested restock quantity server-side, querying the Sales GSI rather than scanning. The frontend calls this endpoint (`frontend/js/api.js`, cached in `state.forecasts`) instead of computing it client-side, so every device sees the same Lambda-computed numbers |
| FR-10 | Train and display demand recommendations using historical sales patterns | Must | Not started — the "demand insights" shown today are the rule-based FR-09 forecast, not a trained model. No Python/scikit-learn Lambda, no EventBridge Scheduler job, and no `Recommendation` DynamoDB table exist yet |
| FR-11 | Provide dashboard charts for sales, category share and product trends | Should | Implemented — dashboard charts are rendered client-side from the shared AWS data (`frontend/js/render.js`) |
| FR-12 | Record logs and operational events for monitoring | Should | Partially implemented — default Lambda/CloudWatch logging, plus a dedicated telemetry API (`POST /telemetry`, `GET /telemetry`, `GET /telemetry/events`) that records frontend health/error events as CloudWatch custom metrics, with a CloudWatch alarm on repeated frontend errors |

## Deviations from the SAD Report data design

The SAD report's Section 4 entity tables define the minimum key attributes for each entity. During implementation of `POST /sales`, two additions were made beyond what Section 4 documents. Both are justified by other parts of the same report rather than being arbitrary changes.

### Alert entity — added fields

Section 4 (Figure 1) documents `Alert` as `alertId (PK)`, `productId (FK)` only, with no timestamp or stock context. However, the Dashboard storyboard (Figure 5) displays alerts with a relative timestamp ("2 hours ago") and stock/threshold context ("Ice Cream 1L - 6 in stock (threshold 8)"), which the documented schema cannot support. The implemented Alert record therefore also includes:

- `raisedAt` (ISO 8601 string) — required to render "time ago" on the Dashboard and to sort alert history chronologically
- `stockAtAlert` (Number) — the stock level at the moment the alert was raised
- `reorderThreshold` (Number) — the threshold that was crossed, captured at alert time so it stays accurate even if the product's threshold is changed later

### Sales table — added GSI

Section 4's Sale entity table lists only the base attributes, but the accompanying prose explains that `soldAt` is stored as ISO 8601 specifically "so that both the smart restocking forecast (14-day sales velocity) and the recommendation engine... can filter and sort chronologically." Implementing that access pattern requires a secondary index, not just the attribute. The CDK stack adds a `productId`/`soldAt` Global Secondary Index (`productId-soldAt-index`) on the Sales table to support querying a single product's sales history in chronological order.

## Deviations from the SAD Report technology stack

### Frontend framework

The SAD report specifies a React SPA for the frontend. The implemented frontend is static HTML/CSS with vanilla JavaScript ES modules (`frontend/index.html`, `frontend/style.css`, `frontend/js/*.js`), still hosted on S3 as designed. Functionality (dashboard, product/sales/alert workflows, charts, CSV export) matches the SAD wireframes; the deviation is the implementation technology, not the scope.

