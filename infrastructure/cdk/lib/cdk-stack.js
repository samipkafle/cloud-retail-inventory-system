"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CdkStack = void 0;
const cdk = require("aws-cdk-lib");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const lambda = require("aws-cdk-lib/aws-lambda");
const lambdaNodejs = require("aws-cdk-lib/aws-lambda-nodejs");
class CdkStack extends cdk.Stack {
    constructor(scope, id, props) {
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
        // Lambda function
        const inventoryLambda = new lambdaNodejs.NodejsFunction(this, 'InventoryLambda', {
            runtime: lambda.Runtime.NODEJS_24_X,
            entry: 'lambda/inventory-handler.ts',
            handler: 'handler',
            bundling: {
                forceDockerBundling: false,
            },
            environment: {
                TABLE_NAME: inventoryTable.tableName,
            },
        });
        // Give Lambda permission to read and write to DynamoDB
        inventoryTable.grantReadWriteData(inventoryLambda);
    }
}
exports.CdkStack = CdkStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyxxREFBcUQ7QUFDckQsaURBQWlEO0FBQ2pELDhEQUE4RDtBQUU5RCxNQUFhLFFBQVMsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNyQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDJCQUEyQjtRQUMzQixNQUFNLGNBQWMsR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ2hFLFNBQVMsRUFBRSxpQkFBaUI7WUFFNUIsWUFBWSxFQUFFO2dCQUNaLElBQUksRUFBRSxXQUFXO2dCQUNqQixJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNO2FBQ3BDO1lBRUQsV0FBVyxFQUFFLFFBQVEsQ0FBQyxXQUFXLENBQUMsZUFBZTtZQUVqRCxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1NBQ3pDLENBQUMsQ0FBQztRQUVILGtCQUFrQjtRQUNsQixNQUFNLGVBQWUsR0FBRyxJQUFJLFlBQVksQ0FBQyxjQUFjLENBQ3JELElBQUksRUFDSixpQkFBaUIsRUFDakI7WUFDRSxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBRW5DLEtBQUssRUFBRSw2QkFBNkI7WUFFcEMsT0FBTyxFQUFFLFNBQVM7WUFFbEIsUUFBUSxFQUFFO2dCQUNSLG1CQUFtQixFQUFFLEtBQUs7YUFDM0I7WUFFRCxXQUFXLEVBQUU7Z0JBQ1gsVUFBVSxFQUFFLGNBQWMsQ0FBQyxTQUFTO2FBQ3JDO1NBQ0YsQ0FDRixDQUFDO1FBRUYsdURBQXVEO1FBQ3ZELGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUNyRCxDQUFDO0NBQ0Y7QUExQ0QsNEJBMENDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGxhbWJkYU5vZGVqcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLW5vZGVqcyc7XG5cbmV4cG9ydCBjbGFzcyBDZGtTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIER5bmFtb0RCIEludmVudG9yeSBUYWJsZVxuICAgIGNvbnN0IGludmVudG9yeVRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdJbnZlbnRvcnlUYWJsZScsIHtcbiAgICAgIHRhYmxlTmFtZTogJ1JldGFpbEludmVudG9yeScsXG5cbiAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICBuYW1lOiAncHJvZHVjdElkJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uXG4gICAgY29uc3QgaW52ZW50b3J5TGFtYmRhID0gbmV3IGxhbWJkYU5vZGVqcy5Ob2RlanNGdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnSW52ZW50b3J5TGFtYmRhJyxcbiAgICAgIHtcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzI0X1gsXG5cbiAgICAgICAgZW50cnk6ICdsYW1iZGEvaW52ZW50b3J5LWhhbmRsZXIudHMnLFxuXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcblxuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgICB9LFxuXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgVEFCTEVfTkFNRTogaW52ZW50b3J5VGFibGUudGFibGVOYW1lLFxuICAgICAgICB9LFxuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBHaXZlIExhbWJkYSBwZXJtaXNzaW9uIHRvIHJlYWQgYW5kIHdyaXRlIHRvIER5bmFtb0RCXG4gICAgaW52ZW50b3J5VGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGludmVudG9yeUxhbWJkYSk7XG4gIH1cbn0iXX0=