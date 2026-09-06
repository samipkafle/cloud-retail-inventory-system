import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

// getSignedUrl computes a signature locally rather than calling
// client.send(), so aws-sdk-client-mock can't intercept it — mock the
// module directly instead of hitting real AWS credential resolution in CI.
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example.com/report.csv'),
}));

import { handler } from '../../lambda/reports-handler';

const ddbMock = mockClient(DynamoDBClient);
const s3Mock = mockClient(S3Client);

beforeEach(() => {
  ddbMock.reset();
  s3Mock.reset();
  s3Mock.on(PutObjectCommand).resolves({});
});

describe('validation', () => {
  it('rejects a missing/invalid type', async () => {
    const response = await handler({ httpMethod: 'GET', queryStringParameters: {} });
    expect(response.statusCode).toBe(400);
  });

  it('rejects an invalid from date', async () => {
    const response = await handler({
      httpMethod: 'GET',
      queryStringParameters: { type: 'sales', from: 'not-a-date' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects from being after to', async () => {
    const response = await handler({
      httpMethod: 'GET',
      queryStringParameters: { type: 'sales', from: '2026-02-01', to: '2026-01-01' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 405 for a non-GET method', async () => {
    const response = await handler({ httpMethod: 'POST' });
    expect(response.statusCode).toBe(405);
  });
});

describe('GET /reports?type=inventory', () => {
  it('generates a CSV, uploads it to S3, and returns a presigned URL', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          productId: { S: 'P100' },
          name: { S: 'Tea' },
          category: { S: 'Pantry' },
          price: { N: '5' },
          stock: { N: '2' },
          reorderThreshold: { N: '3' },
        },
      ],
    });

    const response = await handler({
      httpMethod: 'GET',
      queryStringParameters: { type: 'inventory' },
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.type).toBe('inventory');
    expect(body.rowCount).toBe(1);
    expect(body.downloadUrl).toBe('https://signed.example.com/report.csv');

    const putCall = s3Mock.commandCalls(PutObjectCommand)[0];
    expect(putCall.args[0].input.ContentType).toBe('text/csv; charset=utf-8');
    const csvBody = String(putCall.args[0].input.Body);
    expect(csvBody).toContain('"Product ID","Name","Category"');
    expect(csvBody).toContain('"P100","Tea","Pantry","5.00","2","3","Low stock"');
  });

  it('marks stock at or below zero as Out of stock', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          productId: { S: 'P200' },
          name: { S: 'Coffee' },
          category: { S: 'Pantry' },
          price: { N: '10' },
          stock: { N: '0' },
          reorderThreshold: { N: '5' },
        },
      ],
    });

    await handler({ httpMethod: 'GET', queryStringParameters: { type: 'inventory' } });

    const csvBody = String(s3Mock.commandCalls(PutObjectCommand)[0].args[0].input.Body);
    expect(csvBody).toContain('Out of stock');
  });
});

describe('GET /reports?type=sales', () => {
  it('filters by the from/to range and sorts newest first', async () => {
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
          soldAt: { S: '2026-03-01T00:00:00.000Z' },
        },
      ],
    });

    const response = await handler({
      httpMethod: 'GET',
      queryStringParameters: { type: 'sales', from: '2026-02-01', to: '2026-04-01' },
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.rowCount).toBe(1);

    const csvBody = String(s3Mock.commandCalls(PutObjectCommand)[0].args[0].input.Body);
    expect(csvBody).toContain('S2');
    expect(csvBody).not.toContain('S1');
  });
});

describe('errors', () => {
  it('returns 500 and never throws when DynamoDB fails', async () => {
    ddbMock.on(ScanCommand).rejects(new Error('boom'));
    const response = await handler({
      httpMethod: 'GET',
      queryStringParameters: { type: 'inventory' },
    });
    expect(response.statusCode).toBe(500);
  });
});
