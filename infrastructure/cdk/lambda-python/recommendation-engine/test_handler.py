"""Unit tests for the demand recommendation engine (FR-10).

Run with: pip install -r requirements-dev.txt && pytest
"""

import math
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import boto3
import pytest
from moto import mock_aws

os.environ.setdefault("PRODUCTS_TABLE_NAME", "TestProducts")
os.environ.setdefault("SALES_TABLE_NAME", "TestSales")
os.environ.setdefault("RECOMMENDATIONS_TABLE_NAME", "TestRecommendations")

# handler.py constructs its boto3 resource at import time. Force fake static
# credentials so that construction never touches this machine's real AWS
# config/SSO session — moto only needs to intercept the API calls made
# later, inside the mock_aws() context, not the client construction itself.
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-southeast-2")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_SECURITY_TOKEN", "testing")
os.environ.setdefault("AWS_SESSION_TOKEN", "testing")

import handler as engine  # noqa: E402  (must follow the env var defaults above)


@pytest.fixture
def dynamodb_tables():
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="ap-southeast-2")

        products_table = dynamodb.create_table(
            TableName=os.environ["PRODUCTS_TABLE_NAME"],
            KeySchema=[{"AttributeName": "productId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "productId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        sales_table = dynamodb.create_table(
            TableName=os.environ["SALES_TABLE_NAME"],
            KeySchema=[{"AttributeName": "saleId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "saleId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        recommendations_table = dynamodb.create_table(
            TableName=os.environ["RECOMMENDATIONS_TABLE_NAME"],
            KeySchema=[{"AttributeName": "productId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "productId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        # Re-point the module's already-constructed resource at the mocked
        # DynamoDB started by mock_aws(), since it was created at import
        # time against the real (unmocked) endpoint.
        engine.dynamodb = dynamodb

        yield {
            "products": products_table,
            "sales": sales_table,
            "recommendations": recommendations_table,
        }


def put_product(table, product_id):
    table.put_item(Item={"productId": product_id})


def put_sale(table, product_id, sold_at, quantity):
    table.put_item(
        Item={
            "saleId": f"{product_id}-{sold_at}",
            "productId": product_id,
            "soldAt": sold_at,
            "quantitySold": Decimal(str(quantity)),
        }
    )


def iso_days_ago(days):
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


class TestBuildDailySeries:
    def test_returns_none_for_a_product_with_no_sales(self):
        assert engine.build_daily_series([], "P100") is None

    def test_zero_fills_days_with_no_recorded_sale(self):
        sales = [
            {"productId": "P100", "soldAt": datetime(2026, 1, 1, tzinfo=timezone.utc), "quantitySold": 5.0},
            {"productId": "P100", "soldAt": datetime(2026, 1, 3, tzinfo=timezone.utc), "quantitySold": 3.0},
        ]
        series = engine.build_daily_series(sales, "P100")

        assert series == [5.0, 0.0, 3.0]  # Jan 1, 2 (no sale), 3

    def test_ignores_sales_belonging_to_other_products(self):
        sales = [
            {"productId": "P100", "soldAt": datetime(2026, 1, 1, tzinfo=timezone.utc), "quantitySold": 5.0},
            {"productId": "OTHER", "soldAt": datetime(2026, 1, 1, tzinfo=timezone.utc), "quantitySold": 99.0},
        ]
        series = engine.build_daily_series(sales, "P100")

        assert series == [5.0]


class TestPredictForProduct:
    def test_returns_none_below_the_minimum_history_window(self):
        assert engine.predict_for_product([1.0, 2.0, 3.0]) is None  # only 3 days, minimum is 7

    def test_labels_a_rising_trend_as_increasing(self):
        series = [float(day) for day in range(10)]  # steadily rising 0..9
        prediction = engine.predict_for_product(series)

        assert prediction is not None
        assert prediction["trendLabel"] == "Increasing"
        assert prediction["predictedDemand"] > 0
        assert prediction["daysOfHistory"] == 10

    def test_labels_a_falling_trend_as_decreasing(self):
        series = [float(20 - day) for day in range(10)]  # steadily falling
        prediction = engine.predict_for_product(series)

        assert prediction["trendLabel"] == "Decreasing"

    def test_labels_flat_sales_as_stable(self):
        prediction = engine.predict_for_product([5.0] * 10)  # constant
        assert prediction["trendLabel"] == "Stable"

    def test_never_predicts_negative_demand(self):
        # Sharp decline that would go negative if not clamped.
        series = [float(30 - day * 5) for day in range(10)]
        prediction = engine.predict_for_product(series)

        assert prediction["predictedDemand"] >= 0

    def test_zero_variance_sales_produce_a_finite_r_squared_not_nan(self):
        # Exact same quantity every day -> the correlation coefficient is
        # mathematically undefined (0/0) since its denominator involves
        # std(y). Must not surface as NaN (DynamoDB rejects it).
        prediction = engine.predict_for_product([2.0] * 10)

        assert prediction is not None
        assert not math.isnan(prediction["rSquared"])
        assert prediction["rSquared"] == 0.0
        assert prediction["trendLabel"] == "Stable"


class TestHandlerEndToEnd:
    def test_writes_a_recommendation_for_a_product_with_enough_history(self, dynamodb_tables):
        put_product(dynamodb_tables["products"], "P100")
        for day_offset in range(20, 0, -1):
            put_sale(dynamodb_tables["sales"], "P100", iso_days_ago(day_offset), quantity=day_offset % 5)

        result = engine.handler({}, None)

        assert result["productsProcessed"] == 1
        assert result["recommendationsWritten"] == 1
        assert result["skippedInsufficientData"] == 0

        item = dynamodb_tables["recommendations"].get_item(Key={"productId": "P100"})["Item"]
        assert item["modelVersion"] == engine.MODEL_VERSION
        assert item["trendLabel"] in {"Increasing", "Decreasing", "Stable"}
        assert "basis" in item and "Linear regression" in item["basis"]

    def test_marks_a_product_with_no_sales_as_insufficient_data(self, dynamodb_tables):
        put_product(dynamodb_tables["products"], "NEW_PRODUCT")

        result = engine.handler({}, None)

        assert result["skippedInsufficientData"] == 1
        item = dynamodb_tables["recommendations"].get_item(Key={"productId": "NEW_PRODUCT"})["Item"]
        assert item["trendLabel"] == "Insufficient data"
        assert item["predictedDemand"] == 0

    def test_marks_a_product_with_fewer_than_minimum_days_as_insufficient_data(self, dynamodb_tables):
        put_product(dynamodb_tables["products"], "P200")
        for day_offset in range(3, 0, -1):  # only 3 days, minimum is 7
            put_sale(dynamodb_tables["sales"], "P200", iso_days_ago(day_offset), quantity=1)

        engine.handler({}, None)

        item = dynamodb_tables["recommendations"].get_item(Key={"productId": "P200"})["Item"]
        assert item["trendLabel"] == "Insufficient data"

    def test_processes_multiple_products_independently(self, dynamodb_tables):
        put_product(dynamodb_tables["products"], "P100")
        put_product(dynamodb_tables["products"], "P200")
        for day_offset in range(20, 0, -1):
            put_sale(dynamodb_tables["sales"], "P100", iso_days_ago(day_offset), quantity=2)
        # P200 has no sales at all.

        result = engine.handler({}, None)

        assert result["productsProcessed"] == 2
        assert result["recommendationsWritten"] == 1
        assert result["skippedInsufficientData"] == 1
