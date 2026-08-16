const LOW_STOCK_LEVEL = 5;

const STORAGE_KEYS = {
  apiUrl: "greenleaf_api_url",
  demoProducts: "greenleaf_demo_products",
};

const defaultDemoProducts = [
  {
    productId: "milk-001",
    name: "Fresh Milk",
    price: 3.5,
    stock: 12,
  },
  {
    productId: "bread-001",
    name: "Wholemeal Bread",
    price: 4.2,
    stock: 4,
  },
  {
    productId: "eggs-001",
    name: "Free Range Eggs",
    price: 7.5,
    stock: 0,
  },
];

let apiBaseUrl = "";
let products = [];

const elements = {
  apiForm: document.getElementById("apiForm"),
  apiUrlInput: document.getElementById("apiUrlInput"),
  connectionBadge: document.getElementById("connectionBadge"),
  demoModeButton: document.getElementById("demoModeButton"),
  refreshButton: document.getElementById("refreshButton"),
  statusMessage: document.getElementById("statusMessage"),
  totalProducts: document.getElementById("totalProducts"),
  totalStock: document.getElementById("totalStock"),
  lowStockCount: document.getElementById("lowStockCount"),
  soldOutCount: document.getElementById("soldOutCount"),
  inventoryValue: document.getElementById("inventoryValue"),
  addProductForm: document.getElementById("addProductForm"),
  productIdInput: document.getElementById("productIdInput"),
  productNameInput: document.getElementById("productNameInput"),
  productPriceInput: document.getElementById("productPriceInput"),
  productStockInput: document.getElementById("productStockInput"),
  saleForm: document.getElementById("saleForm"),
  saleProductSelect: document.getElementById("saleProductSelect"),
  saleQuantityInput: document.getElementById("saleQuantityInput"),
  editProductForm: document.getElementById("editProductForm"),
  editProductSelect: document.getElementById("editProductSelect"),
  editNameInput: document.getElementById("editNameInput"),
  editPriceInput: document.getElementById("editPriceInput"),
  editStockInput: document.getElementById("editStockInput"),
  viewSelectedButton: document.getElementById("viewSelectedButton"),
  productDetail: document.getElementById("productDetail"),
  productTableBody: document.getElementById("productTableBody"),
  emptyState: document.getElementById("emptyState"),
};

function startApp() {
  apiBaseUrl = normalizeApiUrl(localStorage.getItem(STORAGE_KEYS.apiUrl) || "");
  elements.apiUrlInput.value = apiBaseUrl;

  elements.apiForm.addEventListener("submit", handleSaveApiUrl);
  elements.demoModeButton.addEventListener("click", handleUseDemoMode);
  elements.refreshButton.addEventListener("click", loadProducts);
  elements.addProductForm.addEventListener("submit", handleAddProduct);
  elements.saleForm.addEventListener("submit", handleRecordSale);
  elements.editProductForm.addEventListener("submit", handleEditProduct);
  elements.viewSelectedButton.addEventListener("click", handleViewSelectedProduct);
  elements.productTableBody.addEventListener("click", handleTableAction);

  loadProducts();
}

function normalizeApiUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "");
}

function isApiMode() {
  return apiBaseUrl.length > 0;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        message: text,
      };
    }
  }

  if (!response.ok) {
    throw new Error(data?.message || `Request failed with ${response.status}`);
  }

  return data;
}

async function loadProducts() {
  setBusy(true);

  try {
    if (isApiMode()) {
      const data = await apiRequest("/products");
      products = Array.isArray(data) ? data.map(normalizeProduct) : [];
      showMessage("Products loaded from the AWS API.", "success");
    } else {
      products = getDemoProducts();
      showMessage("Demo mode is active. Paste the API URL to use the real backend.", "warning");
    }

    render();
  } catch (error) {
    showMessage(
      `Cannot load products. ${error.message}. If this is from the browser, ask the backend member to enable CORS.`,
      "error"
    );
  } finally {
    setBusy(false);
  }
}

