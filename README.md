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

* Product creation, retrieval, update and deletion (full CRUD)
* Record daily sales, with inventory automatically updated on each valid sale
* Reject sales that would exceed available stock
* Automated low-stock alert history, stored and retrievable via the API
* Automated low-stock email notifications via Amazon SNS
* REST API using API Gateway
* Serverless backend using AWS Lambda
* Inventory, sales and alert data storage using DynamoDB
* Infrastructure deployment using AWS CDK
* CloudWatch logging

### Planned

* User authentication and role-based access
* Inventory/stock overview endpoint (current stock and low-stock list)
* Sales reporting and CSV export to S3
* Smart restocking forecast based on 14-day sales velocity
* AI-powered demand recommendation engine (Python/scikit-learn)
* Dashboard charts for sales, category share and product trends
* React frontend user interface

## System Architecture

The current system uses the following serverless architecture:

```text
User / Postman
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
| DynamoDB    | Store product, inventory, sales and alert data |
| Amazon S3   | Store application files and deployment assets |
| IAM         | Access control and security                   |
| CloudWatch  | Monitoring, logging, and alarms               |
| SNS         | Low-stock email notifications                 |
| AWS CDK     | Infrastructure-as-Code deployment             |

## Technologies

* TypeScript / Node.js (current backend implementation)
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
| GET    | `/alerts`                | Retrieve low-stock alert history     |

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

## Infrastructure

AWS infrastructure is deployed using AWS CDK.

Current infrastructure includes:

* DynamoDB tables (products, sales, alerts)
* Lambda functions (products, sales, alerts)
* API Gateway REST API
* SNS topic with email subscription for low-stock notifications
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

**Current Phase: Backend Development and API Testing**

### Completed

* [x] GitHub repository setup
* [x] AWS account configuration
* [x] AWS CLI setup
* [x] AWS CDK setup
* [x] DynamoDB database (products, sales, alerts)
* [x] AWS Lambda backend
* [x] API Gateway
* [x] Product CRUD API
* [x] Sales recording API with automatic inventory update
* [x] Low-stock alert history API
* [x] SNS email notifications for low-stock alerts
* [x] API testing using Postman
* [x] CloudWatch Lambda logging
* [x] CDK deployment

### In Progress

* [ ] Inventory/stock overview endpoint
* [ ] CloudWatch dashboard
* [ ] Sales reporting and CSV export

### Planned

* [ ] Smart restocking forecast (14-day sales velocity)
* [ ] AI demand recommendation engine
* [ ] Reporting and insights dashboard
* [ ] Frontend/user interface
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
**Current Stage:** Backend Development and API Testing
