import { state } from "./config.js";

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

// Reports a frontend health/error event to CloudWatch via the telemetry
// endpoint. Fire-and-forget: monitoring must never disrupt the UI.
export function sendTelemetry(status, message, duration = null) {
  if (!state.apiUrl) return;

  const url = `${state.apiUrl.replace(/\/+$/, "")}/telemetry`;

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status,
      message,
      duration,
      page: state.currentPage,
    }),
    keepalive: true,
    mode: "cors",
  }).catch(() => {});
}

// Reads back CloudWatch's aggregated frontend metrics (all sessions, not
// just this browser tab) for the given trailing window.
export function getTelemetrySummary(minutes = 60) {
  return apiRequest(`/telemetry?minutes=${minutes}`);
}

// Reads back the most recent raw frontend events (all sessions) via the
// CloudWatch Logs Insights-backed detail log on the Monitoring page.
export function getTelemetryEvents(limit = 50) {
  return apiRequest(`/telemetry/events?limit=${limit}`);
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

// Loads shared sales from AWS.
export function getSales() {
  return apiRequest("/sales");
}

// Loads shared audit history from AWS.
export function getActivities(limit = 100) {
  return apiRequest(`/activities?limit=${limit}`);
}

// Records an audit entry through AWS.
export function recordActivity(activity) {
  return apiRequest("/activities", { method: "POST", body: activity });
}

// Adds a new product through AWS.
export function createProduct(product) {
  return apiRequest("/products", { method: "POST", body: product });
}

// Updates an existing product through AWS.
export function updateProduct(productId, changes) {
  return apiRequest(`/products/${encodeURIComponent(productId)}`, {
    method: "PUT",
    body: changes,
  });
}

// Records a sale through AWS, which updates stock and may raise an alert.
export function recordSale(productId, quantity) {
  return apiRequest("/sales", {
    method: "POST",
    body: { productId, quantitySold: quantity },
  });
}

// Deletes a product through AWS.
export function deleteProduct(productId) {
  return apiRequest(`/products/${encodeURIComponent(productId)}`, {
    method: "DELETE",
  });
}