async function handleSaveApiUrl(event) {
  event.preventDefault();

  apiBaseUrl = normalizeApiUrl(elements.apiUrlInput.value);
  localStorage.setItem(STORAGE_KEYS.apiUrl, apiBaseUrl);

  if (!apiBaseUrl) {
    showMessage("API URL is empty, so demo mode is active.", "warning");
  }

  await loadProducts();
}

async function handleUseDemoMode() {
  apiBaseUrl = "";
  localStorage.removeItem(STORAGE_KEYS.apiUrl);
  elements.apiUrlInput.value = "";
  await loadProducts();
}

async function handleAddProduct(event) {
  event.preventDefault();

  const product = {
    productId: elements.productIdInput.value.trim(),
    name: elements.productNameInput.value.trim(),
    price: Number(elements.productPriceInput.value),
    stock: toWholeNumber(elements.productStockInput.value),
  };

  if (!product.productId || !product.name || Number.isNaN(product.price)) {
    showMessage("Please enter product ID, name, price, and stock.", "error");
    return;
  }

  if (product.price < 0 || product.stock < 0) {
    showMessage("Price and stock cannot be negative.", "error");
    return;
  }

  setBusy(true);

  try {
    if (isApiMode()) {
      await apiRequest("/products", {
        method: "POST",
        body: JSON.stringify(product),
      });
    } else {
      if (products.some((item) => item.productId === product.productId)) {
        throw new Error("Product ID already exists in demo mode");
      }

      products.push(product);
      saveDemoProducts();
    }

    elements.addProductForm.reset();
    showMessage("Product added successfully.", "success");
    await loadProducts();
  } catch (error) {
    showMessage(`Cannot add product. ${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

async function handleRecordSale(event) {
  event.preventDefault();

  const productId = elements.saleProductSelect.value;
  const quantitySold = toWholeNumber(elements.saleQuantityInput.value);
  await recordSale(productId, quantitySold);
}

async function recordSale(productId, quantitySold) {
  const product = findProduct(productId);

  if (!product) {
    showMessage("Please choose a product.", "error");
    return;
  }

  if (quantitySold <= 0) {
    showMessage("Quantity sold must be at least 1.", "error");
    return;
  }

  if (product.stock === 0) {
    showMessage(`${product.name} is sold out. Sale was not recorded.`, "error");
    return;
  }

  if (quantitySold > product.stock) {
    showMessage(
      `Cannot sell ${quantitySold}. Only ${product.stock} item(s) available.`,
      "error"
    );
    return;
  }

  const newStock = product.stock - quantitySold;
  const updated = await updateProduct(product.productId, { stock: newStock });

  if (updated) {
    showMessage(`Sale recorded. New stock for ${product.name}: ${displayStock(newStock)}.`, "success");
  }
}

async function handleEditProduct(event) {
  event.preventDefault();

  const productId = elements.editProductSelect.value;
  const updates = {};

  if (elements.editNameInput.value.trim()) {
    updates.name = elements.editNameInput.value.trim();
  }

  if (elements.editPriceInput.value !== "") {
    const price = Number(elements.editPriceInput.value);

    if (Number.isNaN(price) || price < 0) {
      showMessage("Price cannot be negative.", "error");
      return;
    }

    updates.price = price;
  }

  if (elements.editStockInput.value !== "") {
    const stock = toWholeNumber(elements.editStockInput.value);

    if (stock < 0) {
      showMessage("Stock cannot be negative.", "error");
      return;
    }

    updates.stock = stock;
  }

  if (!productId || Object.keys(updates).length === 0) {
    showMessage("Choose a product and enter at least one field to update.", "error");
    return;
  }

  const updated = await updateProduct(productId, updates);

  if (updated) {
    elements.editProductForm.reset();
    showMessage("Product updated successfully.", "success");
  }
}

async function updateProduct(productId, updates) {
  setBusy(true);

  try {
    if (updates.stock !== undefined) {
      updates.stock = Math.max(0, toWholeNumber(updates.stock));
    }

    if (isApiMode()) {
      await apiRequest(`/products/${encodeURIComponent(productId)}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
    } else {
      products = products.map((product) =>
        product.productId === productId
          ? normalizeProduct({ ...product, ...updates })
          : product
      );
      saveDemoProducts();
    }

    await loadProducts();
    return true;
  } catch (error) {
    showMessage(`Cannot update product. ${error.message}`, "error");
    return false;
  } finally {
    setBusy(false);
  }
}

