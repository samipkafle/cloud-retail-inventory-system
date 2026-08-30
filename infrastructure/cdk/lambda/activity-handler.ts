import {
  DynamoDBClient,
  PutItemCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';

const client = new DynamoDBClient({});
const tableName = process.env.ACTIVITIES_TABLE_NAME!;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

// Converts an unknown input into a trimmed, length-limited text field.
function safeText(value: unknown, fallback: string, maximumLength: number) {
  const text = String(value ?? '').trim();
  return (text || fallback).slice(0, maximumLength);
}

// Reads every activity page so the newest records can be sorted consistently.
async function readAllActivities() {
  const items: Record<string, any>[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    items.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

// GET /activities returns the newest shared audit entries.
async function getActivities(event: any) {
  const requestedLimit = Number(event.queryStringParameters?.limit);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(200, Math.max(1, requestedLimit))
    : 100;
  const items = await readAllActivities();

  const activities = items
    .map((item) => ({
      activityId: item.activityId?.S || '',
      type: item.type?.S || 'stock',
      title: item.title?.S || 'Activity recorded',
      detail: item.detail?.S || '',
      status: item.status?.S || 'Completed',
      user: item.user?.S || 'GreenLeaf user',
      createdAt: item.createdAt?.S || '',
    }))
    .filter((activity) => activity.activityId && activity.createdAt)
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    .slice(0, limit);

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(activities),
  };
}

// POST /activities validates and stores one shared audit entry.
async function createActivity(event: any) {
  let body: Record<string, any>;

  try {
    body = JSON.parse(event.body || '{}');
  } catch (_error) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Request body must be valid JSON' }),
    };
  }

  if (!String(body.title || '').trim()) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Activity title is required' }),
    };
  }

  const claims = event.requestContext?.authorizer?.claims || {};
  const claimedUser = claims.name || claims.email;
  const activityId = randomUUID();
  const createdAt = new Date().toISOString();
  const allowedTypes = ['sale', 'stock', 'alert'];
  const type = allowedTypes.includes(body.type) ? body.type : 'stock';
  const title = safeText(body.title, 'Activity recorded', 120);
  const detail = safeText(body.detail, '', 300);
  const status = body.status === 'Attention' ? 'Attention' : 'Completed';
  const user = safeText(claimedUser || body.user, 'GreenLeaf user', 100);

  await client.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        activityId: { S: activityId },
        type: { S: type },
        title: { S: title },
        detail: { S: detail },
        status: { S: status },
        user: { S: user },
        createdAt: { S: createdAt },
      },
      ConditionExpression: 'attribute_not_exists(activityId)',
    })
  );

  return {
    statusCode: 201,
    headers: corsHeaders,
    body: JSON.stringify({
      message: 'Activity recorded successfully',
      activity: {
        activityId,
        type,
        title,
        detail,
        status,
        user,
        createdAt,
      },
    }),
  };
}

// Routes GET and POST requests for the /activities API resource.
export const handler = async (event: any) => {
  try {
    if (event.httpMethod === 'GET') return await getActivities(event);
    if (event.httpMethod === 'POST') return await createActivity(event);

    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Error:', error);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
