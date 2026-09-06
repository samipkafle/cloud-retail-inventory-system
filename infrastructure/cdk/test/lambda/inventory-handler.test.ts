import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBClient,
  PutItemCommand,
  ScanCommand,
  GetItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { handler } from '../../lambda/inventory-handler';

const ddbMock = mockClient(DynamoDBClient);

function withManagerClaims(overrides: Record<string, any> = {}) {
  return {
    requestContext: {
      authorizer: { claims: { 'cognito:groups': '[manager]' } },
    },
    ...overrides,
  };
}

function withStaffClaims(overrides: Record<string, any> = {}) {
  return {
    requestContext: {
      authorizer: { claims: { 'cognito:groups': '[staff]' } },
    },
    ...overrides,
  };
}

beforeEach(() => {
  ddbMock.reset();
});

describe('POST /products', () => {
  it('rejects a request from a non-manager when auth is enabled', async () => {
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ productId: 'P100', name: 'Tea', price: 5 }),
      ...withStaffClaims(),
    });

    expect(response.statusCode).toBe(403);
    expect(ddbMock.calls()).toHaveLength(0);
  });

  it('rejects a request with no group claims at all when auth is enabled', async () => {
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ productId: 'P100', name: 'Tea', price: 5 }),
    });

    expect(response.statusCode).toBe(403);
  });

  it('rejects a missing required field', async () => {
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ productId: 'P100', name: 'Tea' }),
      ...withManagerClaims(),
    });

    expect(response.statusCode).toBe(400);
    expect(ddbMock.calls()).toHaveLength(0);
  });

  it('creates a product for a manager and defaults optional fields', async () => {
    ddbMock.on(PutItemCommand).resolves({});

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ productId: 'P100', name: 'Tea', price: 5 }),
      ...withManagerClaims(),
    });

    expect(response.statusCode).toBe(201);
    const call = ddbMock.commandCalls(PutItemCommand)[0];
    expect(call.args[0].input.Item?.category).toEqual({ S: 'Other' });
    expect(call.args[0].input.Item?.stock).toEqual({ N: '0' });
  });

  it('allows staff to create a product when AUTH_ENABLED is false', async () => {
    process.env.AUTH_ENABLED = 'false';
    ddbMock.on(PutItemCommand).resolves({});

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ productId: 'P100', name: 'Tea', price: 5 }),
      ...withStaffClaims(),
    });

    expect(response.statusCode).toBe(201);
    process.env.AUTH_ENABLED = 'true';
  });
});

describe('GET /products', () => {
  it('lists all products with numeric fields converted', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          productId: { S: 'P100' },
          name: { S: 'Tea' },
          category: { S: 'Pantry' },
          price: { N: '5' },
          stock: { N: '12' },
          reorderThreshold: { N: '3' },
        },
      ],
    });

    const response = await handler({ httpMethod: 'GET' });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body).toEqual([
      {
        productId: 'P100',
        name: 'Tea',
        category: 'Pantry',
        price: 5,
        stock: 12,
        reorderThreshold: 3,
      },
    ]);
  });

  it('returns 404 for an unknown product id', async () => {
    ddbMock.on(GetItemCommand).resolves({ Item: undefined });

    const response = await handler({
      httpMethod: 'GET',
      pathParameters: { productId: 'NOPE' },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('PUT /products/{productId}', () => {
  it('rejects a non-manager when auth is enabled', async () => {
    const response = await handler({
      httpMethod: 'PUT',
      pathParameters: { productId: 'P100' },
      body: JSON.stringify({ price: 6 }),
      ...withStaffClaims(),
    });

    expect(response.statusCode).toBe(403);
  });

  it('rejects an update with no fields to change', async () => {
    const response = await handler({
      httpMethod: 'PUT',
      pathParameters: { productId: 'P100' },
      body: JSON.stringify({}),
      ...withManagerClaims(),
    });

    expect(response.statusCode).toBe(400);
  });

  it('updates only the provided fields', async () => {
    ddbMock.on(UpdateItemCommand).resolves({
      Attributes: {
        productId: { S: 'P100' },
        name: { S: 'Tea' },
        category: { S: 'Pantry' },
        price: { N: '6' },
        stock: { N: '12' },
        reorderThreshold: { N: '3' },
      },
    });

    const response = await handler({
      httpMethod: 'PUT',
      pathParameters: { productId: 'P100' },
      body: JSON.stringify({ price: 6 }),
      ...withManagerClaims(),
    });

    expect(response.statusCode).toBe(200);
    const call = ddbMock.commandCalls(UpdateItemCommand)[0];
    expect(call.args[0].input.UpdateExpression).toBe('SET #price = :price');
  });
});

describe('DELETE /products/{productId}', () => {
  it('rejects a non-manager when auth is enabled', async () => {
    const response = await handler({
      httpMethod: 'DELETE',
      pathParameters: { productId: 'P100' },
      ...withStaffClaims(),
    });

    expect(response.statusCode).toBe(403);
    expect(ddbMock.calls()).toHaveLength(0);
  });

  it('deletes a product for a manager', async () => {
    ddbMock.on(DeleteItemCommand).resolves({});

    const response = await handler({
      httpMethod: 'DELETE',
      pathParameters: { productId: 'P100' },
      ...withManagerClaims(),
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('unhandled method/path combinations', () => {
  it('returns 405', async () => {
    const response = await handler({ httpMethod: 'PATCH' });
    expect(response.statusCode).toBe(405);
  });

  it('returns 500 and never throws when DynamoDB fails', async () => {
    ddbMock.on(ScanCommand).rejects(new Error('boom'));

    const response = await handler({ httpMethod: 'GET' });
    expect(response.statusCode).toBe(500);
  });
});
