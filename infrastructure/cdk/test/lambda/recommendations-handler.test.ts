import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { handler } from '../../lambda/recommendations-handler';

const ddbMock = mockClient(DynamoDBClient);

beforeEach(() => {
  ddbMock.reset();
});

describe('GET /recommendations', () => {
  it('ranks recommendations by predicted demand, highest first', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          productId: { S: 'LOW_DEMAND' },
          predictedDemand: { N: '5' },
          trendLabel: { S: 'Stable' },
          modelVersion: { S: 'trend-linreg-v1' },
          generatedAt: { S: '2026-09-06T00:00:00.000Z' },
          basis: { S: 'Linear regression over 30 days of daily sales (R²=0.4)' },
          daysOfHistory: { N: '30' },
          rSquared: { N: '0.4' },
        },
        {
          productId: { S: 'HIGH_DEMAND' },
          predictedDemand: { N: '42' },
          trendLabel: { S: 'Increasing' },
          modelVersion: { S: 'trend-linreg-v1' },
          generatedAt: { S: '2026-09-06T00:00:00.000Z' },
          basis: { S: 'Linear regression over 60 days of daily sales (R²=0.8)' },
          daysOfHistory: { N: '60' },
          rSquared: { N: '0.8' },
        },
      ],
    });

    const response = await handler({ httpMethod: 'GET' });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.map((item: any) => item.productId)).toEqual(['HIGH_DEMAND', 'LOW_DEMAND']);
    expect(body[0].trendLabel).toBe('Increasing');
    expect(body[0].rSquared).toBe(0.8);
  });

  it('defaults an item with no trend/model fields to Insufficient data', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          productId: { S: 'NEW_PRODUCT' },
          predictedDemand: { N: '0' },
          modelVersion: { S: 'trend-linreg-v1' },
          generatedAt: { S: '2026-09-06T00:00:00.000Z' },
          basis: { S: 'Fewer than 7 days of recorded sales history' },
          daysOfHistory: { N: '0' },
        },
      ],
    });

    const response = await handler({ httpMethod: 'GET' });
    const body = JSON.parse(response.body);

    expect(body[0].trendLabel).toBe('Insufficient data');
    expect(body[0].rSquared).toBeNull();
  });

  it('returns 405 for a non-GET method', async () => {
    const response = await handler({ httpMethod: 'POST' });
    expect(response.statusCode).toBe(405);
  });

  it('returns 500 and never throws when DynamoDB fails', async () => {
    ddbMock.on(ScanCommand).rejects(new Error('boom'));
    const response = await handler({ httpMethod: 'GET' });
    expect(response.statusCode).toBe(500);
  });
});
