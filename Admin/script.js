let state = {
  listings: [],
  users: [],
  categories: [],
  locations: [],
};

async function loadDatabaseData() {
  try {
    const response = await fetch("api.php?action=get_data");
    const result = await response.json();

    if (result.success) {
      state.listings = result.listings;
      state.users = result.users;
      state.categories = result.categories;
      state.locations = result.locations;

      document.getElementById("stat-meals").textContent = result.stats.meals;
      document.getElementById("stat-food-kg").textContent =
        result.stats.food_kg;
      document.getElementById("stat-total-listings").textContent =
        result.listings.length;

      updateAll();
    } else {
      console.error("error loading data:", result.message);
    }
  } catch (error) {
    console.error("failed to connect to backend api:", error);
  }
}

document.querySelectorAll(".nav-btn").forEach((button) => {
  button.addEventListener("click", () => {
    switchTab(button.dataset.tab);
  });
});

function switchTab(tabId) {
  document
    .querySelectorAll(".nav-btn")
    .forEach((btn) => btn.classList.remove("active"));
  document
    .querySelectorAll(".tab-page")
    .forEach((page) => page.classList.remove("active"));

  const activeNavBtn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
  const activeTabPage = document.getElementById(`tab-${tabId}`);

  if (activeNavBtn) activeNavBtn.classList.add("active");
  if (activeTabPage) activeTabPage.classList.add("active");
}

function renderOverview() {
  const unverifiedUsers = state.users.filter(
    (u) => u.approval === "unverified",
  ).length;
  const unreviewedListings = state.listings.filter(
    (l) => l.review === "unreviewed",
  ).length;

  document.getElementById("unapproved-users-count").textContent =
    unverifiedUsers;
  document.getElementById("unreviewed-listings-count").textContent =
    unreviewedListings;

  const alertBanner = document.getElementById("overview-alert");
  if (unverifiedUsers === 0 && unreviewedListings === 0) {
    alertBanner.style.display = "none";
  } else {
    alertBanner.style.display = "block";
  }
}

// render listings: filters and renders the food listings table dynamically
function renderListings() {
  const tbody = document.getElementById("listings-tbody");
  const filter = document.getElementById("listing-filter-select").value;
  tbody.innerHTML = "";

  let filtered = state.listings;
  if (filter === "unreviewed")
    filtered = state.listings.filter((l) => l.review === "unreviewed");
  if (filter === "active")
    filtered = state.listings.filter(
      (l) => l.status === "active" || l.status === "claimed",
    );
  if (filter === "expired")
    filtered = state.listings.filter((l) => l.status === "expired");

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #6b766d; padding: 24px;">no listings available from database.</td></tr>`;
    return;
  }

  filtered.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <strong>${item.title}</strong>
        <div class="cell-subtext">${item.category_name} · ${item.location_name} (${item.building})</div>
      </td>
      <td>${item.provider_name}</td>
      <td>${item.portions} portions / ${item.estimated_kg} kg</td>
      <td><span class="badge badge-${item.status}">${item.status}</span></td>
      <td><span class="badge badge-${item.review}">${item.review}</span></td>
      <td class="actions-cell">
        ${item.review === "unreviewed" ? `<button class="btn btn-dark btn-sm">approve</button>` : ""}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// render users: filters and renders the users table with action buttons
