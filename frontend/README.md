# GreenLeaf Frontend

This is the frontend for the Cloud-Based Retail Inventory and Sales Monitoring System.

It supports current backend API:

- `GET /products`
- `POST /products`
- `GET /products/{productId}`
- `PUT /products/{productId}`
- `DELETE /products/{productId}`

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
      storage.js
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

- js/config.js Stores shared settings and the current application state. AWS API URL, selected role, product list, sample products and current page.

- js/storage.js Safely reads and writes data using browser local storage. Saving sales history so it remains after refreshing the browser.

- js/utils.js Contains small reusable helper functions used by multiple files. Formatting $15.50, escaping HTML, creating icons or downloading a CSV file.

- js/api.js Sends product requests to API Gateway or manages products in sample-data mode. Calling GET /products, POST /products, PUT /products/ID or DELETE /products/ID.
- js/inventory.js Performs inventory and sales calculations. Calculating inventory value, stock status, sales totals and suggested restock quantities.

- js/ui.js Controls interactive interface elements that are not responsible for displaying complete pages. Opening modals, showing loading screens, displaying notifications and changing roles.
- js/render.js Takes the current data and displays it inside the HTML. Building the product table, dashboard metrics, sales chart, alert list and reports.


## How To Run It

Simple way:

1. Open the `frontend` folder in VS Code.
2. Open `index.html`.
3. Right click inside the file.
4. Choose `Open with Live Server`.

If you do not have Live Server:

1. Open `frontend/index.html`.
2. Double click the file.
3. It will open in your browser.

