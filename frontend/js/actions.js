import { state, STORAGE_KEYS } from "./config.js";
import { saveJson } from "./storage.js";
import { $, formatMoney, normaliseProduct, downloadCsv } from "./utils.js";
import {
  ensureProductMetadata,
  setMetadata,
  getMetadata,
  getStockStatus,
  getForecasts,
  addActivity,
} from "./inventory.js";
import {
  apiRequest,
  readDemoProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  friendlyApiError,
} from "./api.js";
import {
  showLoading,
  hideLoading,
  showToast,
  setFormError,
  setConnectionStatus,
  recordMonitorEvent,
  closeModal,
} from "./ui.js";
import { renderAll } from "./render.js";

// Loads products from the AWS API or sample-data storage. GET Function
export async function loadProducts({ showLoader = true } = {}) {
  if (showLoader) showLoading("Loading inventory…");
  $("#apiErrorPanel").hidden = true;
  setConnectionStatus("checking", "Checking backend…");

  try {
    const startedAt = performance.now();

    if (state.mode === "demo") {
      state.products = readDemoProducts();
      state.lastResponseMs = 0;
      setConnectionStatus("demo", "Sample data mode");
      recordMonitorEvent("success", "Sample inventory loaded", 0);
    } else {
      const response = await apiRequest("/products");

      if (!Array.isArray(response)) {
        throw new Error("GET /products did not return a product list.");
      }

      state.products = response
        .map(normaliseProduct)
        .filter((product) => product.productId);
      state.lastResponseMs = Math.round(performance.now() - startedAt);
      setConnectionStatus("connected", "AWS API connected");
      recordMonitorEvent(
        "success",
        `GET /products returned ${state.products.length} product${
          state.products.length === 1 ? "" : "s"
        }`,
        state.lastResponseMs,
      );
    }

    state.lastCheckedAt = new Date().toISOString();
    ensureProductMetadata();
    renderAll();
    return true;
  } catch (error) {
    const message = friendlyApiError(error);
    state.lastCheckedAt = new Date().toISOString();
    state.lastResponseMs = null;
    setConnectionStatus("error", "API connection failed");
    $("#apiErrorText").textContent = message;
    $("#apiErrorPanel").hidden = false;
    recordMonitorEvent("error", message);
    renderAll();
    return false;
  } finally {
    if (showLoader) hideLoading();
  }
}

// Validates the product form and creates or updates a product. POST or PUT Function
export async function handleProductSubmit(event) {
  event.preventDefault();
  setFormError("#productFormError");

  const productId = $("#productIdInput").value.trim();
  const name = $("#productNameInput").value.trim();
  const price = Number($("#productPriceInput").value);
  const stock = Number($("#productStockInput").value);
  const category = $("#productCategoryInput").value;
  const reorderLevel = Number($("#productReorderInput").value);

  if (!productId || !name) {
    setFormError("#productFormError", "Product ID and name are required.");
    return;
  }

  if (!Number.isFinite(price) || price < 0) {
    setFormError("#productFormError", "Enter a valid price of zero or more.");
    return;
  }

  if (
    !Number.isInteger(stock) ||
    stock < 0 ||
    !Number.isInteger(reorderLevel) ||
    reorderLevel < 0
  ) {
    setFormError(
      "#productFormError",
      "Stock and reorder level must be whole numbers of zero or more.",
    );
    return;
  }

  if (
    !state.editingProductId &&
    state.products.some(
      (product) => product.productId.toLowerCase() === productId.toLowerCase(),
    )
  ) {
    setFormError("#productFormError", "That product ID is already in use.");
    return;
  }

  const isEditing = Boolean(state.editingProductId);
  showLoading(isEditing ? "Saving product changes…" : "Adding product…");

  try {
    if (isEditing) {
      await updateProduct(state.editingProductId, { name, price, stock });
      setMetadata(state.editingProductId, { category, reorderLevel });
      addActivity("stock", "Product updated", `${name} (${state.editingProductId})`);
    } else {
      await createProduct({ productId, name, price, stock });
      setMetadata(productId, { category, reorderLevel });
      addActivity("stock", "Product added", `${name} (${productId})`);
    }

    closeModal("productModal");
    if (state.mode === "api") await loadProducts({ showLoader: false });
    else renderAll();
    showToast(isEditing ? "Product changes saved." : "Product added to inventory.");
  } catch (error) {
    setFormError("#productFormError", friendlyApiError(error));
  } finally {
    hideLoading();
  }
}

