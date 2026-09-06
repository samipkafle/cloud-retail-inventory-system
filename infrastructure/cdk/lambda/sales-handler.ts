import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { randomUUID } from 'crypto';

const client = new DynamoDBClient({});
const snsClient = new SNSClient({});

const productsTableName = process.env.PRODUCTS_TABLE_NAME!;
const salesTableName = process.env.SALES_TABLE_NAME!;
const alertsTableName = process.env.ALERTS_TABLE_NAME!;
const lowStockTopicArn = process.env.LOW_STOCK_TOPIC_ARN!;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

// Reads every sale from DynamoDB, following Scan pagination when necessary.
async function readAllSales() {
  const items: Record<string, any>[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const result = await client.send(
      new ScanCommand({
        TableName: salesTableName,
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    items.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

// GET /sales returns the shared transaction history for every device.
async function getSales() {
  const items = await readAllSales();

  const sales = items
    .map((item) => {
      const quantitySold = item.quantitySold?.N
        ? Number(item.quantitySold.N)
        : 0;
      const unitPrice = item.unitPrice?.N ? Number(item.unitPrice.N) : 0;

      return {
        saleId: item.saleId?.S || '',
        productId: item.productId?.S || '',
        productName: item.productName?.S || item.productId?.S || 'Unknown product',
        quantitySold,
        unitPrice,
        total: item.total?.N
          ? Number(item.total.N)
          : Number((unitPrice * quantitySold).toFixed(2)),
        soldAt: item.soldAt?.S || '',
      };
    })
    .filter((sale) => sale.saleId && sale.productId && sale.soldAt)
    .sort((first, second) => second.soldAt.localeCompare(first.soldAt));

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(sales),
  };
}

// Stores a low-stock alert and publishes its email notification.
async function raiseLowStockAlert(
  productId: string,
  productName: string,
  updatedStock: number,
  reorderThreshold: number,
  raisedAt: string
) {
  try {
    await client.send(
      new PutItemCommand({
        TableName: alertsTableName,
        Item: {
          alertId: { S: randomUUID() },
          productId: { S: productId },
          stockAtAlert: { N: String(updatedStock) },
          reorderThreshold: { N: String(reorderThreshold) },
          raisedAt: { S: raisedAt },
        },
      })
    );
  } catch (alertError) {
    console.error('Failed to store low-stock alert:', alertError);
  }

  try {
    await snsClient.send(
      new PublishCommand({
        TopicArn: lowStockTopicArn,
        Subject: `Low stock alert: ${productName}`,
        Message: `${productName} (${productId}) is low on stock.\n\nStock remaining: ${updatedStock}\nReorder threshold: ${reorderThreshold}\nAlert raised at: ${raisedAt}`,
      })
    );
  } catch (snsError) {
    console.error('Failed to publish low-stock notification:', snsError);
  }
}

// POST /sales atomically reduces stock and records one sale transaction.
async function createSale(event: any) {
  const body = JSON.parse(event.body || '{}');
  const productId = String(body.productId || '').trim();
  const quantitySold = Number(body.quantitySold);

  if (!productId || !Number.isInteger(quantitySold) || quantitySold < 1) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'productId and a positive whole-number quantitySold are required',
      }),
    };
  }

  const productResult = await client.send(
    new GetItemCommand({
      TableName: productsTableName,
      Key: {
        productId: { S: productId },
      },
      ConsistentRead: true,
    })
  );

  if (!productResult.Item) {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Product not found',
      }),
    };
  }

  const productName = productResult.Item.name?.S || productId;
  const unitPrice = productResult.Item.price?.N
    ? Number(productResult.Item.price.N)
    : 0;
  const currentStock = productResult.Item.stock?.N
    ? Number(productResult.Item.stock.N)
    : 0;
  const reorderThreshold = productResult.Item.reorderThreshold?.N
    ? Number(productResult.Item.reorderThreshold.N)
    : 0;

  if (quantitySold > currentStock) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        message: `Sale rejected: only ${currentStock} units are available`,
      }),
    };
  }

  const saleId = randomUUID();
  const soldAt = new Date().toISOString();
  const total = Number((unitPrice * quantitySold).toFixed(2));

  try {
    await client.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Update: {
              TableName: productsTableName,
              Key: {
                productId: { S: productId },
              },
              UpdateExpression: 'SET #stock = #stock - :qty',
              ConditionExpression:
                'attribute_exists(productId) AND #stock >= :qty',
              ExpressionAttributeNames: {
                '#stock': 'stock',
              },
              ExpressionAttributeValues: {
                ':qty': { N: String(quantitySold) },
              },
            },
          },
          {
            Put: {
              TableName: salesTableName,
              Item: {
                saleId: { S: saleId },
                productId: { S: productId },
                productName: { S: productName },
                quantitySold: { N: String(quantitySold) },
                unitPrice: { N: String(unitPrice) },
                total: { N: String(total) },
                soldAt: { S: soldAt },
              },
              ConditionExpression: 'attribute_not_exists(saleId)',
            },
          },
        ],
      })
    );
  } catch (error: any) {
    if (
      error.name === 'TransactionCanceledException' ||
      error.name === 'ConditionalCheckFailedException'
    ) {
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({
          message:
            'Sale rejected because the stock changed. Refresh and try again.',
        }),
      };
    }

    throw error;
  }

  const updatedProduct = await client.send(
    new GetItemCommand({
      TableName: productsTableName,
      Key: {
        productId: { S: productId },
      },
      ConsistentRead: true,
    })
  );
  const remainingStock = updatedProduct.Item?.stock?.N
    ? Number(updatedProduct.Item.stock.N)
    : Math.max(0, currentStock - quantitySold);
  const alertRaised = remainingStock <= reorderThreshold;

  if (alertRaised) {
    await raiseLowStockAlert(
      productId,
      productName,
      remainingStock,
      reorderThreshold,
      soldAt
    );
  }

  return {
    statusCode: 201,
    headers: corsHeaders,
    body: JSON.stringify({
      message: 'Sale recorded successfully',
      sale: {
        saleId,
        productId,
        productName,
        quantitySold,
        unitPrice,
        total,
        soldAt,
      },
      remainingStock,
      alertRaised,
    }),
  };
}

// Routes GET and POST requests for the /sales API resource.
export const handler = async (event: any) => {
  try {
    if (event.httpMethod === 'GET') return await getSales();
    if (event.httpMethod === 'POST') return await createSale(event);

    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Method not allowed',
      }),
    };
  } catch (error) {
    console.error('Error:', error);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Internal server error',
      }),
    };
  }
};
