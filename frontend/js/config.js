import { loadJson } from "./storage.js";

// Default address of the AWS API Gateway inventory API.
export const DEFAULT_API_URL =
  "https://mrfuj9l955.execute-api.ap-southeast-2.amazonaws.com/prod";

// Names used to store GreenLeaf data in the browser.
export const STORAGE_KEYS = {
  apiUrl: "greenleafApiUrl",
  mode: "greenleafDataMode",
  metadata: "greenleafProductMetadata",
  sales: "greenleafSales",
  activity: "greenleafActivity",
  session: "greenleafSession",
  demoProducts: "greenleafDemoProducts",
};

// Prototype user profiles used by the login screen.
export const ROLE_PROFILES = {
  manager: {
    name: "Maya Chen",
    title: "Store Manager",
    email: "manager@greenleaf.demo",
  },
  staff: {
    name: "Jordan Lee",
    title: "Store Staff",
    email: "staff@greenleaf.demo",
  },
  maintainer: {
    name: "Alex Morgan",
    title: "System Maintainer",
    email: "maintainer@greenleaf.demo",
  },
};

// Products displayed when the application is using sample-data mode.
export const DEMO_PRODUCTS = [
  { productId: "P001", name: "Fresh Full Cream Milk", price: 3.5, stock: 12 },
  { productId: "P002", name: "Wholemeal Sandwich Bread", price: 4.2, stock: 8 },
  { productId: "P003", name: "Royal Gala Apples", price: 5.9, stock: 42 },
  { productId: "P004", name: "Free Range Eggs", price: 7.8, stock: 6 },
  { productId: "P005", name: "Jasmine Rice", price: 16.5, stock: 31 },
  { productId: "P006", name: "Organic Oat Milk", price: 4.8, stock: 0 },
];

// Extra sample information that is not currently stored by the AWS backend.
export const DEMO_METADATA = {
  P001: { category: "Dairy", reorderLevel: 10 },
  P002: { category: "Bakery", reorderLevel: 10 },
  P003: { category: "Produce", reorderLevel: 12 },
  P004: { category: "Dairy", reorderLevel: 8 },
  P005: { category: "Pantry", reorderLevel: 8 },
  P006: { category: "Beverages", reorderLevel: 6 },
};

// Stores the current state of the GreenLeaf application.
export const state = {
  apiUrl: localStorage.getItem(STORAGE_KEYS.apiUrl) || DEFAULT_API_URL,
  mode: localStorage.getItem(STORAGE_KEYS.mode) || "api",
  products: [],
  metadata: loadJson(STORAGE_KEYS.metadata, {}),
  sales: loadJson(STORAGE_KEYS.sales, []),
  activities: loadJson(STORAGE_KEYS.activity, []),
  role: "manager",
  user: ROLE_PROFILES.manager,
  currentPage: "overview",
  editingProductId: null,
  deletingProductId: null,
  lastResponseMs: null,
  lastCheckedAt: null,
  apiStatus: "checking",
  monitorEvents: [],
  toastTimer: null,
};
