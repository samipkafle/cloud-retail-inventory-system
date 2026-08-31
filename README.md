# Cloud-Based Retail Inventory and Sales Monitoring System Using AWS Serverless Architecture

## Project Overview

This project focuses on developing a cloud-based retail inventory and sales monitoring system using AWS serverless technologies. The system helps retail businesses manage products, monitor inventory levels, record sales transactions, and receive automated stock alerts.

The project demonstrates cloud engineering practices using AWS serverless services, Infrastructure-as-Code (IaC), API development, database management, monitoring, automation, testing, and software development processes.

## Project Objectives

* Develop a scalable cloud-based retail management system.
* Implement product and inventory management features.
* Record and analyse daily sales transactions.
* Provide automated low-stock notifications.
* Apply AWS serverless architecture and DevOps practices.
* Implement software testing and quality assurance processes.
* Maintain project documentation using GitHub.

## Key Features

### Implemented

* User authentication (Amazon Cognito) with role-based access — a `manager` group is required to create, update or delete products; staff can record sales and view inventory/alerts (currently disabled at the API Gateway layer for testing; see [Authentication](#authentication))
* Product creation, retrieval, update and deletion (full CRUD)
* Record and list daily sales, with inventory automatically updated on each valid sale
* Reject sales that would exceed available stock
* Current stock and low-stock status for every product (`GET /inventory`)
* Automated low-stock alert history, stored and retrievable via the API
* Automated low-stock email notifications via Amazon SNS
* Shared activity/audit log across the app (`/activities`)
* Frontend health/error telemetry, recorded as CloudWatch custom metrics and queryable via the API, with a CloudWatch alarm on repeated frontend errors
* Web frontend (HTML/CSS/vanilla JS) covering login, dashboard, product, sales and alert workflows, deployed to an S3 static website bucket by CDK
* REST API using API Gateway
* Serverless backend using AWS Lambda
* Inventory, sales, alert and activity data storage using DynamoDB
* Infrastructure deployment using AWS CDK
* CloudWatch logging

### Planned

* Restore the Cognito authorizer on all API routes ahead of demo/submission
* Sales reporting and CSV export to S3
* Smart restocking forecast based on 14-day sales velocity
* AI-powered demand recommendation engine (Python/scikit-learn)
* Dashboard charts for sales, category share and product trends

## System Architecture

The current system uses the following serverless architecture:

```text
Web Frontend (S3) / Postman
      ↓
API Gateway
      ↓
AWS Lambda
      ↓
DynamoDB
      ↓
CloudWatch Logs
```

Low-stock alerts branch out from the sales flow above:

```text
Lambda (on low-stock sale)
      ↓
DynamoDB (alert history)
      ↓
SNS
      ↓
Email Notification
```

## AWS Services Used

| AWS Service | Purpose                                       |
| ----------- | --------------------------------------------- |
| AWS Lambda  | Backend processing and business logic         |
| API Gateway | REST API management                           |
| DynamoDB    | Store product, inventory, sales, alert and activity data |
| Amazon Cognito | User authentication and role-based access  |
| Amazon S3   | Static frontend website hosting               |
| IAM         | Access control and security                   |
| CloudWatch  | Monitoring, logging, custom metrics and alarms |
| SNS         | Low-stock and frontend-error email notifications |
| AWS CDK     | Infrastructure-as-Code deployment             |

## Technologies

* TypeScript / Node.js (backend Lambda functions and CDK)
* HTML / CSS / JavaScript (frontend)
* Python (planned, for the demand recommendation engine)
* AWS Cloud Services
* AWS CDK
* DynamoDB
* REST API
* GitHub
* Visual Studio Code
* Postman

## API Reference

The current API supports the following operations:

| Method | Endpoint                | Purpose                              |
| ------ | ------------------------ | ------------------------------------ |
| POST   | `/products`              | Create a product                     |
| GET    | `/products`              | Retrieve all products                |
| GET    | `/products/{productId}`  | Retrieve a single product            |
| PUT    | `/products/{productId}`  | Update a product                     |
| DELETE | `/products/{productId}`  | Delete a product                     |
| POST   | `/sales`                 | Record a sale (updates stock, rejects oversell, raises alert if low) |
| GET    | `/sales`                 | Retrieve sales history               |
| GET    | `/inventory`             | Retrieve current stock and low-stock status for every product |
| GET    | `/alerts`                | Retrieve low-stock alert history     |
| GET    | `/activities`            | Retrieve the shared activity/audit log |
| POST   | `/activities`            | Record an activity/audit log entry   |
| POST   | `/telemetry`             | Record a frontend health/error event as a CloudWatch metric |
| GET    | `/telemetry`             | Retrieve an aggregated telemetry summary (`?minutes=60`) |
| GET    | `/telemetry/events`      | Retrieve recent raw telemetry events (`?limit=50`) |

### Example Product

```json
{
  "productId": "P001",
  "name": "Chicken Ramen",
  "price": 15.5,
  "stock": 20,
  "reorderThreshold": 5
}
```

### Example Sale

```json
{
  "productId": "P001",
  "quantitySold": 3
}
```

### API Base URL

```text
https://mrfuj9l955.execute-api.ap-southeast-2.amazonaws.com/prod
```

### Authentication

The design requires a valid Cognito ID token in the `Authorization` header on every endpoint. Accounts are provisioned by an admin/manager (no public self-signup). Members of the `manager` Cognito group can create, update and delete products; authenticated users outside that group (staff) can record sales and view inventory/alerts but cannot manage the product catalogue.

> **Note:** the Cognito authorizer is currently disabled on the API Gateway routes (`AuthorizationType.NONE`) to simplify manual testing while the frontend is being built out. The user pool, client and `manager` group are already provisioned by CDK — re-enabling the authorizer is a small config change in `cdk-stack.ts` and is planned before demo/submission.

## Infrastructure

AWS infrastructure is deployed using AWS CDK.

Current infrastructure includes:

* Cognito User Pool with a `manager` group for authentication and role-based access (provisioned, see [Authentication](#authentication) for current API Gateway status)
* DynamoDB tables (products/inventory, sales, alerts, activities), with a GSI on the sales table for chronological per-product queries
* Lambda functions (products/inventory CRUD, sales, alerts, activities, inventory status, telemetry)
* API Gateway REST API
* SNS topic with email subscription for low-stock and frontend-error notifications
* CloudWatch alarm on repeated frontend errors, fed by the telemetry Lambda's custom metrics
* S3 bucket hosting the static frontend as a public website, deployed automatically from `frontend/` by CDK
* IAM roles and permissions
* CloudWatch logging

Infrastructure is defined as code and can be deployed using:

```bash
cdk synth
cdk deploy
```

## Development Process

The project follows Agile software development practices:

1. Requirement analysis
2. System design
3. Infrastructure setup
4. Backend development
5. API development
6. Testing
7. Monitoring implementation
8. Deployment
9. Documentation

## Testing Approach

The system will include:

* Unit testing
* API testing
* Integration testing
* System testing
* User Acceptance Testing (UAT)

Postman is currently being used to test the REST API endpoints.

## Project Documentation

Documentation includes:

* [System requirements and implementation status](docs/requirements.md)
* System architecture
* API documentation
* Deployment guide
* Test reports
* User manual
* Operational runbook

## Project Status

**Current Phase: Backend and Frontend Development, API Testing**

### Completed

* [x] GitHub repository setup
* [x] AWS account configuration
* [x] AWS CLI setup
* [x] AWS CDK setup
* [x] DynamoDB database (products, sales, alerts, activities)
* [x] AWS Lambda backend
* [x] API Gateway
* [x] Cognito user pool, client and `manager` group provisioned
* [x] Product CRUD API
* [x] Sales recording and history API with automatic inventory update
* [x] Inventory/stock overview endpoint with low-stock status
* [x] Low-stock alert history API
* [x] Activity/audit log API
* [x] SNS email notifications for low-stock alerts
* [x] Frontend telemetry API and CloudWatch error alarm
* [x] Web frontend (login, dashboard, products, sales, alerts) deployed to S3
* [x] API testing using Postman
* [x] CloudWatch Lambda logging
* [x] CDK deployment

### In Progress

* [ ] Re-enable the Cognito authorizer on all API Gateway routes
* [ ] CloudWatch dashboard
* [ ] Sales reporting and CSV export

### Planned

* [ ] Smart restocking forecast (14-day sales velocity)
* [ ] AI demand recommendation engine
* [ ] Reporting and insights dashboard
* [ ] Automated testing
* [ ] User Acceptance Testing
* [ ] Final documentation

## Team Project

This project is developed as a group project as part of the **Advanced Project Management** unit.

## Repository

The source code and project documentation are maintained using GitHub.

---

**Project:** Cloud-Based Retail Inventory and Sales Monitoring System
**Architecture:** AWS Serverless
**Development Approach:** Agile
**Current Stage:** Backend and Frontend Development, API Testing
