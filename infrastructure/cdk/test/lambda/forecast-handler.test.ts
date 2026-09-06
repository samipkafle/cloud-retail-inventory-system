import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import { handler } from '../../lambda/forecast-handler';

const ddbMock = mockClient(DynamoDBClient);

beforeEach(() => {
  ddbMock.reset();
});

function productItem(overrides: Record<string, any> = {}) {
  return {
    productId: { S: 'P100' },
    name: { S: 'Tea' },
    stock: { N: '20' },
    reorderThreshold: { N: '5' },
    ...overrides,
  };
}

describe('GET /forecast/{productId}', () => {
  it('returns 404 for an unknown product', async () => {
    ddbMock.on(GetItemCommand).resolves({ Item: undefined });

    const response = await handler({
      httpMethod: 'GET',
      pathParameters: { productId: 'NOPE' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('computes daily sales, days remaining and a suggested restock quantity', async () => {
    ddbMock.on(GetItemCommand).resolves({ Item: productItem({ stock: { N: '20' } }) });
    // 14 units sold across the window -> 1/day
    ddbMock.on(QueryCommand).resolves({
      Items: [{ quantitySold: { N: '14' } }],
    });

    const response = await handler({
      httpMethod: 'GET',
      pathParameters: { productId: 'P100' },
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.soldLast14Days).toBe(14);
    expect(body.averageDailySales).toBe(1);
    expect(body.daysRemaining).toBe(20);
    expect(body.demandLabel).toBe('Steady demand');
  });

  it('returns daysRemaining: null (not Infinity) when there are no recent sales', async () => {
    ddbMock.on(GetItemCommand).resolves({ Item: productItem() });
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const response = await handler({
      httpMethod: 'GET',
      pathParameters: { productId: 'P100' },
    });
    const body = JSON.parse(response.body);

    expect(body.soldLast14Days).toBe(0);
    expect(body.daysRemaining).toBeNull();
    expect(body.demandLabel).toBe('No sales yet');
    // target = reorderThreshold(5) * 3 = 15, which is below current stock (20)
    expect(body.suggestedRestockQuantity).toBe(0);
  });

  it('queries the sales GSI rather than scanning the sales table', async () => {
    ddbMock.on(GetItemCommand).resolves({ Item: productItem() });
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    await handler({ httpMethod: 'GET', pathParameters: { productId: 'P100' } });

    const call = ddbMock.commandCalls(QueryCommand)[0];
    expect(call.args[0].input.IndexName).toBe('productId-soldAt-index');
    expect(call.args[0].input.KeyConditionExpression).toContain('productId');
  });
});

describe('GET /forecast', () => {
  it('ranks products with the fewest days of stock remaining first', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        productItem({ productId: { S: 'SLOW' }, stock: { N: '100' } }),
        productItem({ productId: { S: 'URGENT' }, stock: { N: '5' } }),
      ],
    });
    // Both sell 1/day (7 units over the window), but URGENT has far less stock
    ddbMock.on(QueryCommand).resolves({ Items: [{ quantitySold: { N: '7' } }] });

    const response = await handler({ httpMethod: 'GET' });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.map((f: any) => f.productId)).toEqual(['URGENT', 'SLOW']);
  });

  it('ranks products with no sales history last', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        productItem({ productId: { S: 'NO_SALES' } }),
        productItem({ productId: { S: 'SELLING' } }),
      ],
    });
    ddbMock.on(QueryCommand).callsFake((input: any) => {
      if (input.ExpressionAttributeValues[':productId'].S === 'SELLING') {
        return { Items: [{ quantitySold: { N: '7' } }] };
      }
      return { Items: [] };
    });

    const response = await handler({ httpMethod: 'GET' });
    const body = JSON.parse(response.body);

    expect(body.map((f: any) => f.productId)).toEqual(['SELLING', 'NO_SALES']);
  });
});

describe('unhandled method', () => {
  it('returns 405', async () => {
    const response = await handler({ httpMethod: 'POST' });
    expect(response.statusCode).toBe(405);
  });
});

describe('errors', () => {
  it('returns 500 and never throws when DynamoDB fails', async () => {
    ddbMock.on(ScanCommand).rejects(new Error('boom'));
    const response = await handler({ httpMethod: 'GET' });
    expect(response.statusCode).toBe(500);
  });
});
