# GreenLeaf Cloud Retail Inventory System

## Project Overview

GreenLeaf is a cloud-based retail inventory and sales monitoring system built with an AWS serverless architecture. It gives store staff one place to view products, record sales, monitor stock, review business activity and generate reports. Managers can also add, edit, delete and restock products.

The application uses a static HTML, CSS and JavaScript frontend connected to an API Gateway REST API. AWS Lambda handles the business logic, while DynamoDB stores the shared product, sales, activity and alert records used by every device.

## Main Features

- Product creation, viewing, editing and deletion
- Product category, price, stock and reorder-level management
- Sales recording with automatic stock reduction
- Validation that prevents selling more stock than is available
- Shared sales history stored in DynamoDB
- Shared audit history with user, action and full date/time
- Low-stock detection using each product's reorder level
- Low-stock alert history and Amazon SNS email notifications
- Fourteen-day demand insights and suggested restock quantities
- Dashboard charts for sales activity and product information
- Inventory and sales CSV exports
- CloudWatch-based application monitoring
- Responsive interface for desktop and mobile devices

## Current Authentication Status

The AWS CDK stack creates an Amazon Cognito User Pool, an application client and a `manager` group. However, Cognito protection is currently disabled on the API routes while the real sign-in flow is being completed.

The current frontend login is a prototype role selector. It demonstrates the different manager, staff and maintainer interfaces, but it is not yet secure authentication. Before production use, the frontend must sign in through Cognito, attach the returned token to API requests, and the API Gateway Cognito authorizer and backend manager checks must be enabled.

Public self-sign-up is disabled by design. Staff accounts are intended to be created by a manager or administrator.

## System Architecture

```text
User's browser
      |
      v
Amazon S3 static website
      |
      v
Amazon API Gateway
      |
      v
AWS Lambda functions
      |
      +----------------------+
      |                      |
      v                      v
Amazon DynamoDB         Amazon SNS
Shared business data    Low-stock emails
      |
      v
Amazon CloudWatch
Logs, metrics and monitoring
```

## AWS Services

| AWS service | Purpose |
| --- | --- |
| Amazon S3 | Hosts the static frontend |
| API Gateway | Provides the REST API used by the frontend |
| AWS Lambda | Runs product, sales, activity, alert, inventory and monitoring logic |
| DynamoDB | Stores products, sales, activities and low-stock alerts |
| Amazon SNS | Sends low-stock email notifications |
| Amazon CloudWatch | Stores logs and frontend monitoring information |
| Amazon Cognito | Creates the user directory and planned role-based authentication |
| AWS IAM | Controls permissions between AWS services |
| AWS CDK | Defines and deploys the AWS infrastructure as code |

## Technology Stack

- HTML5 and CSS3
- JavaScript ES modules
- TypeScript and Node.js
- AWS CDK
- AWS SDK for JavaScript
- Amazon API Gateway
- AWS Lambda
- Amazon DynamoDB
- Amazon S3
- Amazon SNS
- Amazon CloudWatch
- Amazon Cognito
- Git and GitHub

## Frontend Structure

| File | Responsibility |
| --- | --- |
| `frontend/index.html` | Defines the login screen, navigation, dashboard pages, forms and modals |
| `frontend/style.css` | Controls the layout, responsive design, colours and component styling |
| `frontend/script.js` | Loads the application after the HTML document is ready |
| `frontend/js/app.js` | Starts the application and connects buttons, forms, login and navigation |
| `frontend/js/actions.js` | Handles product forms, sales, restocking, data loading and CSV exports |
| `frontend/js/api.js` | Sends requests to the API Gateway endpoints |
| `frontend/js/config.js` | Contains application configuration and temporary runtime state |
| `frontend/js/inventory.js` | Calculates stock status, sales totals and demand forecasts |
| `frontend/js/render.js` | Renders dashboard pages, tables, charts, reports and demand insights |
| `frontend/js/ui.js` | Controls modals, messages, navigation, loading states and prototype roles |
| `frontend/js/utils.js` | Contains reusable formatting, validation, HTML and CSV helpers |

Persistent business information is loaded from AWS. The application no longer uses browser local storage for products, sales, activities or reorder levels.

## Backend Structure

| File | Responsibility |
| --- | --- |
| `inventory-handler.ts` | Creates, reads, updates and deletes products |
| `sales-handler.ts` | Records sales, reduces stock and sends low-stock alerts |
| `activity-handler.ts` | Stores and retrieves shared audit-history records |
| `alerts-handler.ts` | Retrieves stored low-stock alerts |
| `inventory-status-handler.ts` | Returns stock and low-stock information |
| `telemetry-handler.ts` | Records and retrieves application monitoring data |
| `lib/cdk-stack.ts` | Defines all AWS resources, permissions, API routes and deployment settings |

## How Sales Work

When a user records a sale:

1. The frontend validates the product and quantity.
2. `POST /sales` sends the request to API Gateway.
3. `sales-handler.ts` loads the product from DynamoDB.
4. The request is rejected if there is insufficient stock.
5. A DynamoDB transaction reduces the stock and records the sale together.
6. If the remaining stock is at or below the reorder level, an alert is stored and an SNS email is sent.
7. The frontend reloads the shared products, sales and activity data.

Using a DynamoDB transaction prevents a sale record from being stored without its matching stock update.

## Demand Insight Calculation

The current demand forecast is rule-based; it is not a machine-learning model. For each product, it:

