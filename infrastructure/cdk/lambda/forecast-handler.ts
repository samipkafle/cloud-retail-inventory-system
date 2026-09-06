import { DynamoDBClient, GetItemCommand, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});

const productsTableName = process.env.PRODUCTS_TABLE_NAME!;
const salesTableName = process.env.SALES_TABLE_NAME!;
const salesIndexName = process.env.SALES_INDEX_NAME!;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

const FORECAST_WINDOW_DAYS = 14;
const SAFETY_BUFFER = 1.15;

// Same thresholds as the frontend's demandLabel() (frontend/js/inventory.js)
// so the two stay in agreement while both exist.
function demandLabel(dailySales: number): string {
  if (dailySales >= 2) return 'High demand';
  if (dailySales >= 0.75) return 'Steady demand';
  if (dailySales > 0) return 'Emerging demand';
  return 'No sales yet';
}

function windowStartIso(): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (FORECAST_WINDOW_DAYS - 1));
  return start.toISOString();
}

// Sums quantitySold for one product over the trailing 14-day window, via the
// productId-soldAt-index GSI rather than scanning the whole Sales table.
async function soldInWindow(productId: string, sinceIso: string): Promise<number> {
  let total = 0;
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const result = await client.send(
      new QueryCommand({
        TableName: salesTableName,
        IndexName: salesIndexName,
        KeyConditionExpression: 'productId = :productId AND soldAt >= :since',
        ExpressionAttributeValues: {
          ':productId': { S: productId },
          ':since': { S: sinceIso },
        },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    for (const item of result.Items || []) {
      total += item.quantitySold?.N ? Number(item.quantitySold.N) : 0;
    }
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return total;
}

// Mirrors getForecasts() in frontend/js/inventory.js — same formula, so the
// two agree while the frontend calculation still exists alongside this.
// daysRemaining is null (not Infinity, which isn't valid JSON) when there's
// no recent sales velocity to project from.
function buildForecast(product: Record<string, any>, soldLast14Days: number) {
  const stock = product.stock?.N ? Number(product.stock.N) : 0;
  const reorderThreshold = product.reorderThreshold?.N
    ? Number(product.reorderThreshold.N)
    : 0;
  const dailySales = soldLast14Days / FORECAST_WINDOW_DAYS;
  const daysRemaining = dailySales > 0 ? stock / dailySales : null;
  const targetStock = Math.max(
    reorderThreshold * 3,
    Math.ceil(dailySales * FORECAST_WINDOW_DAYS * SAFETY_BUFFER)
  );
  const suggestedRestockQuantity = Math.max(0, targetStock - stock);

  return {
    productId: product.productId?.S,
    name: product.name?.S,
    stock,
    reorderThreshold,
    soldLast14Days,
    averageDailySales: Number(dailySales.toFixed(2)),
    daysRemaining: daysRemaining === null ? null : Number(daysRemaining.toFixed(1)),
    suggestedRestockQuantity,
    demandLabel: demandLabel(dailySales),
  };
}

// Ranks most-urgent-to-restock first: fewest days of stock left, with total
// recent sales as a tiebreaker — matches the frontend's sort order.
function byUrgency(a: { daysRemaining: number | null; soldLast14Days: number }, b: typeof a) {
  if (a.daysRemaining === null && b.daysRemaining === null) {
    return b.soldLast14Days - a.soldLast14Days;
  }
  if (a.daysRemaining === null) return 1;
  if (b.daysRemaining === null) return -1;
  if (a.daysRemaining !== b.daysRemaining) return a.daysRemaining - b.daysRemaining;
  return b.soldLast14Days - a.soldLast14Days;
}

// GET /forecast/{productId} — one product's restock forecast.
async function getOne(productId: string) {
  const result = await client.send(
    new GetItemCommand({
      TableName: productsTableName,
      Key: { productId: { S: productId } },
    })
  );

  if (!result.Item) {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Product not found' }),
    };
  }

  const sinceIso = windowStartIso();
  const soldLast14Days = await soldInWindow(productId, sinceIso);

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(buildForecast(result.Item, soldLast14Days)),
  };
}

// GET /forecast — every product's forecast, ranked most-urgent-to-restock first.
async function getAll() {
  const productsResult = await client.send(new ScanCommand({ TableName: productsTableName }));
  const products = productsResult.Items || [];
  const sinceIso = windowStartIso();

  const forecasts = await Promise.all(
    products.map(async (product) => {
      const productId = product.productId?.S || '';
      const soldLast14Days = await soldInWindow(productId, sinceIso);
      return buildForecast(product, soldLast14Days);
    })
  );

  forecasts.sort(byUrgency);

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(forecasts),
  };
}

export const handler = async (event: any) => {
  try {
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Method not allowed' }),
      };
    }

    const productId = event.pathParameters?.productId;
    return productId ? await getOne(productId) : await getAll();
  } catch (error) {
    console.error('Error:', error);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
