# GreenLeaf Frontend

This is the frontend for the Cloud-Based Retail Inventory and Sales Monitoring System.

It supports current backend API:

- `GET /products`
- `POST /products`
- `GET /products/{productId}`
- `PUT /products/{productId}`
- `DELETE /products/{productId}`
- `GET /sales`
- `POST /sales`
- `GET /activities`
- `POST /activities`

## Folder Structure

```text
frontend/
  index.html
  style.css
  script.js
  README.md
    js/
      app.js
      config.js
      actions.js
      utils.js
      api.js
      inventory.js
      ui.js
      render.js
  
```

## What Each File Does

`index.html`

- Creates the website structure and content: login screen, sidebar, dashboard pages, tables, forms, buttons and modals. It also loads style.css and script.js.

`style.css`

- Controls the website’s appearance: colours, fonts, spacing, cards, tables, buttons, animations, mobile layout and responsive design.

`script.js`

- Starts the JavaScript application. It imports initialise() from js/app.js and runs it after the HTML finishes loading.

`Module(js Folder)`


- js/app.js Starts the application and connects HTML elements to JavaScript functions. It also manages the prototype login and navigation.

- js/actions.js Handles major user actions and coordinates the other files. Adding, editing, deleting or restocking a product; recording a sale; exporting CSV files.

- js/config.js Stores the default AWS API URL and temporary in-memory application state.

- js/utils.js Contains small reusable helper functions used by multiple files. Formatting $15.50, escaping HTML, creating icons or downloading a CSV file.

- js/api.js Sends product, sales and activity requests to API Gateway.
- js/inventory.js Performs inventory and sales calculations. Calculating inventory value, stock status, sales totals and suggested restock quantities.

- js/ui.js Controls interactive interface elements that are not responsible for displaying complete pages. Opening modals, showing loading screens, displaying notifications and changing roles.
- js/render.js Takes the current data and displays it inside the HTML. Building the product table, dashboard metrics, sales chart, alert list and reports.


## How To Run It

### AWS-only product data

The frontend uses each product's `category` and `reorderThreshold` returned by
`GET /products`. The product table, low-stock badges, forecast, restock actions,
edit form and inventory CSV all read those AWS-backed fields. Creating or editing
a product sends both fields to DynamoDB through the product API.

The frontend does not use browser local storage or provide a sample-data mode.
The configured API address and prototype login exist only in memory and reset
when the page is refreshed. Products, sales and audit activities are reloaded
from AWS.

### Shared audit history

Product, sale, deletion and restock actions are written to the
`RetailActivities` DynamoDB table through `POST /activities`. Every device loads
the newest shared entries through `GET /activities`. The audit log shows the
day, month, year and local display time. Existing activity that was saved only
in a browser is not migrated automatically.

Refresh each device to load changes made elsewhere. There is no background
real-time synchronization. The forecast formula and its existing time window
are unchanged.


### Start the frontend

http://cdkstack-frontendbucketefe2e19c-en3qvtbjhicm.s3-website-ap-southeast-2.amazonaws.com/

