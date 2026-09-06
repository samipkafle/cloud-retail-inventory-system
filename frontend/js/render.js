import { state } from "./config.js";
import {
  inventoryTotals,
  recentSales,
  groupSalesByDay,
  getStockStatus,
  getMetadata,
} from "./inventory.js";
import {
  $,
  escapeHtml,
  formatMoney,
  formatDateTime,
  formatFullDateTime,
  formatTime,
  icon,
  initials,
} from "./utils.js";
import { refreshSaleOptions } from "./ui.js";

// Refreshes every page using the latest application data.
export function renderAll() {
  renderOverview();
  renderInventory();
  renderSales();
  renderAlerts();
  renderInsights();
  renderAiRecommendations();
  renderReports();
  renderMonitoring();
  renderTeam();
  refreshSaleOptions();
}

// Displays the main dashboard summary and charts.
export function renderOverview() {
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

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
  $("#weekSaleCount").textContent =
    `${weekCount} recorded sale${weekCount === 1 ? "" : "s"}`;
  renderBarChart("#weeklyBarChart", week, "revenue");

  const productTotal = Math.max(1, totals.products);
  const inPercent = Math.round((totals.in / productTotal) * 100);
  const lowPercent = Math.round((totals.low / productTotal) * 100);
  const availability = totals.products
    ? Math.round(((totals.in + totals.low) / totals.products) * 100)
    : 0;

  $("#healthDonut").style.background =
    `conic-gradient(var(--green) 0 ${inPercent}%, ` +
    `var(--amber) ${inPercent}% ${inPercent + lowPercent}%, ` +
    `var(--red) ${inPercent + lowPercent}% 100%)`;
  $("#availabilityPercent").textContent = `${availability}%`;
  $("#inStockCount").textContent = totals.in;
  $("#lowStockCount").textContent = totals.low;
  $("#outStockCount").textContent = totals.out;

  renderForecast();
  renderActivities();
}

// Creates a bar chart using grouped daily sales data.
export function renderBarChart(selector, days, field) {
  const maximum = Math.max(1, ...days.map((day) => Number(day[field]) || 0));
  const todayKey = new Date().toDateString();

  $(selector).innerHTML = days
    .map((day) => {
      const value = Number(day[field]) || 0;
      const height = value ? Math.max(8, Math.round((value / maximum) * 86)) : 4;
      const title = field === "revenue" ? formatMoney(value) : `${value} items`;

      return `<div class="bar-column ${
        day.date.toDateString() === todayKey ? "today" : ""
      }" title="${escapeHtml(title)}"><span style="height:${height}%"></span><small>${day.date.toLocaleDateString(
        "en-AU",
        { weekday: "short" },
      )}</small></div>`;
    })
    .join("");
}

// Displays the highest-priority restocking forecast (from GET /forecast,
// state.forecasts — see loadProducts() in actions.js).
export function renderForecast() {
  const forecast = state.forecasts.find((item) => item.soldLast14Days > 0);
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

  $("#forecastTitle").textContent =
    `${forecast.name} is the next restock priority`;
  $("#forecastText").textContent = forecast.suggestedRestockQuantity
    ? `Add about ${forecast.suggestedRestockQuantity} units to cover expected demand and maintain a safety buffer.`
    : "Current stock is sufficient for the present sales pace.";
  $("#forecastDemand").textContent = forecast.demandLabel;
  $("#forecastDays").textContent = typeof days === "number" ? `${days} days` : days;
  $("#forecastStock").textContent = `${forecast.stock} units`;
  button.disabled = forecast.suggestedRestockQuantity <= 0;
  button.dataset.productId = forecast.productId;
}

// Displays the latest product and sales activities.
export function renderActivities() {
  const container = $("#activityList");

  if (!state.activities.length) {
    container.innerHTML = `<div class="empty-state">${icon(
      "spark",
    )}<strong>No activity recorded yet</strong><span>Add a product or record a sale to start the audit trail.</span></div>`;
    return;
  }

  container.innerHTML = state.activities
    .slice(0, 5)
    .map((activity) => {
      const iconName =
        activity.type === "sale" ? "receipt" : activity.type === "alert" ? "bell" : "box";
      const className =
        activity.type === "sale" ? "sale" : activity.type === "alert" ? "alert" : "stock";

      return `<div class="activity-item"><span class="activity-icon ${className}">${icon(
        iconName,
      )}</span><div><strong>${escapeHtml(activity.title)}</strong><small>${escapeHtml(
        activity.detail,
      )}</small></div><time datetime="${escapeHtml(activity.createdAt)}">${escapeHtml(
        formatFullDateTime(activity.createdAt),
      )}</time></div>`;
    })
    .join("");
}

