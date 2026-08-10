import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'RetailInventory';

export const handler = async (event: any) => {
  try {
    const product = {
      productId: event.productId,
      productName: event.productName,
      quantity: event.quantity,
      price: event.price,
    };

    await dynamodb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: product,
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Product added successfully',
        product,
      }),
    };
  } catch (error) {
    console.error(error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to add product',
      }),
    };
  }
};
