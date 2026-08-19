import { state, STORAGE_KEYS, ROLE_PROFILES } from "./config.js";
import { loadJson, saveJson } from "./storage.js";
import { $, $$ } from "./utils.js";
import {
  loadProducts,
  handleProductSubmit,
  handleSaleSubmit,
  handleConfirmDelete,
  restockProduct,
  exportInventory,
  exportSales,
  useDemoMode,
  handleApiSubmit,
} from "./actions.js";
import {
  closeModal,
  showProductModal,
  showSaleModal,
  updateSaleStockHint,
  openApiModal,
  showDeleteModal,
  roleCanAccess,
  applyRoleVisibility,
  navigateTo,
  openSidebar,
  closeSidebar,
  selectRole,
  setFormError,
} from "./ui.js";
import { renderInventory } from "./render.js";

// Opens the dashboard and loads inventory for a user session.
async function enterApp(session) {
  state.role = ROLE_PROFILES[session?.role] ? session.role : "manager";
  state.user = ROLE_PROFILES[state.role];
  $("#loginView").hidden = true;
  $("#appShell").hidden = false;
  applyRoleVisibility();
  navigateTo("overview");
  await loadProducts();
}

// Validates the prototype login form and starts a session.
function handleLogin(event) {
  event.preventDefault();
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;

  if (!email || password.length < 4) {
    setFormError(
      "#loginError",
      "Enter the demo email and a password of at least four characters.",
    );
    return;
  }

  const session = { role: state.role, email, createdAt: new Date().toISOString() };
  saveJson(STORAGE_KEYS.session, session);
  enterApp(session);
}

// Ends the current session and returns to the login screen.
function logout() {
  localStorage.removeItem(STORAGE_KEYS.session);
  $("#appShell").hidden = true;
  $("#loginView").hidden = false;
  selectRole(state.role);
  closeSidebar();
}

// Handles product action buttons using event delegation.
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

// Connects buttons, forms and page controls to their functions.
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
      const openModalElement = $('.modal-backdrop:not([hidden])');
      if (openModalElement) closeModal(openModalElement.id);
      else closeSidebar();
    }
  });
}

// Initialises the application after the HTML page loads.
export function initialise() {
  bindEvents();
  selectRole("manager");
  $("#apiUrlInput").value = state.apiUrl;

  const session = loadJson(STORAGE_KEYS.session, null);
  if (session?.role && ROLE_PROFILES[session.role]) enterApp(session);
}
