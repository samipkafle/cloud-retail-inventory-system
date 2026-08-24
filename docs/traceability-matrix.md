# Requirements Tracebility Matrix


| Requirement | Feature                   |Endpoint                   | Implementation                        | Owner         |
|-------------|---------------------------|---------------------------|---------------------------------------|---------------|
| FR-09       | Smart Restocking Forecast | GET /forecast/{productId} |14-day sales velocity + reorder logic  |Anish/Samip    |
| FR-10       | AI Demand Insights        | GET /recommendations      |Demand prediction, trend and ranking   |Anish/Samip    |
| FR-11       | Insights Dashboard        | GET /recommendations      |Bar/Pie/trend visualiasation           | Virasanh      |