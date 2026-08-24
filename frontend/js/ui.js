import { state, ROLE_PROFILES } from "./config.js";
import { getMetadata } from "./inventory.js";
import { $, $$, escapeHtml, initials } from "./utils.js";
import { sendTelemetry } from "./api.js";

// Displays the loading overlay with a selected message.
export function showLoading(message = "Loading products…") {
  $("#loadingText").textContent = message;
  $("#loadingOverlay").hidden = false;
}

// Hides the loading overlay.
export function hideLoading() {
  $("#loadingOverlay").hidden = true;
}

// Displays a temporary success or error notification.
export function showToast(message, type = "success") {
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

// Displays or clears an error message inside a form.
export function setFormError(selector, message = "") {
  const element = $(selector);
  element.textContent = message;
  element.hidden = !message;
}

// Updates the API connection indicator in the navigation bar.
export function setConnectionStatus(status, message) {
  state.apiStatus = status;
  const button = $("#connectionButton");
  button.classList.remove("connected", "error", "checking", "demo");
  button.classList.add(status);
  $("#connectionText").textContent = message;
}

// Records an API connection result in the frontend monitoring log and
// forwards it to CloudWatch (via the telemetry endpoint) for the backend view.
export function recordMonitorEvent(status, message, duration = null) {
  state.monitorEvents.unshift({
    status,
    message,
    duration,
    createdAt: new Date().toISOString(),
  });
  state.monitorEvents = state.monitorEvents.slice(0, 20);
  sendTelemetry(status, message, duration);
}

// Opens a selected modal window.
export function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;

  modal.hidden = false;
  document.body.style.overflow = "hidden";
  window.setTimeout(() => {
    modal.querySelector("input:not([disabled]), select, button")?.focus();
  }, 0);
}

// Closes a selected modal window.
export function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;

  modal.hidden = true;
  if (!$$('.modal-backdrop:not([hidden])').length) {
    document.body.style.overflow = "";
  }
}

// Opens the form for adding or editing a product.
export function showProductModal(productId = null) {
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

// Updates the sale form with products that have available stock.
export function refreshSaleOptions(selectedProductId = "") {
  const select = $("#saleProductInput");
  const availableProducts = state.products.filter((product) => product.stock > 0);

  select.innerHTML = availableProducts.length
    ? `<option value="">Choose a product</option>${availableProducts
        .map(
          (product) =>
            `<option value="${escapeHtml(product.productId)}">${escapeHtml(
              product.name,
            )} · ${product.stock} available</option>`,
        )
        .join("")}`
    : `<option value="">No products with available stock</option>`;

  select.disabled = !availableProducts.length;
  if (
    selectedProductId &&
    availableProducts.some((product) => product.productId === selectedProductId)
  ) {
    select.value = selectedProductId;
  }

  updateSaleStockHint();
}

// Opens the form used to record a product sale.
export function showSaleModal(productId = "") {
  setFormError("#saleFormError");
  $("#saleForm").reset();
  $("#saleQuantityInput").value = "1";
  refreshSaleOptions(productId);
  openModal("saleModal");
}

// Shows how much stock will remain after a sale.
export function updateSaleStockHint() {
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
  hint.textContent =
    `${product.stock} units available · ` +
    `${remaining} will remain after this sale.`;
}

// Opens the API configuration window.
export function openApiModal() {
  $("#apiUrlInput").value = state.apiUrl;
  setFormError("#apiFormError");
  openModal("apiModal");
}

// Opens the product deletion confirmation window.
export function showDeleteModal(productId) {
  const product = state.products.find((item) => item.productId === productId);
  if (!product) return;

  state.deletingProductId = productId;
  $("#confirmText").textContent =
    state.mode === "demo"
      ? `This removes ${product.name} from the sample inventory in this browser.`
      : `This removes ${product.name} from DynamoDB and cannot be undone.`;
  openModal("confirmModal");
}

// Checks whether the current role can access a selected page.
export function roleCanAccess(page) {
  const button = $(`#mainNavigation [data-page="${page}"]`);
  if (!button) return page === "overview";
  return button.dataset.roles.split(",").includes(state.role);
}

// Shows or hides controls according to the selected role.
export function applyRoleVisibility() {
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

// Opens a selected dashboard page.
export function navigateTo(page) {
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

// Opens the sidebar navigation on smaller screens.
export function openSidebar() {
  $("#sidebar").classList.add("open");
  $("#sidebarScrim").hidden = false;
}

// Closes the sidebar navigation on smaller screens.
export function closeSidebar() {
  $("#sidebar").classList.remove("open");
  $("#sidebarScrim").hidden = true;
}

// Selects a prototype role and updates the demonstration login.
export function selectRole(role) {
  if (!ROLE_PROFILES[role]) return;

  state.role = role;
  $$("#roleSwitch [data-role]").forEach((button) => {
    button.classList.toggle("active", button.dataset.role === role);
  });

  $("#loginEmail").value = ROLE_PROFILES[role].email;
  $("#loginButton span").textContent = `Sign in as ${role}`;
  setFormError("#loginError");
}