// Displays product statistics and the inventory table.
export function renderInventory() {
  const totals = inventoryTotals();
  $("#totalProductCount").textContent = totals.products;
  $("#totalUnitCount").textContent = totals.units.toLocaleString("en-AU");
  $("#inventoryLowCount").textContent = totals.low;
  $("#inventoryOutCount").textContent = totals.out;
  $("#tableSourceLabel").textContent = "AWS product API";

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
    .sort((first, second) => first.name.localeCompare(second.name));

  $("#productTableBody").innerHTML = filtered
    .map((product) => {
      const status = getStockStatus(product);
      const metadata = getMetadata(product.productId, product.name);

      return `<tr><td><div class="product-cell"><span>${escapeHtml(
        initials(product.name),
      )}</span><div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(
        product.productId,
      )} · ${escapeHtml(metadata.category)}</small></div></div></td><td>${formatMoney(
        product.price,
      )}</td><td><strong>${product.stock.toLocaleString(
        "en-AU",
      )}</strong> units</td><td>${metadata.reorderLevel} units</td><td><span class="status-pill ${
        status.className
      }">${status.label}</span></td><td><div class="table-actions"><button class="small-button" type="button" data-action="restock" data-id="${escapeHtml(
        product.productId,
      )}" title="Apply suggested restock">Restock</button><button class="small-button" type="button" data-action="edit" data-id="${escapeHtml(
        product.productId,
      )}" aria-label="Edit ${escapeHtml(product.name)}">${icon(
        "edit",
      )}</button><button class="small-button danger" type="button" data-action="delete" data-id="${escapeHtml(
        product.productId,
      )}" aria-label="Delete ${escapeHtml(product.name)}">${icon(
        "trash",
      )}</button></div></td></tr>`;
    })
    .join("");

  $("#productEmptyState").hidden = filtered.length > 0;
  $("#tableResultCount").textContent =
    `Showing ${filtered.length} of ${state.products.length} product${
      state.products.length === 1 ? "" : "s"
    }`;
}

// Displays sales statistics, charts and recent transactions.
export function renderSales() {
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
      const height = day.quantity
        ? Math.max(8, Math.round((day.quantity / maximum) * 90))
        : 4;
      return `<div title="${day.quantity} items · ${escapeHtml(
        formatMoney(day.revenue),
      )}"><span style="height:${height}%"></span><small>${day.date.toLocaleDateString(
        "en-AU",
        { weekday: "short" },
      )}</small></div>`;
    })
    .join("");

  const list = $("#transactionList");
  if (!state.sales.length) {
    list.innerHTML = `<div class="empty-state">${icon(
      "receipt",
    )}<strong>No sales recorded yet</strong><span>Record a sale to reduce stock and start demand forecasting.</span></div>`;
    return;
  }

  list.innerHTML = state.sales
    .slice(0, 8)
    .map(
      (sale) =>
        `<div class="transaction-item"><span class="activity-icon sale">${icon(
          "receipt",
        )}</span><div><strong>${escapeHtml(sale.productName)}</strong><small>${escapeHtml(
          sale.id,
        )} · ${sale.quantity} item${
          sale.quantity === 1 ? "" : "s"
        }</small></div><time datetime="${escapeHtml(sale.createdAt)}">${escapeHtml(
          formatDateTime(sale.createdAt),
        )}</time><b>${formatMoney(sale.total)}</b></div>`,
    )
    .join("");
}

