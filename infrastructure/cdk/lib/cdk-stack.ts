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

    // TEMP: unused while auth is disabled below (CDK synth rejects an
    // authorizer that isn't attached to any method on the RestApi).
    // Restore alongside authOptions before demo/submission.
    // const apiAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(
    //   this,
    //   'ApiAuthorizer',
    //   {
    //     cognitoUserPools: [userPool],
    //   }
    // );

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
    salesTable.grantWriteData(salesLambda);
    alertsTable.grantWriteData(salesLambda);
    lowStockTopic.grantPublish(salesLambda);

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

    // API Gateway
    const api = new apigateway.RestApi(this, 'InventoryApi', {
      restApiName: 'InventoryApi',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type'],
      },
    });

    // Every route requires a valid Cognito ID token (FR-01)
    // TEMP: auth disabled for testing — restore COGNITO authorizer before demo/submission.
    const authOptions: apigateway.MethodOptions = {
      // authorizer: apiAuthorizer, // uncomment apiAuthorizer above too
      // authorizationType: apigateway.AuthorizationType.COGNITO,
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

    // /alerts
    const alerts = api.root.addResource('alerts');

    // GET /alerts
    alerts.addMethod(
      'GET',
      new apigateway.LambdaIntegration(alertsLambda),
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