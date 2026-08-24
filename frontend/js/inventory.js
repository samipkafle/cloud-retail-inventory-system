import { state, STORAGE_KEYS, DEMO_METADATA } from "./config.js";
import { saveJson } from "./storage.js";
import { inferCategory } from "./utils.js";

// Gets a product's locally stored category and reorder level.
export function getMetadata(productId, productName = "") {
  const stored = state.metadata[productId];

  if (stored) {
    return {
      category: stored.category || inferCategory(productName),
      reorderLevel: Math.max(0, Number(stored.reorderLevel) || 0),
    };
  }

  return { category: inferCategory(productName), reorderLevel: 5 };
}

// Saves a product's category and reorder level in browser storage.
export function setMetadata(productId, metadata) {
  state.metadata[productId] = {
    category: metadata.category || "Other",
    reorderLevel: Math.max(0, Number(metadata.reorderLevel) || 0),
  };
  saveJson(STORAGE_KEYS.metadata, state.metadata);
}

// Creates default metadata for products that do not already have it.
export function ensureProductMetadata() {
  let changed = false;

  state.products.forEach((product) => {
    if (!state.metadata[product.productId]) {
      state.metadata[product.productId] = DEMO_METADATA[product.productId] || {
        category: inferCategory(product.name),
        reorderLevel: 5,
      };
      changed = true;
    }
  });

  if (changed) saveJson(STORAGE_KEYS.metadata, state.metadata);
}

// Determines whether a product is in stock, low in stock or out of stock.
export function getStockStatus(product) {
  const reorderLevel = getMetadata(product.productId, product.name).reorderLevel;

  if (product.stock <= 0) {
    return { key: "out", label: "Out of stock", className: "status-out" };
  }

  if (product.stock <= reorderLevel) {
    return { key: "low", label: "Low stock", className: "status-low" };
  }

  return { key: "in", label: "In stock", className: "status-good" };
}

// Calculates the starting date for a selected number of recent days.
export function daysAgoStart(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (days - 1));
  return date;
}

// Returns sales recorded within the selected number of recent days.
export function recentSales(days = 14) {
  const start = daysAgoStart(days);
  return state.sales.filter((sale) => new Date(sale.createdAt) >= start);
}

// Returns recent sales belonging to a particular product.
export function productSales(productId, days = 14) {
  return recentSales(days).filter((sale) => sale.productId === productId);
}

// Groups recorded sales by day and calculates daily totals.
export function groupSalesByDay(days = 7) {
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

// Calculates product counts, stock quantities and inventory value.
export function inventoryTotals() {
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

// Adds a product or sales action to the activity history.
export function addActivity(type, title, detail, status = "Completed") {
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

// Calculates sales velocity and suggested restock quantities.
export function getForecasts() {
  return state.products
    .map((product) => {
      const sales = productSales(product.productId, 14);
      const sold = sales.reduce((sum, sale) => sum + Number(sale.quantity || 0), 0);
      const daily = sold / 14;
      const metadata = getMetadata(product.productId, product.name);
      const daysRemaining = daily > 0 ? product.stock / daily : Infinity;
      const target = Math.max(metadata.reorderLevel * 3, Math.ceil(daily * 14 * 1.15));
      const suggested = Math.max(0, target - product.stock);

      return { product, sold, daily, daysRemaining, suggested, metadata };
    })
    .sort((first, second) => {
      if (first.daysRemaining !== second.daysRemaining) {
        return first.daysRemaining - second.daysRemaining;
      }
      return second.sold - first.sold;
    });
}

// Converts a daily sales rate into a demand label.
export function demandLabel(daily) {
  if (daily >= 2) return "High demand";
  if (daily >= 0.75) return "Steady demand";
  if (daily > 0) return "Emerging demand";
  return "No sales yet";
}
