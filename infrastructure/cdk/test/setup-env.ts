// Runs before any test module is required (see jest.config.js
// setupFiles), so handlers that read table/topic names into
// module-level consts at import time see these values.
process.env.TABLE_NAME = 'TestInventory';
process.env.PRODUCTS_TABLE_NAME = 'TestInventory';
process.env.SALES_TABLE_NAME = 'TestSales';
process.env.ALERTS_TABLE_NAME = 'TestAlerts';
process.env.ACTIVITIES_TABLE_NAME = 'TestActivities';
process.env.LOW_STOCK_TOPIC_ARN = 'arn:aws:sns:ap-southeast-2:123456789012:TestTopic';
process.env.METRIC_NAMESPACE = 'Test/Frontend';
process.env.AWS_LAMBDA_FUNCTION_NAME = 'TestTelemetryLambda';
process.env.AUTH_ENABLED = 'true';
