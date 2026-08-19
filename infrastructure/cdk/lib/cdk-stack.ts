import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

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
      },
    });

    // Sales Lambda needs to read/decrement product stock, write sales, and
    // write alerts when a sale pushes stock at or below the reorder threshold
    inventoryTable.grantReadWriteData(salesLambda);
    salesTable.grantWriteData(salesLambda);
    alertsTable.grantWriteData(salesLambda);

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

    // API URL output
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'Inventory API URL',
    });
  }
}