import {
  DynamoDBClient,
  PutItemCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});

const tableName = process.env.TABLE_NAME!;

export const handler = async (event: any) => {
  try {
    const method = event.httpMethod;

    // POST /products
    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}');

      if (!body.productId || !body.name || body.price === undefined) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: 'productId, name and price are required',
          }),
        };
      }

      await client.send(
        new PutItemCommand({
          TableName: tableName,
          Item: {
            productId: {
              S: body.productId,
            },
            name: {
              S: body.name,
            },
            price: {
              N: String(body.price),
            },
            stock: {
              N: String(body.stock || 0),
            },
          },
        })
      );

      return {
        statusCode: 201,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Product created successfully',
          product: body,
        }),
      };
    }

    // GET /products
    if (method === 'GET') {
      const result = await client.send(
        new ScanCommand({
          TableName: tableName,
        })
      );

      const products = (result.Items || []).map((item) => ({
        productId: item.productId?.S,
        name: item.name?.S,
        price: item.price?.N ? Number(item.price.N) : 0,
        stock: item.stock?.N ? Number(item.stock.N) : 0,
      }));

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(products),
      };
    }

    return {
      statusCode: 405,
      body: JSON.stringify({
        message: 'Method not allowed',
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