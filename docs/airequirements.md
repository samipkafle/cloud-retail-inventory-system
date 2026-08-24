# AI and Smart Restocking Requirements

## FR-09 Smart Restocking Forecast

  ### Purpose
    The Smart Restocking Forecast supports inventory decision-making by analysing recent product sales and current stock levels.
    The feature uses the previous 14 days of sales history to calculate the average daily sales velocity for a product. This value is then used with the current inventory level to provide a suggested reorder quantity.
    The feature is intended as decision support for store managers and does not automatically place purchase orders. 
  ### Inputs
    The forecast requires the following data:
    
| Input            | Source  | Description                                                  |
|------------------|---------|--------------------------------------------------------------|
| productId        | Product | Identifies the product being forecast                        |
| quantityOnHand   | Product | Current available stock                                      |
| reorderThreshold | Product | Stock level at which the product is considered low           |
| quantitySold     | Sale    | Number of units sold in each sale                            |
| soldAt           | Sale    | Timestamp used to identify sales within the previous 14 days |


### Calculation Requirements
    ### 14-Day Sales Velocity
    For each product, the system will total the quantity sold during the previous 14 days.
    Daily sales velocity is calculated as:
    Daily sales velocity = Total quantity sold during previous 14 days / 14
    Example: If product P-0001 sold 98 units during the previous 14 days:
    Daily sales velocity = 98/14 = 7 units per day

    ### Reorder quantity
    The final reorder calculation will use:
    - recent 14-day sales velocity;
    - current quantity on hand;
    - a defined future demand period;
    - an agreed safety-stock or buffer rule, if used.
    The exact reorder formula will be confirmed by the team before implementation. 
### Design Decisions to Confirm 
    1. Forecast Period 
    2. Safety-stock approach
    3. Behaviour with fewer than 14 days of history.
    4. Behaviour when no sales exist.
    5. Behaviour when current stock is sufficient.
    6. Whether reorderThresold should influence the final calculations.

### Output
    The forecast should provide sufficient information for the manager to understand the recommendation.
    Proposed output fields:
    | Output                     | Description                                            |
    |----------------------------|--------------------------------------------------------|
    | productId                  | Product being analysed                                 |
    | currentStock               | Current quantity on hand                               |
    | totalSales14Days           | Total quantity sold during the previous 14 days        |
    | dailySalesVelocity         | Average units sold per day during the previous 14 days |
    | recommendedReorderQuantity | Suggested quantity to reorder                          |

### Edge Cases
    The implementation must define behaviour for the following conditions:
    - No sales during previous 14 days.
    - Fewer than 14 days of sales history.
    - Product does not exist.
    - Current stock is zero.
    - Current stock is already sufficient.
    - Sales history contains invalid or missing values.
    - quantitySold is zero or negative.
    - Current stock is below the reorder threshold.
    - Extremely high recent sales produce a large reorder recommendation.

## FR-10 AI Demand Insights Engine

### Purpose
    The AI demand insights engine analyses historical product sales to identify demand patterns and support inventory planning.
    The engine will use historical sales information to estimate product demand, identify whether the demand is rising, stable or falling, and rank products according to likely demand.
    Demand insights will be generated for different analysis periods, including weekly, monthly and seasonal views.
    The recommendations are intended to support management decisions and should not be treated as guaranteed future demand.
### Data Sources
    The ai should use the existing Product and Sale data.
    The SAD defines Sale data using:
    - saleID
    - productID
    - quantitySold
    - soldAt

    and Product data including:
    - productID
    - name
    - category
    - unitPrice
    - reorderThreshold
    - quantityOnHand
### Inputs
    The demand insights engine will primarily use historical Sale record together

    | Input            | Source         | Purpose                                                                      | 
    |------------------|----------------|------------------------------------------------------------------------------| 
    | productId        | Sale / Product | Identifies the product                                                       | 
    | quantitySold     | Sale           | Measures historical demand                                                   | 
    | soldAt           | Sale           | Provides date and time information for weekly, monthly and seasonal analysis | 
    | category         | Product        | Allows category-based demand analysis                                        | 
    | quantityOnHand   | Product        | Provides current inventory context                                           | 
    | reorderThreshold | Product        | Provides additional stock-planning context                                   |