1. Totals the units sold during the previous 14 days.
2. Calculates average daily sales:

   ```text
   average daily sales = units sold during 14 days / 14
   ```

3. Estimates the number of days the current stock will last.
4. Calculates a target stock level using recent demand, a 15% safety buffer and the product's reorder level.
5. Suggests the quantity required to reach that target.
6. Ranks products so the most urgent restock requirement appears first.

Because products and sales are loaded from DynamoDB, deployed devices should calculate the same forecast after refreshing the same application version.

## Reports

The Reports page summarises:

- Number of products
- Total units currently in stock
- Products requiring attention
- Estimated inventory value
- Product availability
- Recorded sales revenue

Users can download:

- Inventory status as CSV
- Recorded sales history as CSV
- A print-friendly demand insight summary

CSV files are generated by the browser from the current AWS data. They are not currently stored in S3.

## API Reference

The configured API base URL is:

```text
https://mrfuj9l955.execute-api.ap-southeast-2.amazonaws.com/prod
```

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/products` | Retrieve all products |
| `POST` | `/products` | Create a product |
| `GET` | `/products/{productId}` | Retrieve one product |
| `PUT` | `/products/{productId}` | Update a product or apply a restock |
| `DELETE` | `/products/{productId}` | Delete a product |
| `GET` | `/sales` | Retrieve shared sales history |
| `POST` | `/sales` | Record a sale and reduce stock |
| `GET` | `/activities` | Retrieve recent shared audit history |
| `POST` | `/activities` | Store an audit entry |
| `GET` | `/inventory` | Retrieve stock status for all products |
| `GET` | `/alerts` | Retrieve low-stock alert history |
| `GET` | `/telemetry` | Retrieve a CloudWatch monitoring summary |
| `POST` | `/telemetry` | Record a frontend monitoring event |
| `GET` | `/telemetry/events` | Retrieve recent monitoring events |

### Example Product

```json
{
  "productId": "P001",
  "name": "Chicken Ramen Premium",
  "category": "Pantry",
  "price": 18.5,
  "stock": 20,
  "reorderThreshold": 10
}
```

### Example Sale

```json
{
  "productId": "P001",
  "quantitySold": 3
}
```

## Installation and Local Frontend Testing

Clone the repository and switch to the required branch:

```bash
git clone https://github.com/samipkafle/cloud-retail-inventory-system.git
cd cloud-retail-inventory-system
git switch virasanh
```

Serve the project through a local web server because the frontend uses JavaScript modules. For example, with the VS Code Live Server extension, open `frontend/index.html` using **Open with Live Server**.

The local frontend still communicates with the deployed AWS API configured in `frontend/js/config.js`. Opening the file locally does not create a separate local database or Lambda backend.

## CDK Validation and Deployment

From the project root:

```bash
cd infrastructure/cdk
npm install
npm run build
npm run cdk -- synth
```

Deploy only from an AWS account and region configured for this project:

```bash
npm run cdk -- deploy
```

The deployment updates the Lambda functions, API Gateway configuration, DynamoDB tables and S3-hosted frontend defined by the CDK stack. Team members should review and merge changes before deployment so one deployment does not accidentally replace another member's work.

## Testing

Current testing includes:

- Browser testing of the responsive frontend
- API and integration testing against the deployed AWS services
- Product CRUD validation
- Sale and insufficient-stock validation
- Cross-device sales and activity-history checks
- Reorder-level and demand-forecast checks
- SNS low-stock email testing
- TypeScript compilation and CDK synthesis

Backend tests can be run from `infrastructure/cdk`:

```bash
npm test
```

## Project Status

### Completed

- [x] Responsive dashboard frontend
- [x] Product CRUD operations
- [x] Shared product and reorder-level storage
- [x] Shared sales history with automatic stock reduction
- [x] Shared activity and audit history
- [x] Low-stock detection, alert storage and SNS email notifications
- [x] Fourteen-day rule-based demand insights
- [x] Dashboard charts and report summaries
- [x] Inventory and sales CSV exports
- [x] CloudWatch logging and frontend monitoring endpoints
- [x] AWS CDK infrastructure and S3 frontend deployment
- [x] Removal of browser local storage for business records

### In Progress

- [ ] Replace the prototype login with real Amazon Cognito sign-in
- [ ] Enable the Cognito authorizer on API Gateway routes
- [ ] Re-enable backend manager-group permission checks
- [ ] Add manager-controlled staff account creation
- [ ] Complete final integration and user acceptance testing

### Possible Future Improvements

- [ ] Host the frontend through HTTPS using CloudFront or another secure host
- [ ] Replace the rule-based demand calculation with a tested machine-learning model
- [ ] Add automated deployment through a CI/CD pipeline
- [ ] Store generated report files in Amazon S3

## Documentation

- [`docs/architecture.md`](docs/architecture.md) – AWS architecture and data flow
- [`docs/requirements.md`](docs/requirements.md) – functional and non-functional requirements
- [`docs/testing.md`](docs/testing.md) – testing approach and evidence
- [`frontend/README.md`](frontend/README.md) – frontend-specific instructions

## Team Project

This system is developed as a group project for the **Advanced Project Management** unit. Source code, infrastructure definitions and project documentation are maintained in GitHub.

---

**Project:** Cloud-Based Retail Inventory and Sales Monitoring System

**Application name:** GreenLeaf Inventory

**Architecture:** AWS Serverless
