import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { randomUUID } from 'crypto';

const client = new DynamoDBClient({});
const snsClient = new SNSClient({});

const productsTableName = process.env.PRODUCTS_TABLE_NAME!;
const salesTableName = process.env.SALES_TABLE_NAME!;
const alertsTableName = process.env.ALERTS_TABLE_NAME!;
const lowStockTopicArn = process.env.LOW_STOCK_TOPIC_ARN!;

// POST /sales
export const handler = async (event: any) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Method not allowed',
        }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { productId, quantitySold } = body;

    if (!productId || !(Number(quantitySold) > 0)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'productId and a positive quantitySold are required',
        }),
      };
    }

    const productResult = await client.send(
      new GetItemCommand({
        TableName: productsTableName,
        Key: {
          productId: { S: productId },
        },
      })
    );

    if (!productResult.Item) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Product not found',
        }),
      };
    }

    const reorderThreshold = productResult.Item.reorderThreshold?.N
      ? Number(productResult.Item.reorderThreshold.N)
      : 0;

    // Decrement stock conditioned on there being enough on hand, so a
    // concurrent sale can't push stock negative between the read above and
    // this write.
    let updatedStock: number;
    try {
      const updateResult = await client.send(
        new UpdateItemCommand({
          TableName: productsTableName,
          Key: {
            productId: { S: productId },
          },
          UpdateExpression: 'SET stock = stock - :qty',
          ConditionExpression: 'stock >= :qty',
          ExpressionAttributeValues: {
            ':qty': { N: String(quantitySold) },
          },
          ReturnValues: 'ALL_NEW',
        })
      );

      updatedStock = updateResult.Attributes?.stock?.N
        ? Number(updateResult.Attributes.stock.N)
        : 0;
    } catch (err: any) {
      if (err.name === 'ConditionalCheckFailedException') {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: 'Sale rejected: quantitySold exceeds available stock',
          }),
        };
      }
      throw err;
    }

    const saleId = randomUUID();
    const soldAt = new Date().toISOString();

    await client.send(
      new PutItemCommand({
        TableName: salesTableName,
        Item: {
          saleId: { S: saleId },
          productId: { S: productId },
          quantitySold: { N: String(quantitySold) },
          soldAt: { S: soldAt },
        },
      })
    );

    let alertRaised = false;

    if (updatedStock <= reorderThreshold) {
      alertRaised = true;

      await client.send(
        new PutItemCommand({
          TableName: alertsTableName,
          Item: {
            alertId: { S: randomUUID() },
            productId: { S: productId },
            stockAtAlert: { N: String(updatedStock) },
            reorderThreshold: { N: String(reorderThreshold) },
            raisedAt: { S: soldAt },
          },
        })
      );

      // Notification is best-effort: the sale and alert history are already
      // committed, so a failure here shouldn't fail the whole request.
      try {
        await snsClient.send(
          new PublishCommand({
            TopicArn: lowStockTopicArn,
            Subject: `Low stock alert: ${productId}`,
            Message: `Product ${productId} is low on stock.\n\nStock remaining: ${updatedStock}\nReorder threshold: ${reorderThreshold}\nAlert raised at: ${soldAt}`,
          })
        );
      } catch (snsError) {
        console.error('Failed to publish low-stock notification:', snsError);
      }
    }

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Sale recorded successfully',
        sale: {
          saleId,
          productId,
          quantitySold,
          soldAt,
        },
        remainingStock: updatedStock,
        alertRaised,
      }),
    };
  } catch (error) {
    console.error('Error:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Internal server error',
      }),
    };
  }
};