### Analysis Periods
    The recommendation engine should support the following demand-analysis periods:
    ### Weekly
    Analyses recent sales patterns at a weekly level and identifies products with strong short-term demand.
    ### Monthly
    Aggregates sales by month to identify broader product-demand patterns.
    ### Seasonal
    Groups historical sales into seasonal periods to identify products that experience stronger or weaker demand during different parts of the year.

### Outputs
    The recommendation engine should produce demand information for each analysed product.
    | Output          | Description                                                            | 
    |-----------------|------------------------------------------------------------------------| 
    | productId       | Product associated with the recommendation                             |
    | predictedDemand | Estimated future demand score or number of units                       | 
    | trendLabel      | Demand direction: Rising, Stable or Falling                            | 
    | modelVersion    | Version of the model that generated the recommendation                 | 
    | period          | Analysis period such as week, month or season                          | 
    | rank            | Position of the product relative to other products by predicted demand |
    Note: period and rank are proposed implementation fields and should be confirmed with the backend developer before the API structure is finalised.

### Trend Classification 
    The engine will classsify each product's demand trend using one of three labels:
    - Rising - demand is increasing.
    - Stable - demand is relatively consistent.
    - Falling - demand is decreasing.
    The exact rule or model logic used to determine Rising, Stable and Falling will be finalised during feature-engineering and model-development stages.

### Planned Features
    The follwing features will be investigated during model development:
    - sales during the previious 7 days;
    - sales during the previous 14 days;
    - sales during the previous 30 days;
    - previous-period sales;
    - average daily sales;
    - average weekly sales;
    - recent sales velocity;
    - sales growth rate;
    - month;
    - week of year;
    - day-of-week patterns;
    - product category.

#### Sorce Data
    The feature-engineering process will use data from the existing Product and Sale entities. 
    Sale data provides: 
    - productId 
    - quantitySold 
    - soldAt 
    Product data provides: 
    - productId 
    - category 
    - quantityOnHand 
    - reorderThreshold 
    The Product and Sale datasets will be linked using productId.

#### salesLast7Days

    Total quantity of a product sold during the most recent seven-day period.

    Purpose: Captures very recent short-term demand.

    Example:

    Suppose Milk sold:

    Monday       7
    Tuesday      8
    Wednesday    5
    Thursday     9
    Friday      10
    Saturday    12
    Sunday      11

    Then:

    salesLast7Days = 7 + 8 + 5 + 9 + 10 + 12 + 11 = 62

    So: salesLast7Days = 62

#### salesLast14Days
    Total quantity sold during the most recent 14-day period. Purpose: Measures recent demand and supports comparison with the smart-restocking sales-velocity calculation.
    Example:
    Last 14 days total sales = 120
    Therefore:
    salesLast14Days = 120

#### previous14DaySales
    Total quantity sold during the 14-day period immediately before the most recent 14-day period. Purpose: Provides a comparison period for identifying whether demand is increasing, decreasing or remaining stable.
    Example:
    Previous 14 days = 80 units
    Recent 14 days = 120 units
    This indicates demand has increased.

#### averageDailySales
    Average number of units sold per day during a selected recent period. Purpose: Provides a normalised measure of product demand that is easier to compare across products.
    Example:
    14-day sales = 98
    Then:
    averageDailySales = 98 / 14
    Result:
    averageDailySales = 7

#### salesVelocity
    The average rate at which a product has been sold during a recent period.
    For the smart-restocking component, the principal recent-sales velocity is based on the previous 14 days.
    Purpose: Helps measure how quickly inventory is moving and provides useful information for demand analysis.
    For example:
    140 units sold / 14 days
    gives:
    salesVelocity = 10 units/day

#### salesGrowthRate
    Percentage change between recent sales and sales from the previous comparable period. Purpose: Helps identify whether demand for a product is increasing, remaining relatively stable or decreasing.
    For design purposes, the basic calculation could be represented as:

    Growth Rate = (Recent Period Sales - Previous Period Sales) / Previous Period Sales * 100

    Example:
    Recent 14 days = 120
    Previous 14 days = 100
    Then:
    (120 - 100) / 100 × 100
    Result:
    salesGrowthRate = 20%
    That indicates demand has grown relative to the previous period.

