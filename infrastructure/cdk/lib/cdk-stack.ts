import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';

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
    });

    // /products
    const products = api.root.addResource('products');

    // GET /products
    products.addMethod(
      'GET',
      new apigateway.LambdaIntegration(inventoryLambda)
    );

    // POST /products
    products.addMethod(
      'POST',
      new apigateway.LambdaIntegration(inventoryLambda)
    );

    // /products/{productId}
    const product = products.addResource('{productId}');

    // GET /products/{productId}
    product.addMethod(
      'GET',
      new apigateway.LambdaIntegration(inventoryLambda)
    );

    // PUT /products/{productId}
    product.addMethod(
      'PUT',
      new apigateway.LambdaIntegration(inventoryLambda)
    );

    // DELETE /products/{productId}
    product.addMethod(
      'DELETE',
      new apigateway.LambdaIntegration(inventoryLambda)
    );

    // /sales
    const sales = api.root.addResource('sales');

    // POST /sales
    sales.addMethod('POST', new apigateway.LambdaIntegration(salesLambda));

    // /alerts
    const alerts = api.root.addResource('alerts');

    // GET /alerts
    alerts.addMethod('GET', new apigateway.LambdaIntegration(alertsLambda));

    // /inventory
    const inventory = api.root.addResource('inventory');

    // GET /inventory
    inventory.addMethod(
      'GET',
      new apigateway.LambdaIntegration(inventoryStatusLambda)
    );

    // API URL output
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'Inventory API URL',
    });
  }
}