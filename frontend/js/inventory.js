import { state, STORAGE_KEYS, DEMO_METADATA } from "./config.js";
import { saveJson } from "./storage.js";
import { inferCategory, normaliseActivity } from "./utils.js";
import { recordActivity } from "./api.js";

// Gets the local category and the AWS reorder threshold (local only in sample mode).
export function getMetadata(productId, productName = "") {
  const stored = state.metadata[productId];
  const product = state.products.find((item) => item.productId === productId);
  // Never let an old browser value override an AWS product, including zero.
  const reorderLevel = state.mode === "demo"
    ? stored?.reorderLevel ?? DEMO_METADATA[productId]?.reorderLevel ?? 5
    : product?.reorderThreshold ?? 0;

  return {
    category: stored?.category || inferCategory(productName),
    reorderLevel: Math.max(0, Number(reorderLevel) || 0),
  };
}

// Saves the category locally; only sample-mode reorder levels are written here.
export function setMetadata(productId, metadata) {
  state.metadata[productId] = {
    // Preserve legacy local data, but getMetadata ignores its threshold in API mode.
    ...state.metadata[productId],
    category: metadata.category || "Other",
  };

  if (state.mode === "demo") {
    state.metadata[productId].reorderLevel = Math.max(
      0,
      Number(metadata.reorderLevel) || 0,
    );
  }

  saveJson(STORAGE_KEYS.metadata, state.metadata);
}

// Creates local category defaults, adding reorder defaults only for sample mode.
export function ensureProductMetadata() {
  let changed = false;

  state.products.forEach((product) => {
    const demoDefaults = state.mode === "demo"
      ? DEMO_METADATA[product.productId]
      : undefined;

    if (!state.metadata[product.productId]) {
      state.metadata[product.productId] = {
        category: demoDefaults?.category || inferCategory(product.name),
      };
      changed = true;
    }

    // A live category entry may already exist when switching to sample mode.
    if (
      state.mode === "demo" &&
      state.metadata[product.productId].reorderLevel === undefined
    ) {
      state.metadata[product.productId].reorderLevel =
        demoDefaults?.reorderLevel ?? 5;
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

// Adds an action to shared AWS history or browser storage in sample mode.
export async function addActivity(type, title, detail, status = "Completed") {
  const activity = {
    id: `ACT-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    type,
    title,
    detail,
    status,
    user: state.user.name,
    createdAt: new Date().toISOString(),
  };

  if (state.mode === "api") {
    try {
      const response = await recordActivity(activity);
      const sharedActivity = normaliseActivity(response?.activity || activity);
      state.activities = [
        sharedActivity,
        ...state.activities.filter((item) => item.id !== sharedActivity.id),
      ].slice(0, 100);
      return true;
    } catch (error) {
      console.error("Unable to share audit activity:", error);
      return false;
    }
  }

  state.activities.unshift(activity);
  state.activities = state.activities.slice(0, 100);
  saveJson(STORAGE_KEYS.activity, state.activities);
  return true;
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