#### month
    Calendar month extracted from the soldAt timestamp.
    Purpose: Allows the model to identify recurring monthly or seasonal demand patterns.
    For example:
    soldAt = 2026-08-17T14:30:00
    becomes:
    month = 8
    Another:
    2026-12-10
    becomes:
    month = 12
    This is useful for products whose demand changes during different times of year.

#### weekOfYear
    Calendar week extracted from the sales timestamp.
    Purpose: Supports weekly demand analysis and allows the model to identify changes between different weeks of the year.
    For example:
    Week 10
    Week 11
    Week 12
    Week 13
    can be compared to find changes in product demand.

#### dayOfWeek
    Day of the week extracted from the soldAt timestamp.

    Purpose: Allows the system to identify recurring weekday and weekend sales patterns.

    For example, a soft-drink product might show:

    Monday       4
    Tuesday      5
    Wednesday    5
    Thursday     7
    Friday      12
    Saturday    18
    Sunday      15

    That would indicate a possible weekend-demand pattern.

#### category
    Product category obtained from the Product entity.
    Purpose: Allows the model to identify demand relationships between similar product types and supports category-level analysis.
    The SAD currently defines examples such as:
    Produce
    Dairy
    Bakery
    Pantry
    Frozen
    Household
    Other

    For example:
    P-0001 → Dairy
    P-0002 → Bakery
    P-0003 → Frozen

#### quantityOnHand
    Current product inventory.
    quantityOnHand may be used when combining demand insights with restocking recommendations. It will not automatically be treated as a demand-prediction feature unless model experimentation shows a valid reason to use it.
    This helps keep your model logically clean.
    For example:
    Predicted demand = 80
    Current stock = 20
    Then the restocking component can use both values to produce a recommendation.

#### reorderThreshold
    Minimum preferred stock level stored with the Product entity.
    This value is primarily relevant to inventory and restocking decisions rather than demand prediction. It may be combined with predicted demand when generating restocking recommendations.

#### Planned Feature Summary

    | Feature            | Derived From             | Purpose                      | 
    |--------------------|--------------------------|------------------------------| 
    | salesLast7Days     | quantitySold + soldAt    | Recent short-term demand     | 
    | salesLast14Days    | quantitySold + soldAt    | Recent demand and velocity   | 
    | previous14DaySales | quantitySold + soldAt    | Previous-period comparison   | 
    | salesLast30Days    | quantitySold + soldAt    | Longer recent-demand pattern | 
    | averageDailySales  | historical sales         | Average demand per day       | 
    | averageWeeklySales | historical sales         | Average weekly demand        | 
    | salesVelocity      | historical sales         | Rate at which product sells  |
    | salesGrowthRate    | recent vs previous sales | Detect demand change         | 
    | month              | soldAt                   | Monthly/seasonal patterns    | 
    | weekOfYear         | soldAt                   | Weekly patterns              | 
    | dayOfWeek          | soldAt                   | Weekday/weekend patterns     |
    | category           | Product.category         | Product-category patterns    | 
    | quantityOnHand     | Product                  | Inventory context            | 
    | reorderThreshold   | Product                  | Restocking context           |

### Initial Feature Set
    The first model experiment will use a smaller set of core features before additional features are introduced. 
    Proposed initial features:
    - salesLast7Days 
    - salesLast14Days 
    - previous14DaySales 
    - averageDailySales 
    - salesGrowthRate 
    - month 
    - category 
    Additional features will be tested later if required.

### Feature Decisions to Confirm 
    The following decisions will be finalised during model development: 
    1. Which features will be included in the final model. 
    2. Whether current stock should influence demand prediction or only restocking. 
    3. How categorical product data will be encoded. 
    4. How missing historical periods will be handled. 
    5. How salesGrowthRate will be calculated when previous sales are zero. 
    6. How many historical months will be used for training. 
    7. Whether extreme sales spikes should be capped or retained. 
    8. Whether weekly, monthly and seasonal models use the same feature set.

