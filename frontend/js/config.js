// Default address of the AWS API Gateway inventory API.
export const DEFAULT_API_URL =
  "https://mrfuj9l955.execute-api.ap-southeast-2.amazonaws.com/prod";

// Prototype user profiles used by the login screen.
export const ROLE_PROFILES = {
  manager: {
    name: "Virasanh",
    title: "Store Manager",
    email: "manager@greenleaf.demo",
  },
  staff: {
    name: "Lee",
    title: "Store Staff",
    email: "staff@greenleaf.demo",
  },
  maintainer: {
    name: "Alexa",
    title: "System Maintainer",
    email: "maintainer@greenleaf.demo",
  },
};

// Stores temporary runtime state. Persistent business data comes from AWS.
export const state = {
  apiUrl: DEFAULT_API_URL,
  products: [],
  sales: [],
  activities: [],
  role: "manager",
  user: ROLE_PROFILES.manager,
  currentPage: "overview",
  editingProductId: null,
  deletingProductId: null,
  lastResponseMs: null,
  lastCheckedAt: null,
  apiStatus: "checking",
  monitorEvents: [],
  telemetrySummary: null,
  telemetrySummaryError: null,
  telemetryEvents: null,
  telemetryEventsError: null,
  toastTimer: null,
};
