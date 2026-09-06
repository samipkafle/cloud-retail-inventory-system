import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { handler } from '../../lambda/inventory-status-handler';

const ddbMock = mockClient(DynamoDBClient);

beforeEach(() => {
  ddbMock.reset();
});

describe('GET /inventory', () => {
  it('flags products at or below their reorder threshold as LOW', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          productId: { S: 'P100' },
          name: { S: 'Tea' },
          stock: { N: '2' },
          reorderThreshold: { N: '3' },
        },
        {
          productId: { S: 'P200' },
          name: { S: 'Coffee' },
          stock: { N: '20' },
          reorderThreshold: { N: '5' },
        },
      ],
    });

    const response = await handler({ httpMethod: 'GET' });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.belowThresholdCount).toBe(1);
    expect(body.products).toEqual([
      { productId: 'P100', name: 'Tea', stock: 2, reorderThreshold: 3, status: 'LOW' },
      { productId: 'P200', name: 'Coffee', stock: 20, reorderThreshold: 5, status: 'OK' },
    ]);
  });

  it('returns 405 for a non-GET method', async () => {
    const response = await handler({ httpMethod: 'POST' });
    expect(response.statusCode).toBe(405);
  });
});