// Displays low-stock and out-of-stock alerts.
export function renderAlerts() {
  const alerts = state.products
    .filter((product) => getStockStatus(product).key !== "in")
    .sort((first, second) => first.stock - second.stock);
  const label = `${alerts.length} active alert${alerts.length === 1 ? "" : "s"}`;

  $("#activeAlertLabel").textContent = label;
  $("#navAlertCount").textContent = alerts.length;
  $("#topAlertCount").textContent = alerts.length;
  $("#navAlertCount").hidden = alerts.length === 0;
  $("#topAlertCount").hidden = alerts.length === 0;

  const list = $("#alertList");
  if (!alerts.length) {
    list.innerHTML = `<div class="empty-state">${icon(
      "check",
    )}<strong>Inventory is healthy</strong><span>Every product is currently above its reorder level.</span></div>`;
    return;
  }

  list.innerHTML = alerts
    .map((product) => {
      const status = getStockStatus(product);
      const metadata = getMetadata(product.productId, product.name);
      const suggested = Math.max(1, metadata.reorderLevel * 3 - product.stock);
      const isOut = status.key === "out";

      return `<article class="alert-item"><span class="alert-severity ${
        isOut ? "critical" : "warning"
      }">${icon("bell")}</span><div><div class="alert-title"><strong>${escapeHtml(
        product.name,
      )}</strong><span>${isOut ? "Critical" : "Warning"}</span></div><p>${
        isOut ? "This product is unavailable." : `Only ${product.stock} units remain.`
      } Suggested restock: ${suggested} units.</p><small>${escapeHtml(
        product.productId,
      )} · Reorder level ${
        metadata.reorderLevel
      }</small></div><button class="small-button" type="button" data-action="restock" data-id="${escapeHtml(
        product.productId,
      )}">Restock</button></article>`;
    })
    .join("");
}

// Displays demand forecasts and restocking recommendations (from GET
// /forecast, state.forecasts — see loadProducts() in actions.js).
export function renderInsights() {
  const forecasts = state.forecasts;
  const withSales = forecasts.filter((item) => item.soldLast14Days > 0);
  const top = withSales[0];
  const confidence = withSales.length ? Math.min(92, 62 + withSales.length * 6) : 24;

  $("#insightHero").innerHTML = top
    ? `<div><span class="section-kicker">Highest restock priority</span><h2>${escapeHtml(
        top.name,
      )} may need attention in ${Math.max(
        0,
        Math.round(top.daysRemaining),
      )} days.</h2><p>${
        top.soldLast14Days
      } units were recorded as sold during the last 14 days. The recommended safety stock is based on that sales pace and the product's reorder level.</p><button type="button" data-action="restock" data-id="${escapeHtml(
        top.productId,
      )}">Apply ${
        top.suggestedRestockQuantity || 0
      }-unit restock</button></div><div class="confidence-ring" style="background:conic-gradient(var(--lime) 0 ${confidence}%, rgba(255,255,255,.12) ${confidence}%)"><div><strong>${confidence}%</strong><span>Data confidence</span></div></div>`
    : `<div><span class="section-kicker">Forecast setup</span><h2>Record product sales to unlock demand recommendations.</h2><p>The prototype needs transaction quantities to calculate sales velocity, days of stock remaining and suggested restock quantities.</p><button type="button" class="open-sale-button">Record the first sale</button></div><div class="confidence-ring" style="background:conic-gradient(var(--lime) 0 ${confidence}%, rgba(255,255,255,.12) ${confidence}%)"><div><strong>${confidence}%</strong><span>Data confidence</span></div></div>`;

  const cards = forecasts.slice(0, 3);
  $("#recommendationGrid").innerHTML = cards.length
    ? cards
        .map((forecast, index) => {
          const days = Number.isFinite(forecast.daysRemaining)
            ? `${Math.max(0, Math.round(forecast.daysRemaining))} days`
            : "Not available";
          const copy = forecast.soldLast14Days
            ? `Recent velocity is ${forecast.averageDailySales.toFixed(1)} units per day. ${
                forecast.suggestedRestockQuantity
                  ? `Add ${forecast.suggestedRestockQuantity} units for a two-week buffer.`
                  : "Stock is currently sufficient."
              }`
            : "No recorded sales yet. The current recommendation is based on its stock threshold.";

          return `<article class="content-card recommendation"><div class="recommendation-head"><span class="rank">0${
            index + 1
          }</span><span class="trend-tag">${escapeHtml(
            forecast.demandLabel,
          )}</span></div><h3>${escapeHtml(forecast.name)}</h3><p>${escapeHtml(
            copy,
          )}</p><div class="recommendation-stats"><span><small>Days remaining</small><b>${days}</b></span><span><small>Suggested order</small><b>${
            forecast.suggestedRestockQuantity
          } units</b></span></div><button class="secondary-button" type="button" data-action="restock" data-id="${escapeHtml(
            forecast.productId,
          )}" ${forecast.suggestedRestockQuantity <= 0 ? "disabled" : ""}>Apply restock</button></article>`;
        })
        .join("")
    : `<article class="content-card recommendation"><h3>No products available</h3><p>Add products to begin stock planning.</p></article>`;

  const week = groupSalesByDay(8);
  const maxQuantity = Math.max(1, ...week.map((day) => day.quantity));
  $("#seasonBars").innerHTML = week
    .map((day) => {
      const height = day.quantity
        ? Math.max(8, Math.round((day.quantity / maxQuantity) * 100))
        : 4;
      return `<span style="height:${height}%" title="${day.quantity} items on ${escapeHtml(
        day.date.toLocaleDateString("en-AU"),
      )}"></span>`;
    })
    .join("");
}

