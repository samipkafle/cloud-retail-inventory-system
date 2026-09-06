import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, PutItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { handler } from '../../lambda/activity-handler';

const ddbMock = mockClient(DynamoDBClient);

beforeEach(() => {
  ddbMock.reset();
});

describe('POST /activities', () => {
  it('rejects a missing title', async () => {
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ detail: 'no title here' }),
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects invalid JSON', async () => {
    const response = await handler({ httpMethod: 'POST', body: '{not json' });
    expect(response.statusCode).toBe(400);
  });

  it('stores an activity, falling back to a safe type/status', async () => {
    ddbMock.on(PutItemCommand).resolves({});

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ title: 'Restocked Tea', type: 'not-a-real-type' }),
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(201);
    expect(body.activity.type).toBe('stock');
    expect(body.activity.status).toBe('Completed');
    expect(body.activity.user).toBe('GreenLeaf user');
  });

  it('attributes the activity to the authenticated user from Cognito claims', async () => {
    ddbMock.on(PutItemCommand).resolves({});

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ title: 'Sold Tea', type: 'sale' }),
      requestContext: { authorizer: { claims: { email: 'manager@greenleaf.demo' } } },
    });
    const body = JSON.parse(response.body);

    expect(body.activity.user).toBe('manager@greenleaf.demo');
  });
});

describe('GET /activities', () => {
  it('returns activities newest first, respecting the limit', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          activityId: { S: 'A1' },
          type: { S: 'sale' },
          title: { S: 'First' },
          detail: { S: '' },
          status: { S: 'Completed' },
          user: { S: 'Lee' },
          createdAt: { S: '2026-01-01T00:00:00.000Z' },
        },
        {
          activityId: { S: 'A2' },
          type: { S: 'stock' },
          title: { S: 'Second' },
          detail: { S: '' },
          status: { S: 'Completed' },
          user: { S: 'Lee' },
          createdAt: { S: '2026-02-01T00:00:00.000Z' },
        },
      ],
    });

    const response = await handler({
      httpMethod: 'GET',
      queryStringParameters: { limit: '1' },
    });
    const body = JSON.parse(response.body);

    expect(body).toHaveLength(1);
    expect(body[0].activityId).toBe('A2');
  });
});

describe('unhandled method', () => {
  it('returns 405', async () => {
    const response = await handler({ httpMethod: 'DELETE' });
    expect(response.statusCode).toBe(405);
  });
});
