import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const inventoryTable = new dynamodb.Table(this, 'InventoryTable', {
      tableName: 'RetailInventory',
      partitionKey: {
        name: 'productId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const inventoryLambda = new lambdaNodejs.NodejsFunction(
      this,
      'InventoryLambda',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: 'inventory-handler.ts',
        handler: 'handler',
        environment: {
          TABLE_NAME: inventoryTable.tableName,
        },
      }
    );

    inventoryTable.grantReadWriteData(inventoryLambda);
  }
}
