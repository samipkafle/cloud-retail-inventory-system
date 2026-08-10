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

* Product creation
* Retrieve all products
* Retrieve individual products
* Update product information
* Delete products
* Inventory data storage using DynamoDB
* REST API using API Gateway
* Serverless backend using AWS Lambda
* Infrastructure deployment using AWS CDK
* CloudWatch logging

### Planned

* Daily sales recording
* Sales monitoring and reporting
* Automated low-stock detection
* SNS stock notifications
* CloudWatch monitoring dashboard
* Application performance monitoring
* User interface

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

Planned monitoring and notification components:

```text
DynamoDB / Lambda
      ↓
CloudWatch
      ↓
Low Stock Detection
      ↓
SNS
      ↓
Notification
```

## AWS Services Used

| AWS Service | Purpose                                       |
| ----------- | --------------------------------------------- |
| AWS Lambda  | Backend processing and business logic         |
| API Gateway | REST API management                           |
| DynamoDB    | Store product, inventory, and sales data      |
| Amazon S3   | Store application files and deployment assets |
| IAM         | Access control and security                   |
| CloudWatch  | Monitoring, logging, and alarms               |
| SNS         | Low-stock notifications                       |
| AWS CDK     | Infrastructure-as-Code deployment             |

## Technologies

* TypeScript
* Node.js
* AWS Cloud Services
* AWS CDK
* DynamoDB
* REST API
* GitHub
* Visual Studio Code
* Postman

## Product API

The current API supports the following operations:

| Method | Endpoint                | Purpose                   |
| ------ | ----------------------- | ------------------------- |
| POST   | `/products`             | Create a product          |
| GET    | `/products`             | Retrieve all products     |
| GET    | `/products/{productId}` | Retrieve a single product |
| PUT    | `/products/{productId}` | Update a product          |
| DELETE | `/products/{productId}` | Delete a product          |

### Example Product

```json
{
  "productId": "P001",
  "name": "Chicken Ramen",
  "price": 15.5,
  "stock": 20
}
```

### API Base URL

```text
https://mrfuj9l955.execute-api.ap-southeast-2.amazonaws.com/prod
```

## Infrastructure

AWS infrastructure is deployed using AWS CDK.

Current infrastructure includes:

* DynamoDB table
* Lambda function
* API Gateway REST API
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

Documentation will include:

* System architecture
* Requirements specification
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
* [x] DynamoDB database
* [x] AWS Lambda backend
* [x] API Gateway
* [x] Product CRUD API
* [x] API testing using Postman
* [x] CloudWatch Lambda logging
* [x] CDK deployment

### In Progress

* [ ] Product database improvements
* [ ] Low-stock detection
* [ ] SNS notifications
* [ ] CloudWatch dashboard
* [ ] Sales monitoring

### Planned

* [ ] Sales transaction API
* [ ] Reporting
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