// Validates a sale, reduces stock and records the transaction locally. PUT Function
export async function handleSaleSubmit(event) {
  event.preventDefault();
  setFormError("#saleFormError");

  const productId = $("#saleProductInput").value;
  const quantity = Number($("#saleQuantityInput").value);
  const product = state.products.find((item) => item.productId === productId);

  if (!product) {
    setFormError("#saleFormError", "Choose a product with available stock.");
    return;
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    setFormError("#saleFormError", "Quantity must be a whole number of at least one.");
    return;
  }

  if (quantity > product.stock) {
    setFormError("#saleFormError", `Only ${product.stock} units are available.`);
    return;
  }

  showLoading("Recording sale and updating stock…");

  try {
    await updateProduct(product.productId, { stock: product.stock - quantity });

    const sale = {
      id: `SALE-${Date.now().toString().slice(-8)}`,
      productId: product.productId,
      productName: product.name,
      quantity,
      unitPrice: product.price,
      total: Number((product.price * quantity).toFixed(2)),
      createdAt: new Date().toISOString(),
    };

    state.sales.unshift(sale);
    state.sales = state.sales.slice(0, 500);
    saveJson(STORAGE_KEYS.sales, state.sales);
    addActivity(
      "sale",
      "Sale recorded",
      `${quantity} × ${product.name} · ${formatMoney(sale.total)}`,
    );

    closeModal("saleModal");
    if (state.mode === "api") await loadProducts({ showLoader: false });
    else renderAll();
    showToast(`Sale recorded. ${product.stock - quantity} units remain.`);
  } catch (error) {
    setFormError("#saleFormError", friendlyApiError(error));
  } finally {
    hideLoading();
  }
}

// Deletes the selected product after confirmation. DELETE Function
export async function handleConfirmDelete() {
  const productId = state.deletingProductId;
  const product = state.products.find((item) => item.productId === productId);
  if (!product) return;

  showLoading("Deleting product…");

  try {
    await deleteProduct(productId);
    delete state.metadata[productId];
    saveJson(STORAGE_KEYS.metadata, state.metadata);
    addActivity("alert", "Product deleted", `${product.name} (${productId})`, "Attention");
    closeModal("confirmModal");

    if (state.mode === "api") await loadProducts({ showLoader: false });
    else renderAll();
    showToast("Product removed from inventory.");
  } catch (error) {
    closeModal("confirmModal");
    showToast(friendlyApiError(error), "error");
  } finally {
    state.deletingProductId = null;
    hideLoading();
  }
}

// Calculates and applies a suggested stock increase. PUT Function
export async function restockProduct(productId) {
  const product = state.products.find((item) => item.productId === productId);
  if (!product) return;

  const metadata = getMetadata(product.productId, product.name);
  const forecast = getForecasts().find((item) => item.product.productId === productId);
  const target = Math.max(
    product.stock + 1,
    metadata.reorderLevel * 3,
    forecast ? product.stock + forecast.suggested : 0,
  );
  const unitsAdded = target - product.stock;

  showLoading(`Restocking ${product.name}…`);

  try {
    await updateProduct(productId, { stock: target });
    addActivity("stock", "Restock applied", `${product.name} · +${unitsAdded} units`);

    if (state.mode === "api") await loadProducts({ showLoader: false });
    else renderAll();
    showToast(`${unitsAdded} units added to ${product.name}.`);
  } catch (error) {
    showToast(friendlyApiError(error), "error");
  } finally {
    hideLoading();
  }
}

// Exports the current inventory as a CSV report.
export function exportInventory() {
  downloadCsv(
    `greenleaf-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
    [
      "Product ID",
      "Name",
      "Category",
      "Unit price (AUD)",
      "Stock",
      "Reorder level",
      "Status",
    ],
    state.products.map((product) => {
      const metadata = getMetadata(product.productId, product.name);
      return [
        product.productId,
        product.name,
        metadata.category,
        product.price.toFixed(2),
        product.stock,
        metadata.reorderLevel,
        getStockStatus(product).label,
      ];
    }),
  );
  showToast("Inventory CSV downloaded.");
}

// Exports locally recorded sales as a CSV report.
export function exportSales() {
  downloadCsv(
    `greenleaf-sales-${new Date().toISOString().slice(0, 10)}.csv`,
    [
      "Transaction ID",
      "Date",
      "Product ID",
      "Product",
      "Quantity",
      "Unit price (AUD)",
      "Total (AUD)",
    ],
    state.sales.map((sale) => [
      sale.id,
      sale.createdAt,
      sale.productId,
      sale.productName,
      sale.quantity,
      Number(sale.unitPrice || 0).toFixed(2),
      Number(sale.total || 0).toFixed(2),
    ]),
  );
  showToast("Sales CSV downloaded.");
}

// Switches the application to locally stored sample data.
export async function useDemoMode() {
  state.mode = "demo";
  localStorage.setItem(STORAGE_KEYS.mode, state.mode);
  closeModal("apiModal");
  await loadProducts();
  showToast("Sample inventory loaded. Changes stay in this browser.");
}

// Validates and saves a new AWS API address.
export async function handleApiSubmit(event) {
  event.preventDefault();
  setFormError("#apiFormError");
  const rawUrl = $("#apiUrlInput").value.trim().replace(/\/+$/, "");

  try {
    const parsed = new URL(rawUrl);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("Invalid protocol");
  } catch (_error) {
    setFormError(
      "#apiFormError",
      "Enter a valid API Gateway URL beginning with https://.",
    );
    return;
  }

  state.apiUrl = rawUrl;
  state.mode = "api";
  localStorage.setItem(STORAGE_KEYS.apiUrl, state.apiUrl);
  localStorage.setItem(STORAGE_KEYS.mode, state.mode);
  closeModal("apiModal");

  const connected = await loadProducts();
  if (connected) showToast("AWS product API connected.");
}
