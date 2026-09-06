/**
 * Seeds ~9 months of synthetic sales history into the real RetailSales
 * table, so the FR-10 recommendation engine has enough data to produce a
 * meaningful trend instead of near-zero-confidence noise. This is the SAD
 * report's own stated mitigation for its top-flagged risk ("Insufficient
 * sales history for ML", High/High) — not a shortcut invented here.
 *
 * Each real product (read live from RetailInventory, not hardcoded) gets a
 * distinct, deliberate daily-demand pattern (steady grower, decliner,
 * weekend-heavy, seasonal, flat) so the recommendation engine visibly
 * produces different trend labels across products.
 *
 * - Does NOT touch RetailInventory/current stock — these are backfilled
 *   HISTORY records, not live transactions, so going through POST /sales
 *   (which decrements real current stock) would corrupt today's real
 *   inventory numbers. Sales are written directly via BatchWriteItem.
 * - Every seeded record is tagged `synthetic: true` and uses a deterministic
 *   saleId (`SEED-{productId}-{date}`), so re-running this script is safe —
 *   it overwrites its own prior output rather than duplicating rows.
 * - Dry-run by default. Nothing is written to AWS unless run with --confirm.
 *
 * Usage:
 *   npx ts-node scripts/seed-synthetic-sales.ts            # dry run, prints a summary
 *   npx ts-node scripts/seed-synthetic-sales.ts --confirm   # actually writes
 */

