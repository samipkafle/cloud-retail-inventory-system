import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});

const tableName = process.env.ALERTS_TABLE_NAME!;

// GET /alerts
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

    const alerts = (result.Items || [])
      .map((item) => ({
        alertId: item.alertId?.S,
        productId: item.productId?.S,
        stockAtAlert: item.stockAtAlert?.N
          ? Number(item.stockAtAlert.N)
          : 0,
        reorderThreshold: item.reorderThreshold?.N
          ? Number(item.reorderThreshold.N)
          : 0,
        raisedAt: item.raisedAt?.S,
      }))
      .sort((a, b) => (a.raisedAt! < b.raisedAt! ? 1 : -1));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(alerts),
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
