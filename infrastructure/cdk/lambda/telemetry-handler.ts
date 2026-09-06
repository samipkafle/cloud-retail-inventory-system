import {
  CloudWatchClient,
  PutMetricDataCommand,
  GetMetricDataCommand,
  StandardUnit,
  MetricDatum,
} from '@aws-sdk/client-cloudwatch';
import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
} from '@aws-sdk/client-cloudwatch-logs';

const cloudwatch = new CloudWatchClient({});
const cloudwatchLogs = new CloudWatchLogsClient({});

const metricNamespace = process.env.METRIC_NAMESPACE || 'GreenLeaf/Frontend';

// This Lambda's own log group holds the FRONTEND_EVENT lines written by
// recordEvent() below (Lambda ships stdout to CloudWatch Logs automatically),
// so it doubles as the source for the per-event detail view.
const logGroupName = `/aws/lambda/${process.env.AWS_LAMBDA_FUNCTION_NAME}`;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

// POST /telemetry — receives a frontend health/error event, logs it (Lambda
// ships stdout to CloudWatch Logs automatically) and records it as a custom
// CloudWatch metric so an alarm can react to a run of frontend errors.
async function recordEvent(event: any) {
  const payload = event.body ? JSON.parse(event.body) : {};
  const status = payload.status === 'error' ? 'error' : 'success';
  const message = typeof payload.message === 'string' ? payload.message : '';
  const duration =
    typeof payload.duration === 'number' && Number.isFinite(payload.duration)
      ? payload.duration
      : null;
  const page = typeof payload.page === 'string' ? payload.page : 'unknown';

  console.log(
    JSON.stringify({
      type: 'FRONTEND_EVENT',
      status,
      message,
      duration,
      page,
      receivedAt: new Date().toISOString(),
    })
  );

  const metricData: MetricDatum[] = [
    {
      MetricName: status === 'error' ? 'FrontendErrorCount' : 'FrontendSuccessCount',
      Value: 1,
      Unit: StandardUnit.Count,
      Timestamp: new Date(),
    },
  ];

  if (duration !== null) {
    metricData.push({
      MetricName: 'FrontendResponseTime',
      Value: duration,
      Unit: StandardUnit.Milliseconds,
      Timestamp: new Date(),
    });
  }

  await cloudwatch.send(
    new PutMetricDataCommand({
      Namespace: metricNamespace,
      MetricData: metricData,
    })
  );

  return {
    statusCode: 202,
    headers: corsHeaders,
    body: JSON.stringify({ message: 'Telemetry recorded' }),
  };
}

// GET /telemetry?minutes=60 — reads back the aggregated CloudWatch metrics
// so the frontend can show all-session totals, not just this browser tab's
// own local log.
async function readSummary(event: any) {
  const requestedMinutes = Number(event.queryStringParameters?.minutes);
  const windowMinutes = Number.isFinite(requestedMinutes)
    ? Math.min(Math.max(Math.round(requestedMinutes), 5), 1440)
    : 60;

  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - windowMinutes * 60 * 1000);
  const periodSeconds = windowMinutes * 60;

  const metricStat = (metricName: string, stat: string) => ({
    Metric: {
      Namespace: metricNamespace,
      MetricName: metricName,
    },
    Period: periodSeconds,
    Stat: stat,
  });

  const result = await cloudwatch.send(
    new GetMetricDataCommand({
      StartTime: startTime,
      EndTime: endTime,
      MetricDataQueries: [
        {
          Id: 'errorCount',
          MetricStat: metricStat('FrontendErrorCount', 'Sum'),
        },
        {
          Id: 'successCount',
          MetricStat: metricStat('FrontendSuccessCount', 'Sum'),
        },
        {
          Id: 'avgResponseMs',
          MetricStat: metricStat('FrontendResponseTime', 'Average'),
        },
      ],
    })
  );

  const valueFor = (id: string) =>
    result.MetricDataResults?.find((entry) => entry.Id === id)?.Values?.[0] ?? 0;

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      windowMinutes,
      errorCount: Math.round(valueFor('errorCount')),
      successCount: Math.round(valueFor('successCount')),
      avgResponseMs: Math.round(valueFor('avgResponseMs')),
      generatedAt: new Date().toISOString(),
    }),
  };
}

// GET /telemetry/events?limit=50 — runs a CloudWatch Logs Insights query
// against this Lambda's own log group (Lambda ships stdout to CloudWatch Logs
// automatically) to return the most recent raw FRONTEND_EVENT entries across
// all sessions, for the Monitoring page's event-detail log.
async function readEvents(event: any) {
  const requestedLimit = Number(event.queryStringParameters?.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.round(requestedLimit), 1), 200)
    : 50;

  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

  const { queryId } = await cloudwatchLogs.send(
    new StartQueryCommand({
      logGroupName,
      startTime: Math.floor(startTime.getTime() / 1000),
      endTime: Math.floor(endTime.getTime() / 1000),
      queryString: `fields receivedAt, status, message, duration, page
        | filter type = "FRONTEND_EVENT"
        | sort receivedAt desc
        | limit ${limit}`,
    })
  );

  if (!queryId) {
    throw new Error('CloudWatch Logs Insights did not return a query id');
  }

  // Logs Insights queries run asynchronously; poll until AWS finishes
  // (typically well under a second at this log group's volume).
  let results;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await cloudwatchLogs.send(
      new GetQueryResultsCommand({ queryId })
    );

    if (response.status === 'Complete') {
      results = response.results ?? [];
      break;
    }

    if (response.status === 'Failed' || response.status === 'Cancelled') {
      throw new Error(`Logs Insights query ${response.status.toLowerCase()}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (!results) {
    throw new Error('Logs Insights query timed out');
  }

  const fieldValue = (row: { field?: string; value?: string }[], field: string) =>
    row.find((entry) => entry.field === field)?.value;

  const events = results.map((row) => ({
    receivedAt: fieldValue(row, 'receivedAt') ?? null,
    status: fieldValue(row, 'status') === 'error' ? 'error' : 'success',
    message: fieldValue(row, 'message') ?? '',
    duration:
      fieldValue(row, 'duration') !== undefined
        ? Number(fieldValue(row, 'duration'))
        : null,
    page: fieldValue(row, 'page') ?? 'unknown',
  }));

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ events }),
  };
}

export const handler = async (event: any) => {
  const isEventsRoute = String(event.resource || event.path || '').endsWith(
    '/events'
  );

  try {
    if (event.httpMethod === 'POST') return await recordEvent(event);
    if (event.httpMethod === 'GET' && isEventsRoute) return await readEvents(event);
    if (event.httpMethod === 'GET') return await readSummary(event);

    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Method not allowed',
      }),
    };
  } catch (error) {
    console.error('Telemetry request failed:', error);

    // A failed POST is still best-effort (202: don't make the frontend think
    // the app itself broke), but a failed GET is a real error the caller
    // should see rather than silently rendering zeroes.
    if (event.httpMethod === 'GET') {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          message: isEventsRoute
            ? 'Failed to read telemetry events'
            : 'Failed to read telemetry summary',
        }),
      };
    }

    return {
      statusCode: 202,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Telemetry accepted with errors' }),
    };
  }
};
