# GreenLeaf Frontend

This is the frontend for the Cloud-Based Retail Inventory and Sales Monitoring System.

It supports Samip's current backend API:

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
```

## What Each File Does

`index.html`

- Creates the page structure.
- Contains the dashboard, forms, table, and buttons.

`style.css`

- Controls the design.
- Controls colors, spacing, table layout, buttons, and mobile view.

`script.js`

- Contains the frontend logic.
- Loads products.
- Adds products.
- Updates products.
- Deletes products.
- Records sales by reducing stock.
- Stops stock from going below zero.
- Shows `Sold out` instead of negative numbers.

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

## How To Connect It To Samip's Backend

After Samip deploys the AWS CDK backend, he should get an API Gateway URL.

It will look similar to this:

```text
https://abc123.execute-api.ap-southeast-2.amazonaws.com/prod
```

Paste that URL into the `API Gateway URL` box in the frontend.

Then click `Save API`.

The frontend will start calling the real AWS backend.
