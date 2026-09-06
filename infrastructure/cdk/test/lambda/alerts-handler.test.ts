import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { handler } from '../../lambda/alerts-handler';

const ddbMock = mockClient(DynamoDBClient);

beforeEach(() => {
  ddbMock.reset();
});

describe('GET /alerts', () => {
  it('returns alerts sorted newest first', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          alertId: { S: 'A1' },
          productId: { S: 'P100' },
          stockAtAlert: { N: '2' },
          reorderThreshold: { N: '3' },
          raisedAt: { S: '2026-01-01T00:00:00.000Z' },
        },
        {
          alertId: { S: 'A2' },
          productId: { S: 'P200' },
          stockAtAlert: { N: '1' },
          reorderThreshold: { N: '5' },
          raisedAt: { S: '2026-02-01T00:00:00.000Z' },
        },
      ],
    });

    const response = await handler({ httpMethod: 'GET' });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.map((alert: any) => alert.alertId)).toEqual(['A2', 'A1']);
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
