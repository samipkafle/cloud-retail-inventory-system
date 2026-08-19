import {
  state,
  STORAGE_KEYS,
  DEMO_PRODUCTS,
  DEMO_METADATA,
} from "./config.js";
import { loadJson, saveJson } from "./storage.js";
import { normaliseProduct } from "./utils.js";

// Converts a technical API error into a user-friendly message.
export function friendlyApiError(error) {
  if (error?.name === "AbortError") {
    return "The request timed out. Check that the API is deployed and reachable.";
  }

  if (error instanceof TypeError || /fetch|network|failed/i.test(error?.message || "")) {
    return "The browser could not call the API. Confirm the URL and enable CORS for GET, POST, PUT and DELETE in API Gateway, then deploy the API again.";
  }

  return error?.message || "The product API returned an unexpected error.";
}

// Sends a request to the configured AWS API.
export async function apiRequest(path = "", options = {}) {
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
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
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

// Loads the sample inventory used when the AWS API is unavailable.
export function readDemoProducts() {
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

// Saves changes made to sample products in browser storage.
export function saveDemoProducts() {
  saveJson(STORAGE_KEYS.demoProducts, state.products);
}

// Adds a new product through the API or sample-data storage.
export async function createProduct(product) {
  if (state.mode === "demo") {
    state.products.push(normaliseProduct(product));
    saveDemoProducts();
    return;
  }

  await apiRequest("/products", { method: "POST", body: product });
}

// Updates an existing product through the API or sample-data storage.
export async function updateProduct(productId, changes) {
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

// Deletes a product through the API or sample-data storage.
export async function deleteProduct(productId) {
  if (state.mode === "demo") {
    state.products = state.products.filter((item) => item.productId !== productId);
    saveDemoProducts();
    return;
  }

  await apiRequest(`/products/${encodeURIComponent(productId)}`, {
    method: "DELETE",
  });
}
