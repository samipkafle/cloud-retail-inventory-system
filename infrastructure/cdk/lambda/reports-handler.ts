import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const ddbClient = new DynamoDBClient({});
const s3Client = new S3Client({});

const productsTableName = process.env.PRODUCTS_TABLE_NAME!;
const salesTableName = process.env.SALES_TABLE_NAME!;
const reportsBucketName = process.env.REPORTS_BUCKET_NAME!;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

// Download links expire quickly — reports are meant to be fetched right
// after generation, not treated as a stable public URL.
const DOWNLOAD_URL_EXPIRY_SECONDS = 300;

// Matches frontend/js/utils.js's csvCell()/downloadCsv() exactly, so a
// server-generated report and a client-generated one are byte-for-byte
// equivalent in formatting.
function csvCell(value: unknown): string {
  return `"${String(value ?? '').split('"').join('""')}"`;
}

function toCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

async function scanAll(tableName: string): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const result = await ddbClient.send(
      new ScanCommand({ TableName: tableName, ExclusiveStartKey: lastEvaluatedKey })
    );
    items.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

// Matches the three-way status from frontend/js/inventory.js's
// getStockStatus() (not the two-way OK/LOW used by GET /inventory), since
// this report is the server-side equivalent of the frontend's CSV export.
function stockStatusLabel(stock: number, reorderThreshold: number): string {
  if (stock <= 0) return 'Out of stock';
  if (stock <= reorderThreshold) return 'Low stock';
  return 'In stock';
}

async function buildInventoryCsv(): Promise<{ csv: string; rowCount: number }> {
  const items = await scanAll(productsTableName);

  const rows = items.map((item) => {
    const stock = item.stock?.N ? Number(item.stock.N) : 0;
    const reorderThreshold = item.reorderThreshold?.N ? Number(item.reorderThreshold.N) : 0;

    return [
      item.productId?.S || '',
      item.name?.S || '',
      item.category?.S || '',
      (item.price?.N ? Number(item.price.N) : 0).toFixed(2),
      stock,
      reorderThreshold,
      stockStatusLabel(stock, reorderThreshold),
    ];
  });

  const csv = toCsv(
    ['Product ID', 'Name', 'Category', 'Unit price (AUD)', 'Stock', 'Reorder level', 'Status'],
    rows
  );

  return { csv, rowCount: rows.length };
}

async function buildSalesCsv(
  from: string | undefined,
  to: string | undefined
): Promise<{ csv: string; rowCount: number }> {
  const items = await scanAll(salesTableName);

  const filtered = items.filter((item) => {
    const soldAt = item.soldAt?.S || '';
    if (from && soldAt < from) return false;
    if (to && soldAt > to) return false;
    return true;
  });

  filtered.sort((a, b) => (b.soldAt?.S || '').localeCompare(a.soldAt?.S || ''));

  const rows = filtered.map((item) => {
    const quantitySold = item.quantitySold?.N ? Number(item.quantitySold.N) : 0;
    const unitPrice = item.unitPrice?.N ? Number(item.unitPrice.N) : 0;
    const total = item.total?.N ? Number(item.total.N) : unitPrice * quantitySold;

    return [
      item.saleId?.S || '',
      item.soldAt?.S || '',
      item.productId?.S || '',
      item.productName?.S || item.productId?.S || 'Unknown product',
      quantitySold,
      unitPrice.toFixed(2),
      total.toFixed(2),
    ];
  });

  const csv = toCsv(
    ['Transaction ID', 'Date', 'Product ID', 'Product', 'Quantity', 'Unit price (AUD)', 'Total (AUD)'],
    rows
  );

  return { csv, rowCount: rows.length };
}

function badRequest(message: string) {
  return {
    statusCode: 400,
    headers: corsHeaders,
    body: JSON.stringify({ message }),
  };
}

// Rejects a from/to value that doesn't parse as a real date, without
// requiring the caller to pass a full ISO timestamp — "2026-09-01" is fine.
function isValidDateString(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
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

    const query = event.queryStringParameters || {};
    const type = query.type;

    if (type !== 'inventory' && type !== 'sales') {
      return badRequest('type must be "inventory" or "sales"');
    }

    if (query.from && !isValidDateString(query.from)) {
      return badRequest('from must be a valid date');
    }
    if (query.to && !isValidDateString(query.to)) {
      return badRequest('to must be a valid date');
    }
    if (query.from && query.to && query.from > query.to) {
      return badRequest('from must not be after to');
    }

    const { csv, rowCount } =
      type === 'inventory'
        ? await buildInventoryCsv()
        : await buildSalesCsv(query.from, query.to);

    const generatedAt = new Date().toISOString();
    const reportId = randomUUID();
    const key = `${type}/${generatedAt.slice(0, 10)}/${reportId}.csv`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: reportsBucketName,
        Key: key,
        Body: '﻿' + csv,
        ContentType: 'text/csv; charset=utf-8',
      })
    );

    const downloadUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: reportsBucketName, Key: key }),
      { expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS }
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        reportId,
        type,
        generatedAt,
        rowCount,
        downloadUrl,
        expiresInSeconds: DOWNLOAD_URL_EXPIRY_SECONDS,
      }),
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
