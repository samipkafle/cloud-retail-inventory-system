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
- `GET /inventory`
- `GET /alerts`
- `GET /forecast`, `GET /forecast/{productId}`
- `GET /reports`
- `GET /recommendations`
- `GET /users`, `POST /users`
- `GET /telemetry`, `POST /telemetry`, `GET /telemetry/events`

Every request above requires a real Cognito ID token — see `js/auth.js` below.

## Folder Structure

```text
frontend/
  index.html
  style.css
  script.js
  README.md
    js/
      app.js
      auth.js
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


- js/app.js Starts the application and connects HTML elements to JavaScript functions. It also manages login/logout and navigation.

- js/auth.js Signs in against the real Cognito User Pool (SRP flow), stores the ID token, and maps the token's `cognito:groups` claim to the app's manager/staff role. Login is no longer a prototype — an account has to actually exist in Cognito (see the Team page, manager-only, for creating one).

- js/actions.js Handles major user actions and coordinates the other files. Adding, editing, deleting or restocking a product; recording a sale; creating a staff/manager account; exporting CSV files.

- js/config.js Stores the default AWS API URL, the Cognito User Pool/Client IDs, and temporary in-memory application state.

- js/utils.js Contains small reusable helper functions used by multiple files. Formatting $15.50, escaping HTML, creating icons or downloading a CSV file.

- js/api.js Sends every API Gateway request (products, sales, activities, inventory, alerts, forecast, reports, recommendations, users, telemetry), attaching the Cognito ID token to each one.
- js/inventory.js Performs stock-status and sales-history calculations used by the dashboard charts. The 14-day forecast itself now comes from `GET /forecast`, not a local calculation.

- js/ui.js Controls interactive interface elements that are not responsible for displaying complete pages. Opening modals, showing loading screens, displaying notifications, and showing/hiding nav items by the signed-in user's real role.
- js/render.js Takes the current data and displays it inside the HTML. Building the product table, dashboard metrics, sales chart, alert list, AI recommendations, the Team account directory, and reports.


## How To Run It

### AWS-only product data

The frontend uses each product's `category` and `reorderThreshold` returned by
`GET /products`. The product table, low-stock badges, forecast, restock actions,
edit form and inventory CSV all read those AWS-backed fields. Creating or editing
a product sends both fields to DynamoDB through the product API.

The frontend does not use browser local storage or provide a sample-data mode.
The configured API address and Cognito session exist only in memory and reset
when the page is refreshed (a real sign-in is required again after a refresh).
Products, sales and audit activities are reloaded from AWS.

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