// Maps a trend label to its tag colour class (see .trend-tag.trend-* in
// style.css). Falls back to the "insufficient" styling for any unknown
// label rather than defaulting to a possibly-misleading colour.
const TREND_CLASSES = {
  Increasing: "trend-increasing",
  Decreasing: "trend-decreasing",
  Stable: "trend-stable",
};

// Displays the FR-10 AI recommendations — a separate trend model from the
// rule-based forecast above (FR-09), always shown with its basis so a
// manager can judge and override it rather than treat it as a directive.
export function renderAiRecommendations() {
  const container = $("#aiRecommendationList");
  if (!container) return;

  if (!state.recommendations.length) {
    container.innerHTML = `<article class="content-card recommendation"><h3>No recommendations yet</h3><p>The recommendation model runs on a daily schedule once enough sales history has been recorded.</p></article>`;
    return;
  }

  container.innerHTML = state.recommendations
    .map((recommendation) => {
      const product = state.products.find(
        (item) => item.productId === recommendation.productId,
      );
      const trendClass = TREND_CLASSES[recommendation.trendLabel] || "trend-insufficient";

      return `<article class="content-card ai-recommendation-row"><div><h3>${escapeHtml(
        product?.name || recommendation.productId,
      )}</h3><span class="ai-product-id">${escapeHtml(recommendation.productId)}</span></div><span class="trend-tag ${trendClass}">${escapeHtml(
        recommendation.trendLabel,
      )}</span><div class="ai-stat"><small>Predicted demand (14d)</small><b>${
        recommendation.predictedDemand
      } units</b></div><p class="ai-basis">${escapeHtml(recommendation.basis)}</p></article>`;
    })
    .join("");
}

// Displays inventory figures and the audit history.
export function renderReports() {
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
    ? `${totals.units.toLocaleString("en-AU")} units are on hand, with ${
        totals.low + totals.out
      } product${totals.low + totals.out === 1 ? "" : "s"} requiring attention.`
    : "Connect the AWS API to calculate current stock performance.";

  const audit = $("#auditRows");
  if (!state.activities.length) {
    audit.innerHTML = `<div class="empty-state">${icon(
      "chart",
    )}<strong>No audit events yet</strong><span>Product and sales changes will appear here.</span></div>`;
    return;
  }

  audit.innerHTML = state.activities
    .slice(0, 12)
    .map(
      (activity) =>
        `<div class="audit-row"><time>${escapeHtml(
          formatFullDateTime(activity.createdAt),
        )}</time><strong>${escapeHtml(
          activity.user || "GreenLeaf user",
        )}</strong><span>${escapeHtml(activity.title)}</span><small>${escapeHtml(
          activity.detail,
        )}</small><b class="${
          activity.status === "Attention" ? "attention" : ""
        }">${escapeHtml(activity.status || "Completed")}</b></div>`,
    )
    .join("");
}

