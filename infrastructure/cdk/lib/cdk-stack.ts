import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Inventory Table
    const inventoryTable = new dynamodb.Table(this, 'InventoryTable', {
      tableName: 'RetailInventory',

      partitionKey: {
        name: 'productId',
        type: dynamodb.AttributeType.STRING,
      },

      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,

      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // DynamoDB Sales Table
    const salesTable = new dynamodb.Table(this, 'SalesTable', {
      tableName: 'RetailSales',

      partitionKey: {
        name: 'saleId',
        type: dynamodb.AttributeType.STRING,
      },

      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,

      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // GSI to list a product's sales in chronological order (14-day sales
    // velocity forecast and recommendation engine both need this)
    salesTable.addGlobalSecondaryIndex({
      indexName: 'productId-soldAt-index',
      partitionKey: {
        name: 'productId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'soldAt',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // DynamoDB Alerts Table
    const alertsTable = new dynamodb.Table(this, 'AlertsTable', {
      tableName: 'RetailAlerts',

      partitionKey: {
        name: 'alertId',
        type: dynamodb.AttributeType.STRING,
      },

      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,

      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // DynamoDB Activity Table stores the shared audit history.
    const activitiesTable = new dynamodb.Table(this, 'ActivitiesTable', {
      tableName: 'RetailActivities',

      partitionKey: {
        name: 'activityId',
        type: dynamodb.AttributeType.STRING,
      },

      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,

      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // SNS Topic for low-stock notifications
    const lowStockTopic = new sns.Topic(this, 'LowStockTopic', {
      topicName: 'RetailLowStockAlerts',
    });

    lowStockTopic.addSubscription(
      new subscriptions.EmailSubscription('advancedproject6150@gmail.com')
    );

    // Cognito User Pool for authentication (FR-01). Sign-up is admin-only
    // (staff accounts are provisioned by a manager/admin, not self-service),
    // matching a retail-staff app rather than a public consumer app.
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'RetailUserPool',
      selfSignUpEnabled: false,
      signInAliases: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: false,
        },
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      generateSecret: false,
      authFlows: {
        // userSrp is required by the frontend's amazon-cognito-identity-js
        // CognitoUser.authenticateUser(), which defaults to the SRP flow.
        userSrp: true,
        userPassword: true,
        adminUserPassword: true,
      },
      // Extended from the 1-hour default for easier manual testing/demoing;
      // revisit before this becomes a real production login flow.
      idTokenValidity: cdk.Duration.hours(24),
      accessTokenValidity: cdk.Duration.hours(24),
    });

    // Manager role group. Members can manage products; everyone else who
    // authenticates is treated as staff (record sales, view inventory/alerts
    // only) — matches the Manage products vs Record sale use cases.
    new cognito.CfnUserPoolGroup(this, 'ManagerGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'manager',
    });

    // Single switch for FR-01 enforcement. The frontend now signs in against
    // this User Pool and attaches the ID token to every API request
    // (frontend/js/auth.js, frontend/js/api.js) — flip back to false only if
    // testing without a real Cognito session.
    const AUTH_ENABLED = true;

    const apiAuthorizer = AUTH_ENABLED
      ? new apigateway.CognitoUserPoolsAuthorizer(this, 'ApiAuthorizer', {
          cognitoUserPools: [userPool],
        })
      : undefined;

    // Lambda Function
    const inventoryLambda = new lambdaNodejs.NodejsFunction(
      this,
      'InventoryLambda',
      {
        runtime: lambda.Runtime.NODEJS_24_X,

        entry: 'lambda/inventory-handler.ts',

        handler: 'handler',

        bundling: {
          forceDockerBundling: false,
        },

        environment: {
          TABLE_NAME: inventoryTable.tableName,
          AUTH_ENABLED: String(AUTH_ENABLED),
        },
      }
    );

    // Give Lambda permission to read and write DynamoDB
    inventoryTable.grantReadWriteData(inventoryLambda);

    // Sales Lambda Function
    const salesLambda = new lambdaNodejs.NodejsFunction(this, 'SalesLambda', {
      runtime: lambda.Runtime.NODEJS_24_X,

      entry: 'lambda/sales-handler.ts',

      handler: 'handler',

      bundling: {
        forceDockerBundling: false,
      },

      environment: {
        PRODUCTS_TABLE_NAME: inventoryTable.tableName,
        SALES_TABLE_NAME: salesTable.tableName,
        ALERTS_TABLE_NAME: alertsTable.tableName,
        LOW_STOCK_TOPIC_ARN: lowStockTopic.topicArn,
      },
    });

    // Sales Lambda needs to read/decrement product stock, write sales, and
    // write alerts when a sale pushes stock at or below the reorder threshold
    inventoryTable.grantReadWriteData(salesLambda);
    salesTable.grantReadWriteData(salesLambda);
    alertsTable.grantWriteData(salesLambda);
    lowStockTopic.grantPublish(salesLambda);

    // DynamoDB table grants do not include transaction APIs, so allow this
    // Lambda to atomically update inventory and insert the matching sale.
    salesLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:TransactWriteItems'],
        resources: [inventoryTable.tableArn, salesTable.tableArn],
      })
    );

    // Alerts Lambda Function
    const alertsLambda = new lambdaNodejs.NodejsFunction(this, 'AlertsLambda', {
      runtime: lambda.Runtime.NODEJS_24_X,

      entry: 'lambda/alerts-handler.ts',

      handler: 'handler',

      bundling: {
        forceDockerBundling: false,
      },

      environment: {
        ALERTS_TABLE_NAME: alertsTable.tableName,
      },
    });

    alertsTable.grantReadData(alertsLambda);

    // Activity Lambda Function
    const activityLambda = new lambdaNodejs.NodejsFunction(
      this,
      'ActivityLambda',
      {
        runtime: lambda.Runtime.NODEJS_24_X,

        entry: 'lambda/activity-handler.ts',

        handler: 'handler',

        bundling: {
          forceDockerBundling: false,
        },

        environment: {
          ACTIVITIES_TABLE_NAME: activitiesTable.tableName,
        },
      }
    );

    activitiesTable.grantReadWriteData(activityLambda);

    // Inventory Status Lambda Function
    const inventoryStatusLambda = new lambdaNodejs.NodejsFunction(
      this,
      'InventoryStatusLambda',
      {
        runtime: lambda.Runtime.NODEJS_24_X,

        entry: 'lambda/inventory-status-handler.ts',

        handler: 'handler',

        bundling: {
          forceDockerBundling: false,
        },

        environment: {
          PRODUCTS_TABLE_NAME: inventoryTable.tableName,
        },
      }
    );

    inventoryTable.grantReadData(inventoryStatusLambda);

    // Forecast Lambda Function — GET /forecast and GET /forecast/{productId}
    // (FR-09). Mirrors the 14-day sales-velocity calculation that already
    // runs client-side in frontend/js/inventory.js, as a shared/Lambda-
    // computed source of truth rather than each device computing its own.
    const forecastLambda = new lambdaNodejs.NodejsFunction(this, 'ForecastLambda', {
      runtime: lambda.Runtime.NODEJS_24_X,

      entry: 'lambda/forecast-handler.ts',

      handler: 'handler',

      bundling: {
        forceDockerBundling: false,
      },

      environment: {
        PRODUCTS_TABLE_NAME: inventoryTable.tableName,
        SALES_TABLE_NAME: salesTable.tableName,
        SALES_INDEX_NAME: 'productId-soldAt-index',
      },
    });

    inventoryTable.grantReadData(forecastLambda);
    salesTable.grantReadData(forecastLambda);

    // Private bucket for generated report files (FR-08). Not public like
    // FrontendBucket — reports are business data, served only via the
    // time-limited presigned URL that ReportsLambda hands back.
    const reportsBucket = new s3.Bucket(this, 'ReportsBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Reports Lambda Function — GET /reports?type=inventory|sales&from=&to=
    // (FR-08). Generates a CSV matching the frontend's client-side export
    // (frontend/js/actions.js exportInventory/exportSales) byte-for-byte,
    // but stores it in S3 and returns a presigned download URL, so a report
    // is a durable, shareable artifact rather than only a one-off browser
    // download.
    const reportsLambda = new lambdaNodejs.NodejsFunction(this, 'ReportsLambda', {
      runtime: lambda.Runtime.NODEJS_24_X,

      entry: 'lambda/reports-handler.ts',

      handler: 'handler',

      bundling: {
        forceDockerBundling: false,
      },

      environment: {
        PRODUCTS_TABLE_NAME: inventoryTable.tableName,
        SALES_TABLE_NAME: salesTable.tableName,
        REPORTS_BUCKET_NAME: reportsBucket.bucketName,
      },
    });

    inventoryTable.grantReadData(reportsLambda);
    salesTable.grantReadData(reportsLambda);
    reportsBucket.grantReadWrite(reportsLambda);

    // Telemetry Lambda Function — POST records frontend health/error events
    // as CloudWatch custom metrics (see js/api.js sendTelemetry); GET reads
    // them back as an aggregated summary (see js/api.js getTelemetrySummary)
    const telemetryLambda = new lambdaNodejs.NodejsFunction(
      this,
      'TelemetryLambda',
      {
        // Set explicitly (rather than left to CDK auto-naming) so the
        // logs:StartQuery policy below can reference this as a literal
        // string instead of telemetryLambda.functionName — a self-reference
        // via the function's own token creates a circular CFN dependency
        // between the function's role policy and the function itself, which
        // then drags in the whole API (Deployment/Stage depend on every
        // method, including this function's). See aws/aws-cdk#11020.
        functionName: 'GreenLeaf-TelemetryLambda',

        runtime: lambda.Runtime.NODEJS_24_X,

        entry: 'lambda/telemetry-handler.ts',

        handler: 'handler',

        // GET /telemetry/events polls a CloudWatch Logs Insights query to
        // completion synchronously, which usually takes a couple of seconds —
        // comfortably past the default 3s Lambda timeout.
        timeout: cdk.Duration.seconds(20),

        bundling: {
          forceDockerBundling: false,
        },

        environment: {
          METRIC_NAMESPACE: 'GreenLeaf/Frontend',
        },
      }
    );

    // PutMetricData/GetMetricData have no resource-level permissions — they
    // must be granted on "*", which is expected/required for CloudWatch.
    telemetryLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData', 'cloudwatch:GetMetricData'],
        resources: ['*'],
      })
    );

    // GET /telemetry/events runs a Logs Insights query against this
    // function's own log group (created implicitly by Lambda/CDK, so the
    // name is predicted rather than referenced as a construct).
    telemetryLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['logs:StartQuery', 'logs:GetQueryResults'],
        resources: [
          `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/GreenLeaf-TelemetryLambda:*`,
        ],
      })
    );

    // Alarm when the frontend reports 3+ errors in a 5-minute window; reuses
    // the same SNS topic as low-stock alerts so both flow into one inbox.
    const frontendErrorAlarm = new cloudwatch.Alarm(this, 'FrontendErrorAlarm', {
      alarmName: 'GreenLeafFrontendErrors',
      metric: new cloudwatch.Metric({
        namespace: 'GreenLeaf/Frontend',
        metricName: 'FrontendErrorCount',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 3,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    frontendErrorAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(lowStockTopic)
    );

    // API Gateway
    const api = new apigateway.RestApi(this, 'InventoryApi', {
      restApiName: 'InventoryApi',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // API Gateway's own 401/403 responses (rejected/missing/expired Cognito
    // token) bypass Lambda entirely, so they don't carry the CORS headers
    // the Lambda handlers add themselves. Without these, a browser reports
    // a real 401/403 as a generic CORS/network failure instead of letting
    // the frontend read the response and show "please sign in again".
    api.addGatewayResponse('UnauthorizedResponse', {
      type: apigateway.ResponseType.UNAUTHORIZED,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
      },
    });

    api.addGatewayResponse('AccessDeniedResponse', {
      type: apigateway.ResponseType.ACCESS_DENIED,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
      },
    });

    // Every route requires a valid Cognito ID token once AUTH_ENABLED is
    // flipped on above (FR-01).
    const authOptions: apigateway.MethodOptions = AUTH_ENABLED
      ? {
          authorizer: apiAuthorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      : {
          authorizationType: apigateway.AuthorizationType.NONE,
        };

    // /products
    const products = api.root.addResource('products');

    // GET /products
    products.addMethod(
      'GET',
      new apigateway.LambdaIntegration(inventoryLambda),
      authOptions
    );

    // POST /products (role-checked in the handler: manager only)
    products.addMethod(
      'POST',
      new apigateway.LambdaIntegration(inventoryLambda),
      authOptions
    );

    // /products/{productId}
    const product = products.addResource('{productId}');

    // GET /products/{productId}
    product.addMethod(
      'GET',
      new apigateway.LambdaIntegration(inventoryLambda),
      authOptions
    );

    // PUT /products/{productId} (role-checked in the handler: manager only)
    product.addMethod(
      'PUT',
      new apigateway.LambdaIntegration(inventoryLambda),
      authOptions
    );

    // DELETE /products/{productId} (role-checked in the handler: manager only)
    product.addMethod(
      'DELETE',
      new apigateway.LambdaIntegration(inventoryLambda),
      authOptions
    );

    // /sales
    const sales = api.root.addResource('sales');

    // POST /sales
    sales.addMethod(
      'POST',
      new apigateway.LambdaIntegration(salesLambda),
      authOptions
    );

    // GET /sales
    sales.addMethod(
      'GET',
      new apigateway.LambdaIntegration(salesLambda),
      authOptions
    );

    // /alerts
    const alerts = api.root.addResource('alerts');

    // GET /alerts
    alerts.addMethod(
      'GET',
      new apigateway.LambdaIntegration(alertsLambda),
      authOptions
    );

    // /activities
    const activities = api.root.addResource('activities');

    // GET /activities
    activities.addMethod(
      'GET',
      new apigateway.LambdaIntegration(activityLambda),
      authOptions
    );

    // POST /activities
    activities.addMethod(
      'POST',
      new apigateway.LambdaIntegration(activityLambda),
      authOptions
    );

    // /inventory
    const inventory = api.root.addResource('inventory');

    // GET /inventory
    inventory.addMethod(
      'GET',
      new apigateway.LambdaIntegration(inventoryStatusLambda),
      authOptions
    );

    // /forecast
    const forecast = api.root.addResource('forecast');

    // GET /forecast — every product's restock forecast, most urgent first
    forecast.addMethod(
      'GET',
      new apigateway.LambdaIntegration(forecastLambda),
      authOptions
    );

    // /forecast/{productId}
    const forecastProduct = forecast.addResource('{productId}');

    // GET /forecast/{productId}
    forecastProduct.addMethod(
      'GET',
      new apigateway.LambdaIntegration(forecastLambda),
      authOptions
    );

    // /reports
    const reports = api.root.addResource('reports');

    // GET /reports?type=inventory|sales&from=&to=
    reports.addMethod(
      'GET',
      new apigateway.LambdaIntegration(reportsLambda),
      authOptions
    );

    // /telemetry
    const telemetry = api.root.addResource('telemetry');

    // POST /telemetry
    telemetry.addMethod(
      'POST',
      new apigateway.LambdaIntegration(telemetryLambda),
      authOptions
    );

    // GET /telemetry?minutes=60
    telemetry.addMethod(
      'GET',
      new apigateway.LambdaIntegration(telemetryLambda),
      authOptions
    );

    // /telemetry/events
    const telemetryEvents = telemetry.addResource('events');

    // GET /telemetry/events?limit=50
    telemetryEvents.addMethod(
      'GET',
      new apigateway.LambdaIntegration(telemetryLambda),
      authOptions
    );

    // S3 bucket hosting the static frontend (public read, website mode)
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      websiteIndexDocument: 'index.html',
      publicReadAccess: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new s3deploy.BucketDeployment(this, 'FrontendDeployment', {
      sources: [s3deploy.Source.asset('../../frontend')],
      destinationBucket: frontendBucket,
    });

    // API URL output
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'Inventory API URL',
    });

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: frontendBucket.bucketWebsiteUrl,
      description: 'Frontend website URL',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });
  }
}