### Model Approach
    The recommendation engine will use Python with pandas for data processing and scikit-learn for lightweight machine-learning development.
    The model will analyse historical features and generate demand insights for each product.
    The exact scikit-learn algorithm will be selected during experimentation and evaluation rather than fixed during the requirements stage.

### Product Ranking 
    Products should be ranked according to their predicted demand for selected analysis period.
    The product with the highest predicted demand should appear first, followed by products with lower predicted demand.
    This rankings will be used by the insights dashboard to highlight high-demand products.

### API Integration 
    Demand recommendation will be made available to the application through:
    GET /recommendations
    The endpoint should return ranked demand recommendation that can be displayed by the Insights Dashborad.

### Planned Execution Flow 
    The recommendation engine is planned to run as a scheduled Python Lamda function.
    The high-level process is:
    1. EventBridge triggers the recommendation function.
    2. The Lambda function retrieves historical sales informaiton.
    3. pandas is used for data aggregation and feature engineering.
    4. The scikit-learn model generates demand insights.
    5. Recommendations are written to the ProductRecommendations DynamoDB table.
    6. GET /recommendations makes the stored recommendations available to the frontend.

### Edge Cases
    The implementation should define behaviour for:
    - no historical sales data;
    - very limited sales history;
    - new products with no previous sales;
    - missing or invalid quantitySold values;
    - missing timestamps;
    - products that have been archived;
    - products with almost identical sales patterns;
    - large temporary sales spikes;
    - seasonal products;
    - products with prolonged zero demand;
    - model predictions that cannot be generated.

### Acceptance Criteria
    FR-10 will be considered successfully implemented when:
    - Historical sales can be processed for demand analysis.
    - Relevant sales features can be generated for each product.
    - The model generates a demand result for products with sufficient data.
    - Products can be labelled Rising, Stable or Falling.
    - Products can be ranked according to predicted demand.
    - Weekly demand insights can be generated. 
    - Monthly demand insights can be generated. 
    - Seasonal demand insights can be generated. 
    - Results can be stored with a model version. 
    - Recommendations can be retrieved through GET /recommendations. 
    - Missing or insufficient data is handled without application failure. 
    - Recommendations are presented as decision support rather than guaranteed outcomes.

### Design Decisions to Confirm
    1. How will week, month and season be selected by the API? 
    2. How will seasons be defined? 
    3. Which ML algorithm will be used for the final model? 
    4. How will predictedDemand be calculated? 
    5. How will Rising, Stable and Falling training labels be generated? 
    6. How much historical sales data is required before a prediction is allowed? 
    7. What fallback should be used when insufficient sales history exists? 
    8. How frequently should EventBridge run the recommendation engine? 
    9. Should model training happen inside Lambda or should a pre-trained model be loaded? 
    10. What exact JSON structure will GET /recommendations return?

## DynamoDB and AI Data Mapping
    |AI requirement           |	DynamoDB source     |	Field          |
    |-------------------------|---------------------|------------------|
    |Identify product         |	Product/Sale        | productId        |
    |Product category         |	Product	            | category         |
    |Current stock            |	Product             | quantityOnHand   |
    |Low-stock threshold      |	Product	            | reorderThreshold |
    |Historical quantity sold |	Sale	            | quantitySold     |
    |Sale date/time	          | Sale                | soldAt           |
    |7-day demand	          |Calculated from Sale | Derived          |
    |14-day demand	          |Calculated from Sale | Derived          |
    |Sales velocity	          |Calculated from Sale | Derived          |
    |Growth rate	          |Calculated from Sale | Derived          |
    |Predicted demand         |AI model	            | predictedDemand  |
    |Demand trend	          |AI model	            | trendLabel       |
    |Model tracking	          |AI model	            | modelVersion     |

## Confirmed DynamoDB Alignment
    The AI component will use the same Product and Sale structures as the backend. 
    Product: 
    - productId 
    - name 
    - category 
    - unitPrice 
    - reorderThreshold 
    - quantityOnHand 
    Sale: 
    - saleId 
    - productId 
    - quantitySold 
    - soldAt 
    AI features such as salesLast14Days and salesGrowthRate will be derived during feature engineering and will not require additional attributes in the Sale table.
## FR-11 Insights Dashboard Data Requirements