function renderUsers() {
  const tbody = document.getElementById("users-tbody");
  const filter = document.getElementById("user-filter-select").value;
  tbody.innerHTML = "";

  let filtered = state.users;
  if (filter === "unverified")
    filtered = state.users.filter((u) => u.approval === "unverified");
  if (filter === "providers")
    filtered = state.users.filter((u) => u.role === "provider");
  if (filter === "couriers")
    filtered = state.users.filter((u) => u.role === "courier");
  if (filter === "recipients")
    filtered = state.users.filter((u) => u.role === "recipient");

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #6b766d; padding: 24px;">no users found in database.</td></tr>`;
    return;
  }

  filtered.forEach((user) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${user.name}</strong></td>
      <td>${user.email}</td>
      <td>${user.role}</td>
      <td><span class="badge badge-${user.approval}">${user.approval}</span></td>
      <td><span class="badge badge-${user.account}">${user.account}</span></td>
      <td class="actions-cell">
        ${user.approval === "unverified" ? `<button class="btn btn-dark btn-sm" onclick="approveUser(${user.id})">approve</button>` : ""}
        <button class="btn btn-outline btn-sm" onclick="toggleUserAccount(${user.id})">
          ${user.account === "active" ? "deactivate" : "activate"}
        </button>
        <button class="btn btn-danger btn-sm" onclick="deleteUser(${user.id})">delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// render categories and locations: populates management tables for setup items
function renderCategoriesAndLocations() {
  const catTbody = document.getElementById("categories-tbody");
  catTbody.innerHTML = "";

  if (state.categories.length === 0) {
    catTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #6b766d; padding: 24px;">no categories added yet.</td></tr>`;
  } else {
    state.categories.forEach((cat) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${cat.name}</td>
        <td><span class="badge badge-${cat.status}">${cat.status}</span></td>
        <td class="actions-cell">
          <button class="btn btn-outline btn-sm" onclick="toggleCategoryStatus(${cat.id})">
            ${cat.status === "active" ? "hide" : "show"}
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteCategory(${cat.id})">delete</button>
        </td>
      `;
      catTbody.appendChild(tr);
    });
  }

  const locTbody = document.getElementById("locations-tbody");
  locTbody.innerHTML = "";

  if (state.locations.length === 0) {
    locTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #6b766d; padding: 24px;">no locations added yet.</td></tr>`;
  } else {
    state.locations.forEach((loc) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${loc.name}</td>
        <td>${loc.building}</td>
        <td><span class="badge badge-${loc.status}">${loc.status}</span></td>
        <td class="actions-cell">
          <button class="btn btn-outline btn-sm" onclick="toggleLocationStatus(${loc.id})">
            ${loc.status === "active" ? "hide" : "show"}
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteLocation(${loc.id})">delete</button>
        </td>
      `;
      locTbody.appendChild(tr);
    });
  }
}

// approve user: sends post request to approve a pending user account
async function approveUser(id) {
  const response = await fetch("api.php?action=approve_user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: id }),
  });
  const result = await response.json();
  if (result.success) {
    loadDatabaseData();
  } else {
    alert(result.message || "could not approve user.");
  }
}

// toggle user account: activates or deactivates user account status
async function toggleUserAccount(id) {
  const response = await fetch("api.php?action=toggle_user_account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: id }),
  });
  const result = await response.json();
  if (result.success) {
    loadDatabaseData();
  } else {
    alert(result.message || "could not update user account status.");
  }
}

// delete user: prompts confirmation and deletes user record from database
async function deleteUser(id) {
  if (!confirm("are you sure you want to delete this user?")) return;

  const response = await fetch("api.php?action=delete_user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: id }),
  });
  const result = await response.json();
  if (result.success) {
    if (result.message) {
      alert(result.message);
    }
    loadDatabaseData();
  } else {
    alert("could not delete user.");
  }
}

// toggle category status: hides or shows a food category
async function toggleCategoryStatus(id) {
  const response = await fetch("api.php?action=toggle_category", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: id }),
  });
  const result = await response.json();
  if (result.success) {
    loadDatabaseData();
  } else {
    alert(result.message);
  }
}

// delete category: deletes or hides category based on server logic
async function deleteCategory(id) {
  if (!confirm("are you sure you want to delete this category?")) return;

  const response = await fetch("api.php?action=delete_category", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: id }),
  });
  const result = await response.json();

  if (result.success) {
    if (result.message) alert(result.message);
    loadDatabaseData();
  } else {
    alert("could not delete: " + result.message);
  }
}

// toggle location status: hides or shows a pickup location
async function toggleLocationStatus(id) {
  const response = await fetch("api.php?action=toggle_location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: id }),
  });
  const result = await response.json();
  if (result.success) {
    loadDatabaseData();
  } else {
    alert(result.message);
  }
}

// delete location: deletes or hides location based on server logic
async function deleteLocation(id) {
  if (!confirm("are you sure you want to delete this location?")) return;

  const response = await fetch("api.php?action=delete_location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: id }),
  });
  const result = await response.json();
  if (result.success) {
    if (result.message) {
      alert(result.message);
    }
    loadDatabaseData();
  } else {
    alert("could not delete location.");
  }
}

// add category form submission: handles creating a new food category
document
  .getElementById("add-category-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("cat-input-name");

    const response = await fetch("api.php?action=add_category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: input.value.trim() }),
    });

    const result = await response.json();
    if (result.success) {
      input.value = "";
      loadDatabaseData();
    } else {
      alert(result.message);
    }
  });

// add location form submission: handles creating a new pickup location
document
  .getElementById("add-location-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("loc-input-name");
    const bldgInput = document.getElementById("loc-input-building");

    const response = await fetch("api.php?action=add_location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nameInput.value.trim(),
        building: bldgInput.value.trim(),
      }),
    });

    const result = await response.json();
    if (result.success) {
      nameInput.value = "";
      bldgInput.value = "";
      loadDatabaseData();
    } else {
      alert(result.message);
    }
  });

// logout handler: clears session/local storage keys and redirects to login page
document.getElementById("logoutBtn")?.addEventListener("click", Logout);

async function Logout() {
  try {
    await fetch("../LogIn_SignUp/login_api.php?action=logout").catch(() => {});
  } catch (e) {}

  const storageKeys = [
    "sharebite_user",
    "currentUser",
    "user",
    "loggedInUser",
    "user_id",
  ];
  storageKeys.forEach((key) => {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  });

  window.location.href = "../LogIn_SignUp/index.html";
}

// update all: helper function to call all rendering functions at once
function updateAll() {
  renderOverview();
  renderListings();
  renderUsers();
  renderCategoriesAndLocations();
}

// initial load on page startup: fetches data immediately when script loads
loadDatabaseData();
