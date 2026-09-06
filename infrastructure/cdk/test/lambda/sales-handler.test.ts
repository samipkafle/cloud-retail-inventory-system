import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { handler } from '../../lambda/sales-handler';

const ddbMock = mockClient(DynamoDBClient);
const snsMock = mockClient(SNSClient);

beforeEach(() => {
  ddbMock.reset();
  snsMock.reset();
});

function productItem(overrides: Record<string, any> = {}) {
  return {
    productId: { S: 'P100' },
    name: { S: 'Tea' },
    price: { N: '5' },
    stock: { N: '10' },
    reorderThreshold: { N: '3' },
    ...overrides,
  };
}

describe('POST /sales validation', () => {
  it('rejects a missing productId', async () => {
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ quantitySold: 1 }),
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects a non-integer quantity', async () => {
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ productId: 'P100', quantitySold: 1.5 }),
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 404 for an unknown product', async () => {
    ddbMock.on(GetItemCommand).resolves({ Item: undefined });

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ productId: 'NOPE', quantitySold: 1 }),
    });

    expect(response.statusCode).toBe(404);
  });

  it('rejects a sale that exceeds current stock', async () => {
    ddbMock.on(GetItemCommand).resolves({ Item: productItem({ stock: { N: '2' } }) });

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ productId: 'P100', quantitySold: 5 }),
    });

    expect(response.statusCode).toBe(400);
    expect(ddbMock.commandCalls(TransactWriteItemsCommand)).toHaveLength(0);
  });
});

describe('POST /sales success path', () => {
  it('records a sale, decrements stock transactionally, and does not raise an alert above threshold', async () => {
    ddbMock
      .on(GetItemCommand)
      .resolvesOnce({ Item: productItem({ stock: { N: '10' } }) }) // pre-sale read
      .resolvesOnce({ Item: productItem({ stock: { N: '7' } }) }); // post-sale read
    ddbMock.on(TransactWriteItemsCommand).resolves({});

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ productId: 'P100', quantitySold: 3 }),
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(201);
    expect(body.remainingStock).toBe(7);
    expect(body.alertRaised).toBe(false);
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(0);

    const transactInput = ddbMock.commandCalls(TransactWriteItemsCommand)[0].args[0].input;
    expect(transactInput.TransactItems?.[0].Update?.ExpressionAttributeValues?.[':qty']).toEqual({
      N: '3',
    });
  });

  it('raises a low-stock alert and publishes SNS when stock drops to the reorder threshold', async () => {
    ddbMock
      .on(GetItemCommand)
      .resolvesOnce({ Item: productItem({ stock: { N: '5' }, reorderThreshold: { N: '3' } }) })
      .resolvesOnce({ Item: productItem({ stock: { N: '2' }, reorderThreshold: { N: '3' } }) });
    ddbMock.on(TransactWriteItemsCommand).resolves({});
    ddbMock.on(PutItemCommand).resolves({});
    snsMock.on(PublishCommand).resolves({});

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ productId: 'P100', quantitySold: 3 }),
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(201);
    expect(body.alertRaised).toBe(true);
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(1);
  });

  it('returns 409 when the stock changed concurrently (transaction conflict)', async () => {
    ddbMock.on(GetItemCommand).resolves({ Item: productItem({ stock: { N: '10' } }) });
    const conflict = new Error('conflict');
    conflict.name = 'TransactionCanceledException';
    ddbMock.on(TransactWriteItemsCommand).rejects(conflict);

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ productId: 'P100', quantitySold: 3 }),
    });

    expect(response.statusCode).toBe(409);
  });
});

describe('GET /sales', () => {
  it('returns sales sorted newest first', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          saleId: { S: 'S1' },
          productId: { S: 'P100' },
          productName: { S: 'Tea' },
          quantitySold: { N: '2' },
          unitPrice: { N: '5' },
          total: { N: '10' },
          soldAt: { S: '2026-01-01T00:00:00.000Z' },
        },
        {
          saleId: { S: 'S2' },
          productId: { S: 'P100' },
          productName: { S: 'Tea' },
          quantitySold: { N: '1' },
          unitPrice: { N: '5' },
          total: { N: '5' },
          soldAt: { S: '2026-02-01T00:00:00.000Z' },
        },
      ],
    });

    const response = await handler({ httpMethod: 'GET' });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.map((sale: any) => sale.saleId)).toEqual(['S2', 'S1']);
  });
});

describe('unhandled method', () => {
  it('returns 405', async () => {
    const response = await handler({ httpMethod: 'DELETE' });
    expect(response.statusCode).toBe(405);
  });
});
