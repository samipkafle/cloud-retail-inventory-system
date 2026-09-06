"""Demand recommendation engine (FR-10).

Runs on a daily EventBridge schedule (see RecommendationSchedule in
cdk-stack.ts). For each product, fits an ordinary-least-squares linear trend
to its daily sales history and writes a demand recommendation — framed as
decision support with a stated basis, not an automated directive, per the
SAD report's AI ethics/risk-mitigation position (a manager can see exactly
why a number was suggested and override it).

Uses numpy rather than the SAD report's original scikit-learn choice:
scikit-learn has no public Lambda layer for ap-southeast-2 on a current
runtime (see docs/requirements.md for the documented substitution).
numpy.polyfit performs the same simple-linear-regression math scikit-learn's
LinearRegression would for a single feature (day index) — it's what
LinearRegression itself calls down to (numpy.linalg.lstsq) for this case.
pandas and scipy were tried first but pushed the combined Lambda layer size
over the 250MB unzipped limit; numpy alone comfortably fits.
"""

import json
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import boto3
import numpy as np

dynamodb = boto3.resource("dynamodb")

PRODUCTS_TABLE_NAME = os.environ["PRODUCTS_TABLE_NAME"]
SALES_TABLE_NAME = os.environ["SALES_TABLE_NAME"]
RECOMMENDATIONS_TABLE_NAME = os.environ["RECOMMENDATIONS_TABLE_NAME"]

MODEL_VERSION = "trend-linreg-v1"
MIN_DAYS_OF_HISTORY = 7
FORECAST_HORIZON_DAYS = 14
# Daily-unit slope below this magnitude is treated as noise, not a real trend.
TREND_SLOPE_THRESHOLD = 0.05


def scan_all(table):
    items = []
    response = table.scan()
    items.extend(response.get("Items", []))
    while "LastEvaluatedKey" in response:
        response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
        items.extend(response.get("Items", []))
    return items


def parse_sale(item):
    return {
        "productId": item["productId"],
        "soldAt": datetime.fromisoformat(item["soldAt"]),
        "quantitySold": float(item["quantitySold"]),
    }


def build_daily_series(sales, product_id):
    """Returns a zero-filled list of per-day totals (oldest to newest),
    covering the full span from the product's first to last sale, or None
    if it has never sold."""
    product_sales = [sale for sale in sales if sale["productId"] == product_id]
    if not product_sales:
        return None

    daily_totals = {}
    for sale in product_sales:
        day = sale["soldAt"].date()
        daily_totals[day] = daily_totals.get(day, 0.0) + sale["quantitySold"]

    start_day = min(daily_totals)
    end_day = max(daily_totals)
    span_days = (end_day - start_day).days + 1

    return [
        daily_totals.get(start_day + timedelta(days=offset), 0.0)
        for offset in range(span_days)
    ]


def predict_for_product(daily_series):
    days_of_history = len(daily_series)
    if days_of_history < MIN_DAYS_OF_HISTORY:
        return None

    x = np.arange(days_of_history, dtype=float)
    y = np.array(daily_series, dtype=float)

    # Ordinary least squares — the same math scikit-learn's LinearRegression
    # uses internally (via numpy.linalg.lstsq) for a single feature.
    slope, intercept = np.polyfit(x, y, 1)

    # The correlation coefficient (and so R²) is undefined (NaN) when y has
    # zero variance — e.g. a product that sold exactly the same quantity
    # every day. The line still fits perfectly in that case; there's just
    # no correlation to compute, so treat it as "no explanatory power"
    # rather than let NaN reach DynamoDB (which rejects NaN/Infinity).
    if np.std(y) == 0:
        r_squared = 0.0
    else:
        correlation = np.corrcoef(x, y)[0, 1]
        r_squared = 0.0 if np.isnan(correlation) else float(correlation) ** 2

    future_x = np.arange(days_of_history, days_of_history + FORECAST_HORIZON_DAYS, dtype=float)
    predicted_daily = intercept + slope * future_x
    predicted_demand = max(0.0, float(np.mean(predicted_daily)) * FORECAST_HORIZON_DAYS)

    if slope > TREND_SLOPE_THRESHOLD:
        trend_label = "Increasing"
    elif slope < -TREND_SLOPE_THRESHOLD:
        trend_label = "Decreasing"
    else:
        trend_label = "Stable"

    return {
        "predictedDemand": round(predicted_demand, 2),
        "trendLabel": trend_label,
        "rSquared": round(r_squared, 4),
        "daysOfHistory": days_of_history,
    }


def to_decimal(value):
    # boto3's Table resource rejects native float; round-tripping through
    # str avoids binary-float artifacts (e.g. Decimal(0.1) != Decimal("0.1")).
    return Decimal(str(value))


def build_recommendation_item(product_id, prediction, generated_at):
    if prediction is None:
        return {
            "productId": product_id,
            "predictedDemand": 0,
            "trendLabel": "Insufficient data",
            "modelVersion": MODEL_VERSION,
            "generatedAt": generated_at,
            "basis": f"Fewer than {MIN_DAYS_OF_HISTORY} days of recorded sales history",
            "daysOfHistory": 0,
        }

    return {
        "productId": product_id,
        "predictedDemand": to_decimal(prediction["predictedDemand"]),
        "trendLabel": prediction["trendLabel"],
        "modelVersion": MODEL_VERSION,
        "generatedAt": generated_at,
        "basis": (
            f"Linear regression over {prediction['daysOfHistory']} days of daily "
            f"sales (R²={prediction['rSquared']})"
        ),
        "daysOfHistory": prediction["daysOfHistory"],
        "rSquared": to_decimal(prediction["rSquared"]),
    }


def handler(event, context):
    products_table = dynamodb.Table(PRODUCTS_TABLE_NAME)
    sales_table = dynamodb.Table(SALES_TABLE_NAME)
    recommendations_table = dynamodb.Table(RECOMMENDATIONS_TABLE_NAME)

    products = scan_all(products_table)
    sales = [parse_sale(item) for item in scan_all(sales_table)]
    generated_at = datetime.now(timezone.utc).isoformat()

    written = 0
    skipped = 0

    with recommendations_table.batch_writer(overwrite_by_pkeys=["productId"]) as batch:
        for product in products:
            product_id = product["productId"]
            daily_series = build_daily_series(sales, product_id)
            prediction = predict_for_product(daily_series) if daily_series is not None else None

            batch.put_item(Item=build_recommendation_item(product_id, prediction, generated_at))

            if prediction is None:
                skipped += 1
            else:
                written += 1

    summary = {
        "message": "Recommendation run complete",
        "productsProcessed": len(products),
        "recommendationsWritten": written,
        "skippedInsufficientData": skipped,
        "generatedAt": generated_at,
    }
    print(json.dumps(summary))
    return summary
