let products = [
  {
    id: 1,
    name: "Milk 2L",
    category: "Dairy",
    price: 4.5,
    stock: 10,
    reorderLevel: 5
  },
  {
    id: 2,
    name: "Fresh Apples",
    category: "Fruit",
    price: 3.5,
    stock: 25,
    reorderLevel: 8
  },
  {
    id: 3,
    name: "Jasmine Rice 5kg",
    category: "Dry Goods",
    price: 17.9,
    stock: 12,
    reorderLevel: 6
  }
];

let sales = [];

function showPage(pageId, button) {
  const pages = document.querySelectorAll(".page");
  const buttons = document.querySelectorAll(".nav-button");

  pages.forEach(function(page) {
    page.classList.remove("active-page");
  });

  buttons.forEach(function(navButton) {
    navButton.classList.remove("active");
  });

  document.getElementById(pageId).classList.add("active-page");
  button.classList.add("active");
}

function formatMoney(amount) {
  return "$" + amount.toFixed(2);
}

function getStockStatus(product) {
  if (product.stock === 0) {
    return '<span class="status-sold-out">Sold Out</span>';
  }

  if (product.stock <= product.reorderLevel) {
    return '<span class="status-low">Low Stock</span>';
  }

  return '<span class="status-good">Good</span>';
}

function displayStock(product) {
  if (product.stock === 0) {
    return "Sold Out";
  }

  return product.stock;
}

function renderDashboard() {
  const totalProducts = products.length;
  const totalSales = sales.reduce(function(sum, sale) {
    return sum + sale.total;
  }, 0);
  const lowStockItems = products.filter(function(product) {
    return product.stock <= product.reorderLevel;
  });

  document.getElementById("totalProducts").innerText = totalProducts;
  document.getElementById("totalSales").innerText = formatMoney(totalSales);
  document.getElementById("lowStockCount").innerText = lowStockItems.length;

  const dashboardTable = document.getElementById("dashboardTable");
  dashboardTable.innerHTML = "";

  products.forEach(function(product) {
    dashboardTable.innerHTML += `
      <tr>
        <td>${product.name}</td>
        <td>${product.category}</td>
        <td>${displayStock(product)}</td>
        <td>${getStockStatus(product)}</td>
      </tr>
    `;
  });
}

function renderProducts() {
  const productTable = document.getElementById("productTable");
  const saleProduct = document.getElementById("saleProduct");

  productTable.innerHTML = "";
  saleProduct.innerHTML = "";

  products.forEach(function(product) {
    productTable.innerHTML += `
      <tr>
        <td>${product.name}</td>
        <td>${product.category}</td>
        <td>${formatMoney(product.price)}</td>
        <td>${displayStock(product)}</td>
        <td>
          <button class="small-button" onclick="restockProduct(${product.id})">
            Restock
          </button>
        </td>
      </tr>
    `;

    const disabledText = product.stock === 0 ? "disabled" : "";
    const stockText = product.stock === 0 ? "Sold Out" : product.stock + " left";

    saleProduct.innerHTML += `
      <option value="${product.id}" ${disabledText}>
        ${product.name} - ${stockText}
      </option>
    `;
  });
}

function renderSales() {
  const salesHistory = document.getElementById("salesHistory");
  salesHistory.innerHTML = "";

  if (sales.length === 0) {
    salesHistory.innerHTML = "<p>No sales recorded yet.</p>";
    return;
  }

  sales.forEach(function(sale) {
    salesHistory.innerHTML += `
      <div class="history-item">
        <strong>${sale.productName}</strong>
        Quantity sold: ${sale.quantity}<br>
        Total: ${formatMoney(sale.total)}
      </div>
    `;
  });
}

function renderAlerts() {
  const alertList = document.getElementById("alertList");
  alertList.innerHTML = "";

  const lowStockProducts = products.filter(function(product) {
    return product.stock <= product.reorderLevel;
  });

  if (lowStockProducts.length === 0) {
    alertList.innerHTML = "<p>No low stock alerts right now.</p>";
    return;
  }

  lowStockProducts.forEach(function(product) {
    alertList.innerHTML += `
      <div class="history-item">
        <strong>${product.name}</strong>
        Stock left: ${displayStock(product)}<br>
        Reorder level: ${product.reorderLevel}<br>
        Message: Need to restock this product.
      </div>
    `;
  });
}

function refreshScreen() {
  renderDashboard();
  renderProducts();
  renderSales();
  renderAlerts();
}

function restockProduct(productId) {
  const product = products.find(function(item) {
    return item.id === productId;
  });

  product.stock = product.stock + 10;
  refreshScreen();
}

document.getElementById("productForm").addEventListener("submit", function(event) {
  event.preventDefault();

  const newProduct = {
    id: Date.now(),
    name: document.getElementById("productName").value,
    category: document.getElementById("productCategory").value,
    price: Number(document.getElementById("productPrice").value),
    stock: Number(document.getElementById("productStock").value),
    reorderLevel: Number(document.getElementById("productReorder").value)
  };

  products.push(newProduct);
  event.target.reset();
  refreshScreen();
});

document.getElementById("saleForm").addEventListener("submit", function(event) {
  event.preventDefault();

  const productId = Number(document.getElementById("saleProduct").value);
  const quantitySold = Number(document.getElementById("saleQuantity").value);

  const product = products.find(function(item) {
    return item.id === productId;
  });

  if (product.stock === 0) {
    alert("This product is sold out. Please restock before selling.");
    return;
  }

  if (quantitySold > product.stock) {
    alert("Not enough stock available.");
    return;
  }

  product.stock = product.stock - quantitySold;

  sales.unshift({
    productName: product.name,
    quantity: quantitySold,
    total: product.price * quantitySold
  });

  document.getElementById("saleQuantity").value = 1;
  refreshScreen();
});

refreshScreen();
