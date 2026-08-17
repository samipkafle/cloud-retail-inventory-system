(() => {
  "use strict";

  const DEFAULT_API_URL =
    "https://mrfuj9l955.execute-api.ap-southeast-2.amazonaws.com/prod";

  const STORAGE_KEYS = {
    apiUrl: "greenleafApiUrl",
    mode: "greenleafDataMode",
    metadata: "greenleafProductMetadata",
    sales: "greenleafSales",
    activity: "greenleafActivity",
    session: "greenleafSession",
    demoProducts: "greenleafDemoProducts",
  };

  const ROLE_PROFILES = {
    manager: {
      name: "Maya Chen",
      title: "Store Manager",
      email: "manager@greenleaf.demo",
    },
    staff: {
      name: "Jordan Lee",
      title: "Store Staff",
      email: "staff@greenleaf.demo",
    },
    maintainer: {
      name: "Alex Morgan",
      title: "System Maintainer",
      email: "maintainer@greenleaf.demo",
    },
  };

  const DEMO_PRODUCTS = [
    { productId: "P001", name: "Fresh Full Cream Milk", price: 3.5, stock: 12 },
    { productId: "P002", name: "Wholemeal Sandwich Bread", price: 4.2, stock: 8 },
    { productId: "P003", name: "Royal Gala Apples", price: 5.9, stock: 42 },
    { productId: "P004", name: "Free Range Eggs", price: 7.8, stock: 6 },
    { productId: "P005", name: "Jasmine Rice", price: 16.5, stock: 31 },
    { productId: "P006", name: "Organic Oat Milk", price: 4.8, stock: 0 },
  ];

  const DEMO_METADATA = {
    P001: { category: "Dairy", reorderLevel: 10 },
    P002: { category: "Bakery", reorderLevel: 10 },
    P003: { category: "Produce", reorderLevel: 12 },
    P004: { category: "Dairy", reorderLevel: 8 },
    P005: { category: "Pantry", reorderLevel: 8 },
    P006: { category: "Beverages", reorderLevel: 6 },
  };

  const state = {
    apiUrl: localStorage.getItem(STORAGE_KEYS.apiUrl) || DEFAULT_API_URL,
    mode: localStorage.getItem(STORAGE_KEYS.mode) || "api",
    products: [],
    metadata: loadJson(STORAGE_KEYS.metadata, {}),
    sales: loadJson(STORAGE_KEYS.sales, []),
    activities: loadJson(STORAGE_KEYS.activity, []),
    role: "manager",
    user: ROLE_PROFILES.manager,
    currentPage: "overview",
    editingProductId: null,
    deletingProductId: null,
    lastResponseMs: null,
    lastCheckedAt: null,
    apiStatus: "checking",
    monitorEvents: [],
    toastTimer: null,
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  function loadJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.warn(`Could not read ${key} from local storage.`, error);
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Could not save ${key} to local storage.`, error);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
    }).format(Number(value) || 0);
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown time";
    return new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-AU", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function icon(name) {
    return `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
  }

  function initials(name) {
    return String(name || "Product")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join("");
  }

  function inferCategory(name) {
    const lower = String(name || "").toLowerCase();
    if (/milk|cheese|egg|yoghurt|yogurt|butter/.test(lower)) return "Dairy";
    if (/bread|roll|cake|pastry/.test(lower)) return "Bakery";
    if (/apple|banana|orange|fruit|vegetable|lettuce|tomato/.test(lower)) {
      return "Produce";
    }
    if (/juice|water|coffee|tea|drink/.test(lower)) return "Beverages";
    if (/rice|pasta|flour|sugar|cereal|sauce/.test(lower)) return "Pantry";
    if (/clean|soap|paper|bag/.test(lower)) return "Household";
    return "Other";
  }

  function getMetadata(productId, productName = "") {
    const stored = state.metadata[productId];
    if (stored) {
      return {
        category: stored.category || inferCategory(productName),
        reorderLevel: Math.max(0, Number(stored.reorderLevel) || 0),
      };
    }
    return { category: inferCategory(productName), reorderLevel: 5 };
  }

  function setMetadata(productId, metadata) {
    state.metadata[productId] = {
      category: metadata.category || "Other",
      reorderLevel: Math.max(0, Number(metadata.reorderLevel) || 0),
    };
    saveJson(STORAGE_KEYS.metadata, state.metadata);
  }

  function normaliseProduct(product) {
    return {
      productId: String(product?.productId ?? "").trim(),
      name: String(product?.name ?? "Unnamed product").trim(),
      price: Math.max(0, Number(product?.price) || 0),
      stock: Math.max(0, Math.floor(Number(product?.stock) || 0)),
    };
  }

  function getStockStatus(product) {
    const reorderLevel = getMetadata(product.productId, product.name).reorderLevel;
    if (product.stock <= 0) {
      return { key: "out", label: "Out of stock", className: "status-out" };
    }
    if (product.stock <= reorderLevel) {
      return { key: "low", label: "Low stock", className: "status-low" };
    }
    return { key: "in", label: "In stock", className: "status-good" };
  }

  function daysAgoStart(days) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (days - 1));
    return date;
  }

  function recentSales(days = 14) {
    const start = daysAgoStart(days);
    return state.sales.filter((sale) => new Date(sale.createdAt) >= start);
  }

  function productSales(productId, days = 14) {
    return recentSales(days).filter((sale) => sale.productId === productId);
  }

  function groupSalesByDay(days = 7) {
    const grouped = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      const next = new Date(date);
      next.setDate(next.getDate() + 1);
      const sales = state.sales.filter((sale) => {
        const createdAt = new Date(sale.createdAt);
        return createdAt >= date && createdAt < next;
      });
      grouped.push({
        date,
        revenue: sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
        quantity: sales.reduce((sum, sale) => sum + Number(sale.quantity || 0), 0),
        count: sales.length,
      });
    }
    return grouped;
  }

  function inventoryTotals() {
    const totals = {
      products: state.products.length,
      units: 0,
      value: 0,
      in: 0,
      low: 0,
      out: 0,
    };
    state.products.forEach((product) => {
      totals.units += product.stock;
      totals.value += product.price * product.stock;
      totals[getStockStatus(product).key] += 1;
    });
    return totals;
  }

  function addActivity(type, title, detail, status = "Completed") {
    state.activities.unshift({
      id: `ACT-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      type,
      title,
      detail,
      status,
      user: state.user.name,
      createdAt: new Date().toISOString(),
    });
    state.activities = state.activities.slice(0, 100);
    saveJson(STORAGE_KEYS.activity, state.activities);
  }

  function showLoading(message = "Loading products…") {
    $("#loadingText").textContent = message;
    $("#loadingOverlay").hidden = false;
  }

  function hideLoading() {
    $("#loadingOverlay").hidden = true;
  }

  function showToast(message, type = "success") {
    const toast = $("#toast");
    $("#toastText").textContent = message;
    toast.style.background = type === "error" ? "#7d2d28" : "#103e2c";
    toast.querySelector("span").style.background =
      type === "error" ? "#ffd7d2" : "var(--lime)";
    toast.hidden = false;
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 3600);
  }

  function setFormError(selector, message = "") {
    const element = $(selector);
    element.textContent = message;
    element.hidden = !message;
  }

  function setConnectionStatus(status, message) {
    state.apiStatus = status;
    const button = $("#connectionButton");
    button.classList.remove("connected", "error", "checking", "demo");
    button.classList.add(status);
    $("#connectionText").textContent = message;
  }

  function friendlyApiError(error) {
    if (error?.name === "AbortError") {
      return "The request timed out. Check that the API is deployed and reachable.";
    }
    if (error instanceof TypeError || /fetch|network|failed/i.test(error?.message || "")) {
      return "The browser could not call the API. Confirm the URL and enable CORS for GET, POST, PUT and DELETE in API Gateway, then deploy the API again.";
    }
    return error?.message || "The product API returned an unexpected error.";
  }

  function recordMonitorEvent(status, message, duration = null) {
    state.monitorEvents.unshift({
      status,
      message,
      duration,
      createdAt: new Date().toISOString(),
    });
    state.monitorEvents = state.monitorEvents.slice(0, 20);
    renderMonitoring();
  }

  async function apiRequest(path = "", options = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    const method = options.method || "GET";
    const url = `${state.apiUrl.replace(/\/+$/, "")}${path}`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
        mode: "cors",
      });

      const raw = await response.text();
      let data = null;
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch (_error) {
          data = raw;
        }
      }

      if (!response.ok) {
        const message =
          data && typeof data === "object" && data.message
            ? data.message
            : `API request failed (${response.status}).`;
        throw new Error(message);
      }
      return data;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function ensureProductMetadata() {
    let changed = false;
    state.products.forEach((product) => {
      if (!state.metadata[product.productId]) {
        state.metadata[product.productId] =
          DEMO_METADATA[product.productId] || {
            category: inferCategory(product.name),
            reorderLevel: 5,
          };
        changed = true;
      }
    });
    if (changed) saveJson(STORAGE_KEYS.metadata, state.metadata);
  }

  function readDemoProducts() {
    let products = loadJson(STORAGE_KEYS.demoProducts, null);
    if (!Array.isArray(products)) {
      products = DEMO_PRODUCTS.map((product) => ({ ...product }));
      saveJson(STORAGE_KEYS.demoProducts, products);
    }
    Object.entries(DEMO_METADATA).forEach(([productId, metadata]) => {
      if (!state.metadata[productId]) state.metadata[productId] = metadata;
    });
    saveJson(STORAGE_KEYS.metadata, state.metadata);
    return products.map(normaliseProduct);
  }

  async function loadProducts({ showLoader = true } = {}) {
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
          `GET /products returned ${state.products.length} product${state.products.length === 1 ? "" : "s"}`,
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

  function saveDemoProducts() {
    saveJson(STORAGE_KEYS.demoProducts, state.products);
  }

  async function createProduct(product) {
    if (state.mode === "demo") {
      state.products.push(normaliseProduct(product));
      saveDemoProducts();
      return;
    }
    await apiRequest("/products", { method: "POST", body: product });
  }

  async function updateProduct(productId, changes) {
    if (state.mode === "demo") {
      const product = state.products.find((item) => item.productId === productId);
      if (!product) throw new Error("Product not found.");
      Object.assign(product, normaliseProduct({ ...product, ...changes }));
      saveDemoProducts();
      return;
    }
    await apiRequest(`/products/${encodeURIComponent(productId)}`, {
      method: "PUT",
      body: changes,
    });
  }

  async function deleteProduct(productId) {
    if (state.mode === "demo") {
      state.products = state.products.filter((item) => item.productId !== productId);
      saveDemoProducts();
      return;
    }
    await apiRequest(`/products/${encodeURIComponent(productId)}`, {
      method: "DELETE",
    });
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => {
      modal.querySelector("input:not([disabled]), select, button")?.focus();
    }, 0);
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = true;
    if (!$$('.modal-backdrop:not([hidden])').length) {
      document.body.style.overflow = "";
    }
  }

  function showProductModal(productId = null) {
    state.editingProductId = productId;
    setFormError("#productFormError");
    $("#productForm").reset();
    $("#productStockInput").value = "0";
    $("#productReorderInput").value = "5";

    if (productId) {
      const product = state.products.find((item) => item.productId === productId);
      if (!product) return;
      const metadata = getMetadata(product.productId, product.name);
      $("#productModalTitle").textContent = "Edit product";
      $("#saveProductButton").textContent = "Save changes";
      $("#productIdInput").value = product.productId;
      $("#productIdInput").disabled = true;
      $("#productNameInput").value = product.name;
      $("#productPriceInput").value = product.price;
      $("#productStockInput").value = product.stock;
      $("#productCategoryInput").value = metadata.category;
      $("#productReorderInput").value = metadata.reorderLevel;
    } else {
      $("#productModalTitle").textContent = "Add a new product";
      $("#saveProductButton").textContent = "Add product";
      $("#productIdInput").disabled = false;
    }
    openModal("productModal");
  }

  function refreshSaleOptions(selectedProductId = "") {
    const select = $("#saleProductInput");
    const availableProducts = state.products.filter((product) => product.stock > 0);
    select.innerHTML = availableProducts.length
      ? `<option value="">Choose a product</option>${availableProducts
          .map(
            (product) =>
              `<option value="${escapeHtml(product.productId)}">${escapeHtml(product.name)} · ${product.stock} available</option>`,
          )
          .join("")}`
      : `<option value="">No products with available stock</option>`;
    select.disabled = !availableProducts.length;
    if (selectedProductId && availableProducts.some((p) => p.productId === selectedProductId)) {
      select.value = selectedProductId;
    }
    updateSaleStockHint();
  }

  function showSaleModal(productId = "") {
    setFormError("#saleFormError");
    $("#saleForm").reset();
    $("#saleQuantityInput").value = "1";
    refreshSaleOptions(productId);
    openModal("saleModal");
  }

  function updateSaleStockHint() {
    const product = state.products.find(
      (item) => item.productId === $("#saleProductInput").value,
    );
    const quantity = Math.max(1, Number($("#saleQuantityInput").value) || 1);
    const hint = $("#saleStockHint span");
    if (!product) {
      hint.textContent = "Select a product to see its available stock.";
      return;
    }
    const remaining = Math.max(0, product.stock - quantity);
    hint.textContent = `${product.stock} units available · ${remaining} will remain after this sale.`;
  }

  function openApiModal() {
    $("#apiUrlInput").value = state.apiUrl;
    setFormError("#apiFormError");
    openModal("apiModal");
  }

  function showDeleteModal(productId) {
    const product = state.products.find((item) => item.productId === productId);
    if (!product) return;
    state.deletingProductId = productId;
    $("#confirmText").textContent =
      state.mode === "demo"
        ? `This removes ${product.name} from the sample inventory in this browser.`
        : `This removes ${product.name} from DynamoDB and cannot be undone.`;
    openModal("confirmModal");
  }

  function renderAll() {
    renderOverview();
    renderInventory();
    renderSales();
    renderAlerts();
    renderInsights();
    renderReports();
    renderMonitoring();
    refreshSaleOptions();
  }

  function renderOverview() {
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    $("#todayLabel").textContent = new Intl.DateTimeFormat("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(now);
    $("#greetingTitle").textContent = `${greeting}, ${state.user.name.split(" ")[0]}`;

    const totals = inventoryTotals();
    const last14 = recentSales(14);
    const revenue = last14.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const items = last14.reduce((sum, sale) => sum + Number(sale.quantity || 0), 0);
    $("#revenueMetric").textContent = formatMoney(revenue);
    $("#itemsSoldMetric").textContent = items.toLocaleString("en-AU");
    $("#inventoryValueMetric").textContent = formatMoney(totals.value);
    $("#unitsMetric").textContent = `${totals.units.toLocaleString("en-AU")} units on hand`;
    $("#attentionMetric").textContent = String(totals.low + totals.out);

    const week = groupSalesByDay(7);
    const weekRevenue = week.reduce((sum, day) => sum + day.revenue, 0);
    const weekCount = week.reduce((sum, day) => sum + day.count, 0);
    $("#weekRevenue").textContent = formatMoney(weekRevenue);
    $("#weekSaleCount").textContent = `${weekCount} recorded sale${weekCount === 1 ? "" : "s"}`;
    renderBarChart("#weeklyBarChart", week, "revenue");

    const productTotal = Math.max(1, totals.products);
    const inPercent = Math.round((totals.in / productTotal) * 100);
    const lowPercent = Math.round((totals.low / productTotal) * 100);
    const availability = totals.products
      ? Math.round(((totals.in + totals.low) / totals.products) * 100)
      : 0;
    $("#healthDonut").style.background = `conic-gradient(var(--green) 0 ${inPercent}%, var(--amber) ${inPercent}% ${inPercent + lowPercent}%, var(--red) ${inPercent + lowPercent}% 100%)`;
    $("#availabilityPercent").textContent = `${availability}%`;
    $("#inStockCount").textContent = totals.in;
    $("#lowStockCount").textContent = totals.low;
    $("#outStockCount").textContent = totals.out;

    renderForecast();
    renderActivities();
  }

  function renderBarChart(selector, days, field) {
    const maximum = Math.max(1, ...days.map((day) => Number(day[field]) || 0));
    const todayKey = new Date().toDateString();
    $(selector).innerHTML = days
      .map((day) => {
        const value = Number(day[field]) || 0;
        const height = value ? Math.max(8, Math.round((value / maximum) * 86)) : 4;
        const title = field === "revenue" ? formatMoney(value) : `${value} items`;
        return `<div class="bar-column ${day.date.toDateString() === todayKey ? "today" : ""}" title="${escapeHtml(title)}"><span style="height:${height}%"></span><small>${day.date.toLocaleDateString("en-AU", { weekday: "short" })}</small></div>`;
      })
      .join("");
  }

  function getForecasts() {
    return state.products
      .map((product) => {
        const sales = productSales(product.productId, 14);
        const sold = sales.reduce((sum, sale) => sum + Number(sale.quantity || 0), 0);
        const daily = sold / 14;
        const metadata = getMetadata(product.productId, product.name);
        const daysRemaining = daily > 0 ? product.stock / daily : Infinity;
        const target = Math.max(
          metadata.reorderLevel * 3,
          Math.ceil(daily * 14 * 1.15),
        );
        const suggested = Math.max(0, target - product.stock);
        return { product, sold, daily, daysRemaining, suggested, metadata };
      })
      .sort((a, b) => {
        if (a.daysRemaining !== b.daysRemaining) return a.daysRemaining - b.daysRemaining;
        return b.sold - a.sold;
      });
  }

  function demandLabel(daily) {
    if (daily >= 2) return "High demand";
    if (daily >= 0.75) return "Steady demand";
    if (daily > 0) return "Emerging demand";
    return "No sales yet";
  }

  function renderForecast() {
    const forecasts = getForecasts();
    const forecast = forecasts.find((item) => item.sold > 0);
    const button = $("#forecastActionButton");
    if (!forecast) {
      $("#forecastTitle").textContent = "Record sales to build a forecast";
      $("#forecastText").textContent =
        "The recommendation uses stock levels and sales recorded during the last 14 days.";
      $("#forecastDemand").textContent = "Waiting for data";
      $("#forecastDays").textContent = "—";
      $("#forecastStock").textContent = "—";
      button.disabled = true;
      delete button.dataset.productId;
      return;
    }

    const days = Number.isFinite(forecast.daysRemaining)
      ? Math.max(0, Math.round(forecast.daysRemaining))
      : "—";
    $("#forecastTitle").textContent = `${forecast.product.name} is the next restock priority`;
    $("#forecastText").textContent = forecast.suggested
      ? `Add about ${forecast.suggested} units to cover expected demand and maintain a safety buffer.`
      : "Current stock is sufficient for the present sales pace.";
    $("#forecastDemand").textContent = demandLabel(forecast.daily);
    $("#forecastDays").textContent = typeof days === "number" ? `${days} days` : days;
    $("#forecastStock").textContent = `${forecast.product.stock} units`;
    button.disabled = forecast.suggested <= 0;
    button.dataset.productId = forecast.product.productId;
  }

  function renderActivities() {
    const container = $("#activityList");
    if (!state.activities.length) {
      container.innerHTML = `<div class="empty-state">${icon("spark")}<strong>No activity recorded yet</strong><span>Add a product or record a sale to start the audit trail.</span></div>`;
      return;
    }
    container.innerHTML = state.activities
      .slice(0, 5)
      .map((activity) => {
        const iconName = activity.type === "sale" ? "receipt" : activity.type === "alert" ? "bell" : "box";
        const className = activity.type === "sale" ? "sale" : activity.type === "alert" ? "alert" : "stock";
        return `<div class="activity-item"><span class="activity-icon ${className}">${icon(iconName)}</span><div><strong>${escapeHtml(activity.title)}</strong><small>${escapeHtml(activity.detail)}</small></div><time datetime="${escapeHtml(activity.createdAt)}">${escapeHtml(formatDateTime(activity.createdAt))}</time></div>`;
      })
      .join("");
  }

  function renderInventory() {
    const totals = inventoryTotals();
    $("#totalProductCount").textContent = totals.products;
    $("#totalUnitCount").textContent = totals.units.toLocaleString("en-AU");
    $("#inventoryLowCount").textContent = totals.low;
    $("#inventoryOutCount").textContent = totals.out;
    $("#tableSourceLabel").textContent =
      state.mode === "demo" ? "Sample data in this browser" : "AWS product API";

    const query = $("#productSearch").value.trim().toLowerCase();
    const filter = $("#stockFilter").value;
    const filtered = state.products
      .filter((product) => {
        const matchesQuery =
          !query ||
          product.name.toLowerCase().includes(query) ||
          product.productId.toLowerCase().includes(query);
        const matchesStatus = filter === "all" || getStockStatus(product).key === filter;
        return matchesQuery && matchesStatus;
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    $("#productTableBody").innerHTML = filtered
      .map((product) => {
        const status = getStockStatus(product);
        const metadata = getMetadata(product.productId, product.name);
        return `<tr><td><div class="product-cell"><span>${escapeHtml(initials(product.name))}</span><div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.productId)} · ${escapeHtml(metadata.category)}</small></div></div></td><td>${formatMoney(product.price)}</td><td><strong>${product.stock.toLocaleString("en-AU")}</strong> units</td><td>${metadata.reorderLevel} units</td><td><span class="status-pill ${status.className}">${status.label}</span></td><td><div class="table-actions"><button class="small-button" type="button" data-action="restock" data-id="${escapeHtml(product.productId)}" title="Apply suggested restock">Restock</button><button class="small-button" type="button" data-action="edit" data-id="${escapeHtml(product.productId)}" aria-label="Edit ${escapeHtml(product.name)}">${icon("edit")}</button><button class="small-button danger" type="button" data-action="delete" data-id="${escapeHtml(product.productId)}" aria-label="Delete ${escapeHtml(product.name)}">${icon("trash")}</button></div></td></tr>`;
      })
      .join("");
    $("#productEmptyState").hidden = filtered.length > 0;
    $("#tableResultCount").textContent = `Showing ${filtered.length} of ${state.products.length} product${state.products.length === 1 ? "" : "s"}`;
  }

  function renderSales() {
    const revenue = state.sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const items = state.sales.reduce((sum, sale) => sum + Number(sale.quantity || 0), 0);
    const average = state.sales.length ? revenue / state.sales.length : 0;
    $("#salesRevenueMetric").textContent = formatMoney(revenue);
    $("#transactionMetric").textContent = state.sales.length.toLocaleString("en-AU");
    $("#salesItemsMetric").textContent = items.toLocaleString("en-AU");
    $("#averageSaleMetric").textContent = formatMoney(average);

    const week = groupSalesByDay(7);
    const maximum = Math.max(1, ...week.map((day) => day.quantity));
    $("#salesBarChart").innerHTML = week
      .map((day) => {
        const height = day.quantity ? Math.max(8, Math.round((day.quantity / maximum) * 90)) : 4;
        return `<div title="${day.quantity} items · ${escapeHtml(formatMoney(day.revenue))}"><span style="height:${height}%"></span><small>${day.date.toLocaleDateString("en-AU", { weekday: "short" })}</small></div>`;
      })
      .join("");

    const list = $("#transactionList");
    if (!state.sales.length) {
      list.innerHTML = `<div class="empty-state">${icon("receipt")}<strong>No sales recorded yet</strong><span>Record a sale to reduce stock and start demand forecasting.</span></div>`;
      return;
    }
    list.innerHTML = state.sales
      .slice(0, 8)
      .map(
        (sale) =>
          `<div class="transaction-item"><span class="activity-icon sale">${icon("receipt")}</span><div><strong>${escapeHtml(sale.productName)}</strong><small>${escapeHtml(sale.id)} · ${sale.quantity} item${sale.quantity === 1 ? "" : "s"}</small></div><time datetime="${escapeHtml(sale.createdAt)}">${escapeHtml(formatDateTime(sale.createdAt))}</time><b>${formatMoney(sale.total)}</b></div>`,
      )
      .join("");
  }

  function renderAlerts() {
    const alerts = state.products
      .filter((product) => getStockStatus(product).key !== "in")
      .sort((a, b) => a.stock - b.stock);
    const label = `${alerts.length} active alert${alerts.length === 1 ? "" : "s"}`;
    $("#activeAlertLabel").textContent = label;
    $("#navAlertCount").textContent = alerts.length;
    $("#topAlertCount").textContent = alerts.length;
    $("#navAlertCount").hidden = alerts.length === 0;
    $("#topAlertCount").hidden = alerts.length === 0;

    const list = $("#alertList");
    if (!alerts.length) {
      list.innerHTML = `<div class="empty-state">${icon("check")}<strong>Inventory is healthy</strong><span>Every product is currently above its reorder level.</span></div>`;
      return;
    }
    list.innerHTML = alerts
      .map((product) => {
        const status = getStockStatus(product);
        const metadata = getMetadata(product.productId, product.name);
        const suggested = Math.max(1, metadata.reorderLevel * 3 - product.stock);
        const isOut = status.key === "out";
        return `<article class="alert-item"><span class="alert-severity ${isOut ? "critical" : "warning"}">${icon("bell")}</span><div><div class="alert-title"><strong>${escapeHtml(product.name)}</strong><span>${isOut ? "Critical" : "Warning"}</span></div><p>${isOut ? "This product is unavailable." : `Only ${product.stock} units remain.`} Suggested restock: ${suggested} units.</p><small>${escapeHtml(product.productId)} · Reorder level ${metadata.reorderLevel}</small></div><button class="small-button" type="button" data-action="restock" data-id="${escapeHtml(product.productId)}">Restock</button></article>`;
      })
      .join("");
  }

  function renderInsights() {
    const forecasts = getForecasts();
    const withSales = forecasts.filter((item) => item.sold > 0);
    const top = withSales[0];
    const confidence = withSales.length ? Math.min(92, 62 + withSales.length * 6) : 24;

    $("#insightHero").innerHTML = top
      ? `<div><span class="section-kicker">Highest restock priority</span><h2>${escapeHtml(top.product.name)} may need attention in ${Math.max(0, Math.round(top.daysRemaining))} days.</h2><p>${top.sold} units were recorded as sold during the last 14 days. The recommended safety stock is based on that sales pace and the local reorder level.</p><button type="button" data-action="restock" data-id="${escapeHtml(top.product.productId)}">Apply ${top.suggested || 0}-unit restock</button></div><div class="confidence-ring" style="background:conic-gradient(var(--lime) 0 ${confidence}%, rgba(255,255,255,.12) ${confidence}%)"><div><strong>${confidence}%</strong><span>Data confidence</span></div></div>`
      : `<div><span class="section-kicker">Forecast setup</span><h2>Record product sales to unlock demand recommendations.</h2><p>The prototype needs transaction quantities to calculate sales velocity, days of stock remaining and suggested restock quantities.</p><button type="button" class="open-sale-button">Record the first sale</button></div><div class="confidence-ring" style="background:conic-gradient(var(--lime) 0 ${confidence}%, rgba(255,255,255,.12) ${confidence}%)"><div><strong>${confidence}%</strong><span>Data confidence</span></div></div>`;

    const cards = forecasts.slice(0, 3);
    $("#recommendationGrid").innerHTML = cards.length
      ? cards
          .map((forecast, index) => {
            const days = Number.isFinite(forecast.daysRemaining)
              ? `${Math.max(0, Math.round(forecast.daysRemaining))} days`
              : "Not available";
            const copy = forecast.sold
              ? `Recent velocity is ${forecast.daily.toFixed(1)} units per day. ${forecast.suggested ? `Add ${forecast.suggested} units for a two-week buffer.` : "Stock is currently sufficient."}`
              : "No recorded sales yet. The current recommendation is based on its stock threshold.";
            return `<article class="content-card recommendation"><div class="recommendation-head"><span class="rank">0${index + 1}</span><span class="trend-tag">${escapeHtml(demandLabel(forecast.daily))}</span></div><h3>${escapeHtml(forecast.product.name)}</h3><p>${escapeHtml(copy)}</p><div class="recommendation-stats"><span><small>Days remaining</small><b>${days}</b></span><span><small>Suggested order</small><b>${forecast.suggested} units</b></span></div><button class="secondary-button" type="button" data-action="restock" data-id="${escapeHtml(forecast.product.productId)}" ${forecast.suggested <= 0 ? "disabled" : ""}>Apply restock</button></article>`;
          })
          .join("")
      : `<article class="content-card recommendation"><h3>No products available</h3><p>Add products to begin stock planning.</p></article>`;

    const week = groupSalesByDay(8);
    const maxQuantity = Math.max(1, ...week.map((day) => day.quantity));
    $("#seasonBars").innerHTML = week
      .map((day) => {
        const height = day.quantity ? Math.max(8, Math.round((day.quantity / maxQuantity) * 100)) : 4;
        return `<span style="height:${height}%" title="${day.quantity} items on ${escapeHtml(day.date.toLocaleDateString("en-AU"))}"></span>`;
      })
      .join("");
  }

  function renderReports() {
    const totals = inventoryTotals();
    const availability = totals.products
      ? Math.round(((totals.in + totals.low) / totals.products) * 100)
      : 0;
    const salesValue = state.sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    $("#reportInventoryValue").textContent = formatMoney(totals.value);
    $("#reportAvailability").textContent = `${availability}%`;
    $("#reportSalesValue").textContent = formatMoney(salesValue);
    $("#reportHeadline").textContent = totals.products
      ? `${totals.products} products are included in this inventory report`
      : "Inventory report is ready";
    $("#reportSummary").textContent = totals.products
      ? `${totals.units.toLocaleString("en-AU")} units are on hand, with ${totals.low + totals.out} product${totals.low + totals.out === 1 ? "" : "s"} requiring attention.`
      : "Connect the AWS API or use sample data to calculate current stock performance.";

    const audit = $("#auditRows");
    if (!state.activities.length) {
      audit.innerHTML = `<div class="empty-state">${icon("chart")}<strong>No audit events yet</strong><span>Product and sales changes will appear here.</span></div>`;
      return;
    }
    audit.innerHTML = state.activities
      .slice(0, 12)
      .map(
        (activity) =>
          `<div class="audit-row"><time>${escapeHtml(formatTime(activity.createdAt))}</time><strong>${escapeHtml(activity.user || "GreenLeaf user")}</strong><span>${escapeHtml(activity.title)}</span><small>${escapeHtml(activity.detail)}</small><b class="${activity.status === "Attention" ? "attention" : ""}">${escapeHtml(activity.status || "Completed")}</b></div>`,
      )
      .join("");
  }

  function renderMonitoring() {
    const statusMap = {
      connected: ["Healthy", "AWS product endpoint connected"],
      demo: ["Demo mode", "Using browser sample products"],
      error: ["Unavailable", "Check API URL and CORS"],
      checking: ["Checking", "GET /products in progress"],
    };
    const [label, detail] = statusMap[state.apiStatus] || statusMap.checking;
    $("#monitorApiStatus").textContent = label;
    $("#monitorApiDetail").textContent = detail;
    $("#monitorResponseTime").textContent =
      state.lastResponseMs === null ? "—" : state.mode === "demo" ? "Local" : `${state.lastResponseMs} ms`;
    $("#monitorProductCount").textContent = state.products.length;
    $("#monitorLastCheck").textContent = state.lastCheckedAt
      ? formatTime(state.lastCheckedAt)
      : "—";

    const log = $("#monitorLog");
    if (!state.monitorEvents.length) {
      log.innerHTML = `<div class="empty-state">${icon("cloud")}<strong>No connection checks yet</strong><span>Run a health check to call GET /products.</span></div>`;
      return;
    }
    log.innerHTML = state.monitorEvents
      .map(
        (event) =>
          `<div class="monitor-entry"><time>${escapeHtml(formatTime(event.createdAt))}</time><b class="${event.status}">${event.status === "success" ? "SUCCESS" : "ERROR"}</b><span>${escapeHtml(event.message)}</span><small>${event.duration === null ? "—" : event.duration === 0 ? "Local" : `${event.duration} ms`}</small></div>`,
      )
      .join("");
  }

  async function handleProductSubmit(event) {
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
    if (!Number.isInteger(stock) || stock < 0 || !Number.isInteger(reorderLevel) || reorderLevel < 0) {
      setFormError("#productFormError", "Stock and reorder level must be whole numbers of zero or more.");
      return;
    }
    if (
      !state.editingProductId &&
      state.products.some((product) => product.productId.toLowerCase() === productId.toLowerCase())
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

  async function handleSaleSubmit(event) {
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

  async function handleConfirmDelete() {
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

  async function restockProduct(productId) {
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

  function csvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function downloadCsv(filename, headers, rows) {
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportInventory() {
    downloadCsv(
      `greenleaf-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Product ID", "Name", "Category", "Unit price (AUD)", "Stock", "Reorder level", "Status"],
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

  function exportSales() {
    downloadCsv(
      `greenleaf-sales-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Transaction ID", "Date", "Product ID", "Product", "Quantity", "Unit price (AUD)", "Total (AUD)"],
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

  function roleCanAccess(page) {
    const button = $(`#mainNavigation [data-page="${page}"]`);
    if (!button) return page === "overview";
    return button.dataset.roles.split(",").includes(state.role);
  }

  function applyRoleVisibility() {
    $$('[data-roles]').forEach((element) => {
      element.hidden = !element.dataset.roles.split(",").includes(state.role);
    });
    const profile = ROLE_PROFILES[state.role];
    state.user = profile;
    $("#userName").textContent = profile.name;
    $("#userRole").textContent = profile.title;
    $("#userAvatar").textContent = initials(profile.name);
    if (!roleCanAccess(state.currentPage)) navigateTo("overview");
  }

  function navigateTo(page) {
    const safePage = roleCanAccess(page) ? page : "overview";
    state.currentPage = safePage;
    $$(".page").forEach((section) => {
      section.classList.toggle("active-page", section.dataset.page === safePage);
    });
    $$("#mainNavigation .nav-button").forEach((button) => {
      button.classList.toggle("active", button.dataset.page === safePage);
    });
    closeSidebar();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openSidebar() {
    $("#sidebar").classList.add("open");
    $("#sidebarScrim").hidden = false;
  }

  function closeSidebar() {
    $("#sidebar").classList.remove("open");
    $("#sidebarScrim").hidden = true;
  }

  function selectRole(role) {
    if (!ROLE_PROFILES[role]) return;
    state.role = role;
    $$("#roleSwitch [data-role]").forEach((button) => {
      button.classList.toggle("active", button.dataset.role === role);
    });
    $("#loginEmail").value = ROLE_PROFILES[role].email;
    $("#loginButton span").textContent = `Sign in as ${role}`;
    setFormError("#loginError");
  }

  async function enterApp(session) {
    state.role = ROLE_PROFILES[session?.role] ? session.role : "manager";
    state.user = ROLE_PROFILES[state.role];
    $("#loginView").hidden = true;
    $("#appShell").hidden = false;
    applyRoleVisibility();
    navigateTo("overview");
    await loadProducts();
  }

  function handleLogin(event) {
    event.preventDefault();
    const email = $("#loginEmail").value.trim();
    const password = $("#loginPassword").value;
    if (!email || password.length < 4) {
      setFormError("#loginError", "Enter the demo email and a password of at least four characters.");
      return;
    }
    const session = { role: state.role, email, createdAt: new Date().toISOString() };
    saveJson(STORAGE_KEYS.session, session);
    enterApp(session);
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEYS.session);
    $("#appShell").hidden = true;
    $("#loginView").hidden = false;
    selectRole(state.role);
    closeSidebar();
  }

  async function useDemoMode() {
    state.mode = "demo";
    localStorage.setItem(STORAGE_KEYS.mode, state.mode);
    closeModal("apiModal");
    await loadProducts();
    showToast("Sample inventory loaded. Changes stay in this browser.");
  }

  async function handleApiSubmit(event) {
    event.preventDefault();
    setFormError("#apiFormError");
    const rawUrl = $("#apiUrlInput").value.trim().replace(/\/+$/, "");
    try {
      const parsed = new URL(rawUrl);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("Invalid protocol");
    } catch (_error) {
      setFormError("#apiFormError", "Enter a valid API Gateway URL beginning with https://.");
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

  function handleActionClick(event) {
    const openSale = event.target.closest(".open-sale-button");
    if (openSale) {
      showSaleModal(openSale.dataset.id || "");
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const productId = button.dataset.id;
    if (button.dataset.action === "edit") showProductModal(productId);
    if (button.dataset.action === "delete") showDeleteModal(productId);
    if (button.dataset.action === "restock") restockProduct(productId);
  }

  function bindEvents() {
    $("#loginForm").addEventListener("submit", handleLogin);
    $("#roleSwitch").addEventListener("click", (event) => {
      const button = event.target.closest("[data-role]");
      if (button) selectRole(button.dataset.role);
    });

    $("#mainNavigation").addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (button) navigateTo(button.dataset.page);
    });
    $$(".page-link").forEach((button) => {
      button.addEventListener("click", () => navigateTo(button.dataset.targetPage));
    });
    $("#topAlertButton").addEventListener("click", () => {
      if (roleCanAccess("alerts")) navigateTo("alerts");
    });
    $("#menuButton").addEventListener("click", openSidebar);
    $("#closeSidebarButton").addEventListener("click", closeSidebar);
    $("#sidebarScrim").addEventListener("click", closeSidebar);
    $("#logoutButton").addEventListener("click", logout);

    $$(".open-product-button").forEach((button) => {
      button.addEventListener("click", () => showProductModal());
    });
    document.addEventListener("click", handleActionClick);
    $("#productForm").addEventListener("submit", handleProductSubmit);
    $("#saleForm").addEventListener("submit", handleSaleSubmit);
    $("#saleProductInput").addEventListener("change", updateSaleStockHint);
    $("#saleQuantityInput").addEventListener("input", updateSaleStockHint);
    $("#confirmDeleteButton").addEventListener("click", handleConfirmDelete);
    $("#forecastActionButton").addEventListener("click", (event) => {
      if (event.currentTarget.dataset.productId) {
        restockProduct(event.currentTarget.dataset.productId);
      }
    });

    $("#productSearch").addEventListener("input", renderInventory);
    $("#stockFilter").addEventListener("change", renderInventory);
    $("#refreshButton").addEventListener("click", () => loadProducts());
    $("#retryApiButton").addEventListener("click", () => loadProducts());
    $("#runHealthCheckButton").addEventListener("click", () => loadProducts());
    $("#useDemoButton").addEventListener("click", useDemoMode);
    $("#apiDemoModeButton").addEventListener("click", useDemoMode);
    $("#connectionButton").addEventListener("click", openApiModal);
    $("#apiForm").addEventListener("submit", handleApiSubmit);

    $("#exportInventoryButton").addEventListener("click", exportInventory);
    $("#downloadProductsReport").addEventListener("click", exportInventory);
    $("#downloadSalesReport").addEventListener("click", exportSales);
    $("#printInsightReport").addEventListener("click", () => {
      navigateTo("insights");
      window.setTimeout(() => window.print(), 250);
    });

    $$('[data-close-modal]').forEach((button) => {
      button.addEventListener("click", () => closeModal(button.dataset.closeModal));
    });
    $$(".modal-backdrop").forEach((backdrop) => {
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) closeModal(backdrop.id);
      });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const openModalElement = $$('.modal-backdrop:not([hidden])').at(-1);
        if (openModalElement) closeModal(openModalElement.id);
        else closeSidebar();
      }
    });
  }

  function initialise() {
    bindEvents();
    selectRole("manager");
    $("#apiUrlInput").value = state.apiUrl;
    const session = loadJson(STORAGE_KEYS.session, null);
    if (session?.role && ROLE_PROFILES[session.role]) {
      enterApp(session);
    }
  }

  document.addEventListener("DOMContentLoaded", initialise);
})();