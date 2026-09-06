import { state } from "./config.js";
import {
  $,
  formatMoney,
  normaliseProduct,
  normaliseSale,
  normaliseActivity,
  downloadCsv,
} from "./utils.js";
import {
  getMetadata,
  getStockStatus,
  addActivity,
} from "./inventory.js";
import {
  apiRequest,
  createProduct,
  updateProduct,
  recordSale,
  getSales,
  getActivities,
  getForecasts,
  getRecommendations,
  getUsers,
  createUserAccount,
  deleteProduct,
  friendlyApiError,
  getTelemetrySummary,
  getTelemetryEvents,
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

// Converts shared API sales into the dashboard format and fills old missing snapshots.
function prepareSales(sales) {
  return sales
    .map((rawSale) => {
      const sale = normaliseSale(rawSale);
      const product = state.products.find(
        (item) => item.productId === sale.productId,
      );
      const hasUnitPrice = rawSale?.unitPrice !== undefined;
      const hasTotal = rawSale?.total !== undefined;

      if (!sale.productName) sale.productName = product?.name || sale.productId;
      if (!hasUnitPrice) sale.unitPrice = product?.price || 0;
      if (!hasTotal) {
        sale.total = Number((sale.unitPrice * sale.quantity).toFixed(2));
      }

      return sale;
    })
    .filter((sale) => sale.id && sale.productId && sale.createdAt)
    .sort((first, second) =>
      second.createdAt.localeCompare(first.createdAt),
    );
}

// Converts shared API activities into newest-first dashboard records.
function prepareActivities(activities) {
  return activities
    .map(normaliseActivity)
    .filter((activity) => activity.id && activity.title && activity.createdAt)
    .sort((first, second) =>
      second.createdAt.localeCompare(first.createdAt),
    )
    .slice(0, 100);
}

// Loads products, shared sales and shared activity from AWS. GET Function
export async function loadProducts({ showLoader = true } = {}) {
  if (showLoader) showLoading("Loading inventory…");
  $("#apiErrorPanel").hidden = true;
  setConnectionStatus("checking", "Checking backend…");

  try {
    const startedAt = performance.now();

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

    const salesResponse = await getSales();
    if (!Array.isArray(salesResponse)) {
      throw new Error("GET /sales did not return a transaction list.");
    }
    state.sales = prepareSales(salesResponse);

    const activitiesResponse = await getActivities();
    if (!Array.isArray(activitiesResponse)) {
      throw new Error("GET /activities did not return an audit list.");
    }
    state.activities = prepareActivities(activitiesResponse);

    // Best-effort: the Insights page degrades to an empty state without
    // this, so a forecast failure shouldn't block the rest of the dashboard.
    try {
      const forecastsResponse = await getForecasts();
      state.forecasts = Array.isArray(forecastsResponse) ? forecastsResponse : [];
    } catch (forecastError) {
      console.error("Unable to load forecasts:", forecastError);
      state.forecasts = [];
    }

    // Best-effort, same reasoning as forecasts above — a separate model
    // from the rule-based forecast (FR-10, not FR-09).
    try {
      const recommendationsResponse = await getRecommendations();
      state.recommendations = Array.isArray(recommendationsResponse) ? recommendationsResponse : [];
    } catch (recommendationError) {
      console.error("Unable to load recommendations:", recommendationError);
      state.recommendations = [];
    }

    state.lastCheckedAt = new Date().toISOString();
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

// Loads the CloudWatch-aggregated frontend health summary (all sessions),
// shown on the Monitoring page alongside this tab's own local event log.
export async function loadTelemetrySummary(minutes = 60) {
  try {
    state.telemetrySummary = await getTelemetrySummary(minutes);
    state.telemetrySummaryError = null;
  } catch (error) {
    state.telemetrySummary = null;
    state.telemetrySummaryError = friendlyApiError(error);
  }
  renderAll();
}

// Loads the most recent raw frontend events (all sessions) from the
// CloudWatch Logs Insights-backed detail log on the Monitoring page.
export async function loadTelemetryEvents(limit = 50) {
  try {
    const response = await getTelemetryEvents(limit);
    state.telemetryEvents = response?.events || [];
    state.telemetryEventsError = null;
  } catch (error) {
    state.telemetryEvents = null;
    state.telemetryEventsError = friendlyApiError(error);
  }
  renderAll();
}

// Loads the account directory (manager-only, GET /users).
export async function loadUsers() {
  try {
    const response = await getUsers();
    state.users = Array.isArray(response) ? response : [];
    state.usersError = null;
  } catch (error) {
    state.users = [];
    state.usersError = friendlyApiError(error);
  }
  renderAll();
}

// Validates the create-account form and creates a Cognito account for a
// new staff or manager sign-in (FR-01's manager-controlled account
// creation, replacing the CLI-only admin-create-user flow). POST Function
export async function handleCreateUserSubmit(event) {
  event.preventDefault();
  const email = $("#newUserEmailInput").value.trim();
  const role = $("#newUserRoleInput").value;

  setFormError("#createUserError");
  setFormError("#createUserSuccess");

  if (!email) {
    setFormError("#createUserError", "Enter an email address.");
    return;
  }

  const button = $("#createUserButton");
  button.disabled = true;

  try {
    const response = await createUserAccount(email, role);
    setFormError(
      "#createUserSuccess",
      response?.message || "Account created — a temporary password has been emailed to the user.",
    );
    $("#createUserForm").reset();
    await addActivity("stock", "Staff account created", `${email} · ${role}`);
    await loadUsers();
  } catch (error) {
    setFormError("#createUserError", friendlyApiError(error));
  } finally {
    button.disabled = false;
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
      await updateProduct(state.editingProductId, {
        name,
        category,
        price,
        stock,
        reorderThreshold: reorderLevel,
      });
      await addActivity("stock", "Product updated", `${name} (${state.editingProductId})`);
    } else {
      await createProduct({
        productId,
        name,
        category,
        price,
        stock,
        reorderThreshold: reorderLevel,
      });
      await addActivity("stock", "Product added", `${name} (${productId})`);
    }

    closeModal("productModal");
    await loadProducts({ showLoader: false });
    showToast(isEditing ? "Product changes saved." : "Product added to inventory.");
  } catch (error) {
    setFormError("#productFormError", friendlyApiError(error));
  } finally {
    hideLoading();
  }
}

// Validates a sale and records it through the shared sales API. POST Function
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
    const result = await recordSale(product.productId, quantity);

    const saleTotal = Number(
      result?.sale?.total ?? (product.price * quantity).toFixed(2),
    );
    await addActivity(
      "sale",
      "Sale recorded",
      `${quantity} × ${product.name} · ${formatMoney(saleTotal)}`,
    );

    closeModal("saleModal");
    await loadProducts({ showLoader: false });
    showToast(
      result.alertRaised
        ? `Sale recorded. ${result.remainingStock} units remain. Low-stock alert triggered.`
        : `Sale recorded. ${result.remainingStock} units remain.`,
    );
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
    await addActivity(
      "alert",
      "Product deleted",
      `${product.name} (${productId})`,
      "Attention",
    );
    closeModal("confirmModal");

    await loadProducts({ showLoader: false });
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
  const forecast = state.forecasts.find((item) => item.productId === productId);
  const target = Math.max(
    product.stock + 1,
    metadata.reorderLevel * 3,
    forecast ? product.stock + forecast.suggestedRestockQuantity : 0,
  );
  const unitsAdded = target - product.stock;

  showLoading(`Restocking ${product.name}…`);

  try {
    await updateProduct(productId, { stock: target });
    await addActivity(
      "stock",
      "Restock applied",
      `${product.name} · +${unitsAdded} units`,
    );

    await loadProducts({ showLoader: false });
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

// Exports the currently loaded shared sales as a CSV report.
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

// Validates and applies a new AWS API address for the current page session.
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
  closeModal("apiModal");

  const connected = await loadProducts();
  if (connected) showToast("AWS product API connected.");
}
