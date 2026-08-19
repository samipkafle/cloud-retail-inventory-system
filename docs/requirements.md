# Requirements

Source of truth: the NIT6150 System Analysis and Design (SAD) Report (approved 12/08/2026). This document tracks implementation status against that report's functional requirements and records any deviations discovered during implementation, so the design and the code stay traceable to each other as the project progresses.

## Functional requirements status

| ID | Requirement | Priority | Status |
| --- | --- | --- | --- |
| FR-01 | Authenticate users and apply role-based access | Must | Not started |
| FR-02 | Create, edit, archive, search and view products | Must | Implemented (`/products` CRUD) |
| FR-03 | Record daily sales with product, quantity, price and timestamp | Must | Implemented (`POST /sales`) |
| FR-04 | Automatically update inventory after each valid sale | Must | Implemented (`POST /sales`) |
| FR-05 | Reject sales that exceed available stock | Must | Implemented (`POST /sales`, conditional update) |
| FR-06 | Display current stock and low-stock products | Must | Not started (`GET /inventory`) |
| FR-07 | Publish low-stock notifications and store alert history | Must | Partially implemented — alert history is written on each sale and readable via `GET /alerts`; SNS notification publishing not started |
| FR-08 | Generate sales reports and export report files | Should | Not started |
| FR-09 | Calculate smart reorder quantities using 14-day sales velocity | Must | Not started |
| FR-10 | Train and display demand recommendations using historical sales patterns | Must | Not started |
| FR-11 | Provide dashboard charts for sales, category share and product trends | Should | Not started |
| FR-12 | Record logs and operational events for monitoring | Should | Partially implemented (default Lambda/CloudWatch logging only) |

## Deviations from the SAD Report data design

The SAD report's Section 4 entity tables define the minimum key attributes for each entity. During implementation of `POST /sales`, two additions were made beyond what Section 4 documents. Both are justified by other parts of the same report rather than being arbitrary changes.

### Alert entity — added fields

Section 4 (Figure 1) documents `Alert` as `alertId (PK)`, `productId (FK)` only, with no timestamp or stock context. However, the Dashboard storyboard (Figure 5) displays alerts with a relative timestamp ("2 hours ago") and stock/threshold context ("Ice Cream 1L - 6 in stock (threshold 8)"), which the documented schema cannot support. The implemented Alert record therefore also includes:

- `raisedAt` (ISO 8601 string) — required to render "time ago" on the Dashboard and to sort alert history chronologically
- `stockAtAlert` (Number) — the stock level at the moment the alert was raised
- `reorderThreshold` (Number) — the threshold that was crossed, captured at alert time so it stays accurate even if the product's threshold is changed later

### Sales table — added GSI

Section 4's Sale entity table lists only the base attributes, but the accompanying prose explains that `soldAt` is stored as ISO 8601 specifically "so that both the smart restocking forecast (14-day sales velocity) and the recommendation engine... can filter and sort chronologically." Implementing that access pattern requires a secondary index, not just the attribute. The CDK stack adds a `productId`/`soldAt` Global Secondary Index (`productId-soldAt-index`) on the Sales table to support querying a single product's sales history in chronological order.