import {
  BatchWriteItemCommand,
  DynamoDBClient,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';

const REGION = 'ap-southeast-2';
const PRODUCTS_TABLE_NAME = 'RetailInventory';
const SALES_TABLE_NAME = 'RetailSales';
const HISTORY_DAYS = 270; // ~9 months, per the SAD report's mitigation
const BATCH_SIZE = 25; // DynamoDB BatchWriteItem's hard limit per call

const client = new DynamoDBClient({ region: REGION });

type Pattern = (dayIndex: number, date: Date, rng: () => number) => number;

// dayIndex runs 0 (oldest, HISTORY_DAYS-1 days ago) to HISTORY_DAYS-1
// (newest, yesterday) so later days represent "now" for trend purposes.
const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

const steadyGrowth = (base: number, dailySlope: number, noise: number): Pattern =>
  (dayIndex, _date, rng) =>
    base + dailySlope * dayIndex + (rng() - 0.5) * 2 * noise;

const steadyDecline = (base: number, dailySlope: number, noise: number): Pattern =>
  (dayIndex, _date, rng) =>
    base - dailySlope * dayIndex + (rng() - 0.5) * 2 * noise;

const weekendHeavy = (weekdayBase: number, weekendBonus: number, noise: number): Pattern =>
  (_dayIndex, date, rng) =>
    weekdayBase + (isWeekend(date) ? weekendBonus : 0) + (rng() - 0.5) * 2 * noise;

const seasonal = (base: number, amplitude: number, periodDays: number, phase: number, noise: number): Pattern =>
  (dayIndex, _date, rng) =>
    base + amplitude * Math.sin((2 * Math.PI * dayIndex) / periodDays + phase) + (rng() - 0.5) * 2 * noise;

const flat = (base: number, noise: number): Pattern =>
  (_dayIndex, _date, rng) => base + (rng() - 0.5) * 2 * noise;

// Assigned by productId against the actual live catalogue (fetched below),
// not hardcoded names, so this still works if products are renamed. A
// product not in this map falls back to a flat/stable pattern.
const PATTERNS: Record<string, { pattern: Pattern; label: string }> = {
  P001: { pattern: steadyGrowth(3, 0.02, 1), label: 'steady grower' },
  P003: { pattern: steadyGrowth(2, 0.01, 1), label: 'steady grower (slower)' },
  P012: { pattern: steadyDecline(6, 0.015, 1), label: 'steady decliner' },
  P008: { pattern: steadyDecline(5, 0.02, 1), label: 'steady decliner' },
  P009: { pattern: weekendHeavy(2, 4, 0.5), label: 'weekend-heavy' },
  Poijh: { pattern: weekendHeavy(1.5, 5, 0.5), label: 'weekend-heavy (BBQ)' },
  P005: { pattern: seasonal(4, 3, 180, -Math.PI / 2, 0.75), label: 'seasonal (rising into summer)' },
  P234: { pattern: seasonal(3, 2.5, 180, Math.PI / 2, 0.75), label: 'seasonal (falling)' },
  P0001: { pattern: flat(5, 1.5), label: 'flat/stable' },
};
const DEFAULT_PATTERN = { pattern: flat(3, 1), label: 'flat/stable (default)' };

// Simple deterministic PRNG (mulberry32) seeded per product, so re-running
// this script reproduces exactly the same synthetic data every time.
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(productId: string): number {
  let hash = 0;
  for (let i = 0; i < productId.length; i += 1) {
    hash = (hash * 31 + productId.charCodeAt(i)) | 0;
  }
  return hash;
}

async function fetchProducts() {
  const result = await client.send(new ScanCommand({ TableName: PRODUCTS_TABLE_NAME }));
  return (result.Items || []).map((item) => ({
    productId: item.productId?.S || '',
    name: item.name?.S || '',
    price: item.price?.N ? Number(item.price.N) : 0,
  }));
}

interface SeededSale {
  saleId: string;
  productId: string;
  productName: string;
  quantitySold: number;
  unitPrice: number;
  total: number;
  soldAt: string;
}

function generateSalesForProduct(product: { productId: string; name: string; price: number }): SeededSale[] {
  const { pattern } = PATTERNS[product.productId] || DEFAULT_PATTERN;
  const rng = seededRandom(hashSeed(product.productId));
  const sales: SeededSale[] = [];

  for (let dayIndex = 0; dayIndex < HISTORY_DAYS; dayIndex += 1) {
    const date = new Date();
    date.setUTCHours(12, 0, 0, 0); // midday UTC avoids any date-boundary ambiguity
    date.setUTCDate(date.getUTCDate() - (HISTORY_DAYS - dayIndex)); // ends yesterday

    const quantity = Math.round(Math.max(0, pattern(dayIndex, date, rng)));
    if (quantity <= 0) continue; // no transaction that day

    const soldAt = date.toISOString();
    const total = Number((product.price * quantity).toFixed(2));

    sales.push({
      saleId: `SEED-${product.productId}-${soldAt.slice(0, 10)}`,
      productId: product.productId,
      productName: product.name,
      quantitySold: quantity,
      unitPrice: product.price,
      total,
      soldAt,
    });
  }

  return sales;
}

async function writeBatch(sales: SeededSale[]) {
  const putRequests = sales.map((sale) => ({
    PutRequest: {
      Item: {
        saleId: { S: sale.saleId },
        productId: { S: sale.productId },
        productName: { S: sale.productName },
        quantitySold: { N: String(sale.quantitySold) },
        unitPrice: { N: String(sale.unitPrice) },
        total: { N: String(sale.total) },
        soldAt: { S: sale.soldAt },
        synthetic: { BOOL: true },
      },
    },
  }));

  await client.send(
    new BatchWriteItemCommand({
      RequestItems: { [SALES_TABLE_NAME]: putRequests },
    })
  );
}

async function main() {
  const confirm = process.argv.includes('--confirm');

  console.log(`Fetching live products from ${PRODUCTS_TABLE_NAME}...`);
  const products = await fetchProducts();
  console.log(`Found ${products.length} products.\n`);

  const allSales: SeededSale[] = [];
  for (const product of products) {
    const { label } = PATTERNS[product.productId] || DEFAULT_PATTERN;
    const sales = generateSalesForProduct(product);
    const totalUnits = sales.reduce((sum, sale) => sum + sale.quantitySold, 0);
    console.log(
      `  ${product.productId.padEnd(8)} ${product.name.padEnd(24)} ${label.padEnd(28)} ` +
        `${sales.length} sale-days, ${totalUnits} units total`
    );
    allSales.push(...sales);
  }

  console.log(`\nTotal synthetic sale records to write: ${allSales.length}`);
  console.log(`Date range: last ${HISTORY_DAYS} days (ending yesterday)`);
  console.log(`Sample record:`, allSales[0]);

  if (!confirm) {
    console.log('\nDry run only — no data written. Re-run with --confirm to write to AWS.');
    return;
  }

  console.log(`\nWriting ${allSales.length} records to ${SALES_TABLE_NAME} in batches of ${BATCH_SIZE}...`);
  for (let i = 0; i < allSales.length; i += BATCH_SIZE) {
    const batch = allSales.slice(i, i + BATCH_SIZE);
    await writeBatch(batch);
    process.stdout.write(`\r  ${Math.min(i + BATCH_SIZE, allSales.length)}/${allSales.length}`);
  }
  console.log('\nDone.');
}

main().catch((error) => {
  console.error('Seed script failed:', error);
  process.exit(1);
});
