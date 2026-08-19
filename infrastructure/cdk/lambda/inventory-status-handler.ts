import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});

const tableName = process.env.PRODUCTS_TABLE_NAME!;

// GET /inventory
export const handler = async (event: any) => {
  try {
    if (event.httpMethod !== 'GET') {
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

    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
      })
    );

    const products = (result.Items || []).map((item) => {
      const stock = item.stock?.N ? Number(item.stock.N) : 0;
      const reorderThreshold = item.reorderThreshold?.N
        ? Number(item.reorderThreshold.N)
        : 0;

      return {
        productId: item.productId?.S,
        name: item.name?.S,
        stock,
        reorderThreshold,
        status: stock <= reorderThreshold ? 'LOW' : 'OK',
      };
    });

    const belowThresholdCount = products.filter(
      (product) => product.status === 'LOW'
    ).length;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        products,
        belowThresholdCount,
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
