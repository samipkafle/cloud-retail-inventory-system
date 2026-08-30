// Finds the first HTML element that matches a CSS selector.
export const $ = (selector) => document.querySelector(selector);

// Finds all HTML elements that match a CSS selector.
export const $$ = (selector) => Array.from(document.querySelectorAll(selector));

// Escapes unsafe HTML characters before displaying user-provided information.
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Formats a number as Australian currency.
export function formatMoney(value) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);
}

// Formats a date and time using the Australian display format.
export function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";

  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

// Formats a value as a readable local time.
export function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

// Formats an audit timestamp with day, month, year and local time.
export function formatFullDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

// Creates the HTML for an SVG icon.
export function icon(name) {
  return `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

// Creates initials from a person's or product's name.
export function initials(name) {
  return String(name || "Product")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

// Estimates a product category by checking keywords in its name.
export function inferCategory(name) {
  const lower = String(name || "").toLowerCase();
  if (/milk|cheese|egg|yoghurt|yogurt|butter/.test(lower)) return "Dairy";
  if (/bread|roll|cake|pastry/.test(lower)) return "Bakery";
  if (/apple|banana|orange|fruit|vegetable|lettuce|tomato/.test(lower)) return "Produce";
  if (/juice|water|coffee|tea|drink/.test(lower)) return "Beverages";
  if (/rice|pasta|flour|sugar|cereal|sauce/.test(lower)) return "Pantry";
  if (/clean|soap|paper|bag/.test(lower)) return "Household";
  return "Other";
}

// Converts API product data into a consistent and safe product structure.
export function normaliseProduct(product) {
  const reorderThreshold = Number(product?.reorderThreshold ?? 0);

  return {
    productId: String(product?.productId ?? "").trim(),
    name: String(product?.name ?? "Unnamed product").trim(),
    price: Math.max(0, Number(product?.price) || 0),
    stock: Math.max(0, Math.floor(Number(product?.stock) || 0)),
    // Keep the AWS field; zero also matches the backend's missing-field default.
    reorderThreshold: Number.isFinite(reorderThreshold)
      ? Math.max(0, Math.floor(reorderThreshold))
      : 0,
  };
}

// Converts API sale data into the structure used by the dashboard.
export function normaliseSale(sale) {
  const quantity = Math.max(
    0,
    Math.floor(Number(sale?.quantity ?? sale?.quantitySold) || 0),
  );
  const unitPrice = Math.max(0, Number(sale?.unitPrice) || 0);

  return {
    id: String(sale?.id ?? sale?.saleId ?? "").trim(),
    productId: String(sale?.productId ?? "").trim(),
    productName: String(sale?.productName ?? "").trim(),
    quantity,
    unitPrice,
    total: Math.max(0, Number(sale?.total) || unitPrice * quantity),
    createdAt: String(sale?.createdAt ?? sale?.soldAt ?? "").trim(),
  };
}

// Converts API activity data into the structure used by the audit views.
export function normaliseActivity(activity) {
  return {
    id: String(activity?.id ?? activity?.activityId ?? "").trim(),
    type: ["sale", "stock", "alert"].includes(activity?.type)
      ? activity.type
      : "stock",
    title: String(activity?.title ?? "Activity recorded").trim(),
    detail: String(activity?.detail ?? "").trim(),
    status: activity?.status === "Attention" ? "Attention" : "Completed",
    user: String(activity?.user ?? "GreenLeaf user").trim(),
    createdAt: String(activity?.createdAt ?? "").trim(),
  };
}

// Escapes a value so it can be safely included in a CSV file.
export function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

// Creates and downloads a CSV file.
export function downloadCsv(filename, headers, rows) {
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