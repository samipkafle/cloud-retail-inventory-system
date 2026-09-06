import { mockClient } from 'aws-sdk-client-mock';
import {
  CloudWatchClient,
  GetMetricDataCommand,
  PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import {
  CloudWatchLogsClient,
  GetQueryResultsCommand,
  StartQueryCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { handler } from '../../lambda/telemetry-handler';

const cwMock = mockClient(CloudWatchClient);
const logsMock = mockClient(CloudWatchLogsClient);

beforeEach(() => {
  cwMock.reset();
  logsMock.reset();
});

describe('POST /telemetry', () => {
  it('records an error event as a CloudWatch metric', async () => {
    cwMock.on(PutMetricDataCommand).resolves({});

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ status: 'error', message: 'boom', page: 'dashboard' }),
    });

    expect(response.statusCode).toBe(202);
    const call = cwMock.commandCalls(PutMetricDataCommand)[0];
    expect(call.args[0].input.MetricData?.[0].MetricName).toBe('FrontendErrorCount');
  });

  it('still returns 202 (best-effort) when CloudWatch fails', async () => {
    cwMock.on(PutMetricDataCommand).rejects(new Error('boom'));

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ status: 'success' }),
    });

    expect(response.statusCode).toBe(202);
  });
});

describe('GET /telemetry summary', () => {
  it('aggregates error/success counts and average response time', async () => {
    cwMock.on(GetMetricDataCommand).resolves({
      MetricDataResults: [
        { Id: 'errorCount', Values: [2] },
        { Id: 'successCount', Values: [40] },
        { Id: 'avgResponseMs', Values: [123.4] },
      ],
    });

    const response = await handler({ httpMethod: 'GET', resource: '/telemetry' });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.errorCount).toBe(2);
    expect(body.successCount).toBe(40);
    expect(body.avgResponseMs).toBe(123);
  });

  it('returns 500 when CloudWatch fails', async () => {
    cwMock.on(GetMetricDataCommand).rejects(new Error('boom'));

    const response = await handler({ httpMethod: 'GET', resource: '/telemetry' });
    expect(response.statusCode).toBe(500);
  });
});

describe('GET /telemetry/events', () => {
  it('polls Logs Insights until the query completes and returns parsed events', async () => {
    logsMock.on(StartQueryCommand).resolves({ queryId: 'query-1' });
    logsMock
      .on(GetQueryResultsCommand)
      .resolvesOnce({ status: 'Running' })
      .resolvesOnce({
        status: 'Complete',
        results: [
          [
            { field: 'receivedAt', value: '2026-01-01T00:00:00.000Z' },
            { field: 'status', value: 'error' },
            { field: 'message', value: 'boom' },
            { field: 'page', value: 'dashboard' },
          ],
        ],
      });

    const response = await handler({
      httpMethod: 'GET',
      resource: '/telemetry/events',
      queryStringParameters: { limit: '10' },
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({ status: 'error', message: 'boom', page: 'dashboard' });
  });

  it('returns 500 if the Logs Insights query fails', async () => {
    logsMock.on(StartQueryCommand).resolves({ queryId: 'query-1' });
    logsMock.on(GetQueryResultsCommand).resolves({ status: 'Failed' });

    const response = await handler({ httpMethod: 'GET', resource: '/telemetry/events' });
    expect(response.statusCode).toBe(500);
  });
});

describe('unhandled method', () => {
  it('returns 405', async () => {
    const response = await handler({ httpMethod: 'DELETE', resource: '/telemetry' });
    expect(response.statusCode).toBe(405);
  });
});
