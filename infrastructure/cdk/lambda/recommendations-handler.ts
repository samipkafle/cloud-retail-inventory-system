import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});

const tableName = process.env.RECOMMENDATIONS_TABLE_NAME!;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

// GET /recommendations — reads what lambda-python/recommendation-engine's
// daily training run last wrote (FR-10). Ranked by predicted demand so the
// highest-opportunity products surface first; each item carries its own
// `basis` string so the UI can show why a number was suggested rather than
// presenting it as an unexplained directive.
export const handler = async (event: any) => {
  try {
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Method not allowed' }),
      };
    }

    const result = await client.send(new ScanCommand({ TableName: tableName }));

    const recommendations = (result.Items || [])
      .map((item) => ({
        productId: item.productId?.S || '',
        predictedDemand: item.predictedDemand?.N ? Number(item.predictedDemand.N) : 0,
        trendLabel: item.trendLabel?.S || 'Insufficient data',
        modelVersion: item.modelVersion?.S || '',
        generatedAt: item.generatedAt?.S || '',
        basis: item.basis?.S || '',
        daysOfHistory: item.daysOfHistory?.N ? Number(item.daysOfHistory.N) : 0,
        rSquared: item.rSquared?.N ? Number(item.rSquared.N) : null,
      }))
      .sort((a, b) => b.predictedDemand - a.predictedDemand);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(recommendations),
    };
  } catch (error) {
    console.error('Error:', error);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