// Displays the latest API connection and monitoring information.
export function renderMonitoring() {
  const statusMap = {
    connected: ["Healthy", "AWS product endpoint connected"],
    error: ["Unavailable", "Check API URL and CORS"],
    checking: ["Checking", "GET /products in progress"],
  };
  const [label, detail] = statusMap[state.apiStatus] || statusMap.checking;

  $("#monitorApiStatus").textContent = label;
  $("#monitorApiDetail").textContent = detail;
  $("#monitorResponseTime").textContent =
    state.lastResponseMs === null
      ? "—"
      : `${state.lastResponseMs} ms`;
  $("#monitorProductCount").textContent = state.products.length;
  $("#monitorLastCheck").textContent = state.lastCheckedAt
    ? formatTime(state.lastCheckedAt)
    : "—";

  const log = $("#monitorLog");
  if (!state.monitorEvents.length) {
    log.innerHTML = `<div class="empty-state">${icon(
      "cloud",
    )}<strong>No connection checks yet</strong><span>Run a health check to call GET /products.</span></div>`;
  } else {
    log.innerHTML = state.monitorEvents
      .map(
        (event) =>
          `<div class="monitor-entry"><time>${escapeHtml(
            formatTime(event.createdAt),
          )}</time><b class="${event.status}">${
            event.status === "success" ? "SUCCESS" : "ERROR"
          }</b><span>${escapeHtml(event.message)}</span><small>${
            event.duration === null
              ? "—"
              : `${event.duration} ms`
          }</small></div>`,
      )
      .join("");
  }

  const summary = state.telemetrySummary;
  $("#telemetryErrorCount").textContent = summary ? summary.errorCount : "—";
  $("#telemetrySuccessCount").textContent = summary ? summary.successCount : "—";
  $("#telemetryAvgResponse").textContent =
    summary && summary.avgResponseMs ? `${summary.avgResponseMs} ms` : "—";
  $("#telemetrySummaryWindow").textContent = summary
    ? `All sessions · last ${summary.windowMinutes} minutes`
    : "All sessions";

  const note = $("#telemetrySummaryNote");
  if (state.telemetrySummaryError) {
    note.textContent = `Couldn't load CloudWatch summary: ${state.telemetrySummaryError}`;
  } else if (summary) {
    note.textContent = `Read from CloudWatch namespace GreenLeaf/Frontend, generated at ${formatTime(summary.generatedAt)}.`;
  } else {
    note.textContent = "Click Refresh to pull aggregated metrics from CloudWatch.";
  }

  const events = state.telemetryEvents;
  const eventLog = $("#telemetryEventLog");
  if (!events || !events.length) {
    eventLog.innerHTML = `<div class="empty-state">${icon(
      "cloud",
    )}<strong>No events yet</strong><span>Recent frontend events across all sessions appear here.</span></div>`;
  } else {
    eventLog.innerHTML = events
      .map(
        (event) =>
          `<div class="monitor-entry"><time>${escapeHtml(
            event.receivedAt ? formatTime(event.receivedAt) : "—",
          )}</time><b class="${event.status}">${
            event.status === "error" ? "ERROR" : "SUCCESS"
          }</b><span>${escapeHtml(event.message || "No message")} · ${escapeHtml(
            event.page || "unknown",
          )}</span><small>${
            event.duration === null ? "—" : `${event.duration} ms`
          }</small></div>`,
      )
      .join("");
  }

  const eventsNote = $("#telemetryEventsNote");
  if (state.telemetryEventsError) {
    eventsNote.textContent = `Couldn't load CloudWatch Logs Insights events: ${state.telemetryEventsError}`;
  } else if (events) {
    eventsNote.textContent = `${events.length} most recent event${events.length === 1 ? "" : "s"} from CloudWatch Logs Insights.`;
  } else {
    eventsNote.textContent = "Click Refresh to pull recent events from CloudWatch Logs.";
  }
}

// Converts a Cognito UserStatus into a short human-readable label.
function accountStatusLabel(status) {
  if (status === "FORCE_CHANGE_PASSWORD") return "Invited (password not set)";
  if (status === "CONFIRMED") return "Active";
  return status || "Unknown";
}

// Displays the manager-only account directory (GET /users). Renders
// whatever's cached in state.users — actions.js's loadUsers() fetches it
// on first visiting the Team page (see goToPage() in app.js), not on every
// dashboard refresh, since it's a rarely-changing manager-only directory.
export function renderTeam() {
  const container = $("#userRows");
  if (!container) return;

  if (state.usersError) {
    container.innerHTML = `<div class="empty-state">${icon(
      "bell",
    )}<strong>Couldn't load accounts</strong><span>${escapeHtml(state.usersError)}</span></div>`;
    return;
  }

  if (!state.users.length) {
    container.innerHTML = `<div class="empty-state">${icon(
      "box",
    )}<strong>No accounts loaded</strong><span>Click Refresh to load the account directory.</span></div>`;
    return;
  }

  container.innerHTML = state.users
    .map(
      (user) =>
        `<div class="user-row"><span>${escapeHtml(user.email || user.username)}</span><span class="role-pill role-${
          user.role
        }">${escapeHtml(user.role)}</span><small>${escapeHtml(
          accountStatusLabel(user.status),
        )}</small><small>${escapeHtml(
          user.createdAt ? formatDateTime(user.createdAt) : "—",
        )}</small></div>`,
    )
    .join("");
}