async function handleViewSelectedProduct() {
  const productId = elements.editProductSelect.value;

  if (!productId) {
    showMessage("Choose a product first.", "error");
    return;
  }

  setBusy(true);

  try {
    let product;

    if (isApiMode()) {
      product = normalizeProduct(
        await apiRequest(`/products/${encodeURIComponent(productId)}`)
      );
    } else {
      product = findProduct(productId);
    }

    renderProductDetail(product);
    showMessage("Product details loaded.", "success");
  } catch (error) {
    showMessage(`Cannot view product. ${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

async function handleTableAction(event) {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const productId = button.dataset.productId;
  const action = button.dataset.action;
  const product = findProduct(productId);

  if (!product) {
    showMessage("Product not found.", "error");
    return;
  }

  if (action === "view") {
    elements.editProductSelect.value = productId;
    await handleViewSelectedProduct();
    return;
  }

  if (action === "sell-one") {
    await recordSale(productId, 1);
    return;
  }

  if (action === "restock") {
    const input = button.parentElement.querySelector(".restock-input");
    const quantity = toWholeNumber(input.value);

    if (quantity <= 0) {
      showMessage("Restock quantity must be at least 1.", "error");
      return;
    }

    const updated = await updateProduct(productId, { stock: product.stock + quantity });

    if (updated) {
      showMessage(`Restocked ${product.name}.`, "success");
    }

    return;
  }

  if (action === "delete") {
    await deleteProduct(productId);
  }
}

async function deleteProduct(productId) {
  const product = findProduct(productId);

  if (!product) {
    showMessage("Product not found.", "error");
    return;
  }

  const confirmed = window.confirm(`Delete ${product.name}?`);

  if (!confirmed) {
    return;
  }

  setBusy(true);

  try {
    if (isApiMode()) {
      await apiRequest(`/products/${encodeURIComponent(productId)}`, {
        method: "DELETE",
      });
    } else {
      products = products.filter((item) => item.productId !== productId);
      saveDemoProducts();
    }

    showMessage("Product deleted successfully.", "success");
    await loadProducts();
  } catch (error) {
    showMessage(`Cannot delete product. ${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

function render() {
  renderMode();
  renderSummary();
  renderProductTable();
  renderSelects();
}

function renderMode() {
  if (isApiMode()) {
    elements.connectionBadge.textContent = "AWS API mode";
    elements.connectionBadge.classList.add("live");
  } else {
    elements.connectionBadge.textContent = "Demo mode";
    elements.connectionBadge.classList.remove("live");
  }
}

function renderSummary() {
  const totalProducts = products.length;
  const totalStock = products.reduce((sum, product) => sum + product.stock, 0);
  const lowStockCount = products.filter(
    (product) => product.stock > 0 && product.stock <= LOW_STOCK_LEVEL
  ).length;
  const soldOutCount = products.filter((product) => product.stock === 0).length;
  const inventoryValue = products.reduce(
    (sum, product) => sum + product.price * product.stock,
    0
  );

  elements.totalProducts.textContent = totalProducts;
  elements.totalStock.textContent = totalStock;
  elements.lowStockCount.textContent = lowStockCount;
  elements.soldOutCount.textContent = soldOutCount;
  elements.inventoryValue.textContent = formatMoney(inventoryValue);
}

function renderProductTable() {
  elements.productTableBody.innerHTML = "";
  elements.emptyState.hidden = products.length > 0;

  products.forEach((product) => {
    const row = document.createElement("tr");
    const status = getStockStatus(product.stock);

    row.innerHTML = `
      <td>${escapeHtml(product.productId)}</td>
      <td>${escapeHtml(product.name)}</td>
      <td>${formatMoney(product.price)}</td>
      <td><span class="stock-pill ${status.className}">${displayStock(product.stock)}</span></td>
      <td><span class="status-pill ${status.className}">${status.label}</span></td>
      <td>
        <div class="action-row">
          <button type="button" data-action="view" data-product-id="${escapeHtml(product.productId)}">View</button>
          <button type="button" data-action="sell-one" data-product-id="${escapeHtml(product.productId)}" ${product.stock === 0 ? "disabled" : ""}>Sell 1</button>
          <input class="restock-input" type="number" min="1" step="1" value="5" aria-label="Restock quantity for ${escapeHtml(product.name)}" />
          <button type="button" data-action="restock" data-product-id="${escapeHtml(product.productId)}">Restock</button>
          <button type="button" class="danger-button" data-action="delete" data-product-id="${escapeHtml(product.productId)}">Delete</button>
        </div>
      </td>
    `;

    elements.productTableBody.appendChild(row);
  });
}

function renderSelects() {
  const saleOptions = products
    .map((product) => {
      const disabled = product.stock === 0 ? "disabled" : "";
      return `<option value="${escapeHtml(product.productId)}" ${disabled}>${escapeHtml(product.name)} - ${displayStock(product.stock)}</option>`;
    })
    .join("");

  const editOptions = products
    .map(
      (product) =>
        `<option value="${escapeHtml(product.productId)}">${escapeHtml(product.name)}</option>`
    )
    .join("");

  elements.saleProductSelect.innerHTML =
    products.length > 0
      ? saleOptions
      : '<option value="">No products available</option>';

  elements.editProductSelect.innerHTML =
    products.length > 0
      ? editOptions
      : '<option value="">No products available</option>';
}

function renderProductDetail(product) {
  if (!product) {
    elements.productDetail.hidden = true;
    elements.productDetail.innerHTML = "";
    return;
  }

  const status = getStockStatus(product.stock);

  elements.productDetail.hidden = false;
  elements.productDetail.innerHTML = `
    <strong>${escapeHtml(product.name)}</strong>
    <p>ID: ${escapeHtml(product.productId)}</p>
    <p>Price: ${formatMoney(product.price)}</p>
    <p>Stock: ${displayStock(product.stock)}</p>
    <p>Status: ${status.label}</p>
  `;
}

function getDemoProducts() {
  const savedProducts = localStorage.getItem(STORAGE_KEYS.demoProducts);

  if (!savedProducts) {
    localStorage.setItem(
      STORAGE_KEYS.demoProducts,
      JSON.stringify(defaultDemoProducts)
    );
    return defaultDemoProducts.map(normalizeProduct);
  }

  try {
    return JSON.parse(savedProducts).map(normalizeProduct);
  } catch {
    localStorage.setItem(
      STORAGE_KEYS.demoProducts,
      JSON.stringify(defaultDemoProducts)
    );
    return defaultDemoProducts.map(normalizeProduct);
  }
}

function saveDemoProducts() {
  localStorage.setItem(STORAGE_KEYS.demoProducts, JSON.stringify(products));
}

function normalizeProduct(product) {
  return {
    productId: String(product.productId || ""),
    name: String(product.name || ""),
    price: Math.max(0, Number(product.price) || 0),
    stock: Math.max(0, toWholeNumber(product.stock)),
  };
}

function findProduct(productId) {
  return products.find((product) => product.productId === productId);
}

function getStockStatus(stock) {
  if (stock === 0) {
    return {
      label: "Sold out",
      className: "status-sold-out",
    };
  }

  if (stock <= LOW_STOCK_LEVEL) {
    return {
      label: "Low stock",
      className: "status-low",
    };
  }

  return {
    label: "In stock",
    className: "status-ok",
  };
}

function displayStock(stock) {
  return stock === 0 ? "Sold out" : String(stock);
}

function toWholeNumber(value) {
  return Math.floor(Number(value) || 0);
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(Number(value) || 0);
}

function showMessage(message, type = "info") {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message ${type}`;
}

function setBusy(isBusy) {
  document.body.classList.toggle("is-busy", isBusy);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

startApp();
