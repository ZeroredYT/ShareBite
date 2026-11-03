document.addEventListener("DOMContentLoaded", () => {
  // Sidebar View Switcher
  const navItems = document.querySelectorAll(".nav-item");
  const viewSections = document.querySelectorAll(".view-section");

  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      navItems.forEach((nav) => nav.classList.remove("active"));
      viewSections.forEach((section) =>
        section.classList.remove("active-view"),
      );

      item.classList.add("active");
      const targetViewId = item.getAttribute("data-view");
      const targetSection = document.getElementById(targetViewId);
      if (targetSection) {
        targetSection.classList.add("active-view");
      }
    });
  });

  // Fetch Database Data from api.php
  fetchData();
});

function fetchData() {
  fetch("api.php")
    .then((res) => res.json())
    .then((data) => {
      renderListings(data.listings);
      renderClaims(data.claims);
      renderImpact(data.impact);
      setupFilters();
    })
    .catch((err) => console.error("Data load error:", err));
}

function renderListings(listings) {
  const container = document.getElementById("cards-grid");
  if (!listings || listings.length === 0) {
    container.innerHTML =
      '<p class="subtitle">Nothing matches right now. Check back soon.</p>';
    return;
  }

  container.innerHTML = listings
    .map(
      (item) => `
    <div class="card" 
         data-category="${item.category_name.toLowerCase()}" 
         data-location="${item.location_name.toLowerCase()}" 
         data-minutes="${item.remaining_minutes}">
      <div class="card-header">
        <h2 class="category-title">${item.category_short}</h2>
      </div>
      <div class="card-body">
        <h3 class="item-title">${item.title}</h3>
        <div class="item-meta">
          <strong>${item.portions}</strong> portions · ~<strong>${parseFloat(item.estimated_kg)}</strong> kg · ${item.category_name}
        </div>
        <div class="item-meta">
          ${item.location_name} (${item.building})
        </div>
        <div class="item-meta">
          Pickup until ${item.formatted_expiry} · <strong class="time-highlight">${item.time_text}</strong>
        </div>
        <div class="item-meta donor-info">From ${item.provider_name}</div>
        
        ${item.needs_courier == 1 ? '<div class="tag-container"><span class="tag">courier delivery available</span></div>' : ""}

        <div class="card-footer">
          <button class="claim-btn" onclick="toggleClaim(this, '${item.title}')">Claim</button>
          <a href="edit_listing.php?id=${item.listing_id}" class="btn-action btn-edit">Edit</a>
          <a href="delete_listing.php?id=${item.listing_id}" onclick="return confirm('Delete this listing?');" class="btn-action btn-delete">Delete</a>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

function renderClaims(claims) {
  const container = document.getElementById("claims-grid");
  document.getElementById("claims-count").textContent = claims.length;

  if (!claims || claims.length === 0) {
    container.innerHTML = '<p class="subtitle">You have no active claims.</p>';
    return;
  }

  container.innerHTML = claims
    .map(
      (claim) => `
    <div class="claim-card">
      <h2 class="claim-item-title">${claim.item_title}</h2>
      <p class="claim-meta">${claim.portions} portions · from ${claim.provider_name}</p>
      
      <div class="status-badge ${claim.claim_status.toLowerCase()}">
        ${claim.claim_status}
      </div>

      ${
        claim.delivery_status
          ? `
        <div class="step-tracker">
          <span class="step ${claim.delivery_status === "awaiting_courier" ? "active" : ""}">Awaiting courier</span>
          <span class="step ${claim.delivery_status === "assigned" ? "active" : ""}">Assigned</span>
          <span class="step ${claim.delivery_status === "picked_up" ? "active" : ""}">Picked up</span>
          <span class="step ${claim.delivery_status === "en_route" ? "active" : ""}">En route</span>
          <span class="step ${claim.delivery_status === "delivered" ? "active" : ""}">Delivered</span>
        </div>
      `
          : ""
      }

      ${
        claim.dropoff_name
          ? `
        <p class="claim-dropoff">
          Drop-off: <strong>${claim.dropoff_name} (${claim.dropoff_building})</strong>
          ${claim.courier_name ? ` · courier <strong>${claim.courier_name}</strong>` : ""}
        </p>
      `
          : ""
      }

      ${
        claim.claim_status === "pending"
          ? `
        <p class="claim-instruction">Show this code at handoff:</p>
        <div class="code-box">${claim.claim_code.split("").join(" ")}</div>
        <p class="claim-subtext">Show it to the Courier when they arrive at your drop-off.</p>
        <button class="btn-secondary">Cancel claim</button>
      `
          : ""
      }

      ${
        claim.claim_status === "confirmed" && claim.rating === null
          ? `
        <div class="claim-action-area">
          <button class="btn-dark">Rate this pickup</button>
        </div>
      `
          : ""
      }

      ${
        claim.rating !== null
          ? `
        <p class="rating-text">Your rating: <strong>${claim.rating} / 5</strong> · "${claim.feedback}"</p>
      `
          : ""
      }
    </div>
  `,
    )
    .join("");
}

function renderImpact(impact) {
  if (!impact) return;
  document.getElementById("impact-pickups").textContent =
    impact.total_pickups || 0;
  document.getElementById("impact-meals").textContent = impact.total_meals || 0;
  document.getElementById("impact-kg").textContent = parseFloat(
    impact.total_kg || 0,
  );
}

function setupFilters() {
  const searchInput = document.getElementById("search-input");
  const categoryFilter = document.getElementById("category-filter");
  const locationFilter = document.getElementById("location-filter");
  const timeFilter = document.getElementById("time-filter");

  function filterListings() {
    const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const selectedCat = categoryFilter
      ? categoryFilter.value.toLowerCase()
      : "all";
    const selectedLoc = locationFilter
      ? locationFilter.value.toLowerCase()
      : "all";
    const selectedTime = timeFilter ? timeFilter.value : "all";

    const cards = document.querySelectorAll("#cards-grid .card");

    cards.forEach((card) => {
      const title =
        card.querySelector(".item-title")?.textContent.toLowerCase() || "";
      const category = card.getAttribute("data-category") || "";
      const location = card.getAttribute("data-location") || "";
      const minutes = parseInt(card.getAttribute("data-minutes") || "999", 10);

      const matchesSearch = title.includes(query);
      const matchesCat =
        selectedCat === "all" || category.includes(selectedCat);
      const matchesLoc =
        selectedLoc === "all" || location.includes(selectedLoc);

      let matchesTime = true;
      if (selectedTime === "under-1h") {
        matchesTime = minutes <= 60;
      } else if (selectedTime === "under-3h") {
        matchesTime = minutes <= 180;
      } else if (selectedTime === "more-3h") {
        matchesTime = minutes > 180;
      }

      if (matchesSearch && matchesCat && matchesLoc && matchesTime) {
        card.style.display = "flex";
      } else {
        card.style.display = "none";
      }
    });
  }

  if (searchInput) searchInput.addEventListener("input", filterListings);
  if (categoryFilter) categoryFilter.addEventListener("change", filterListings);
  if (locationFilter) locationFilter.addEventListener("change", filterListings);
  if (timeFilter) timeFilter.addEventListener("change", filterListings);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function toggleClaim(btn, title) {
  if (btn.classList.contains("claimed")) {
    btn.classList.remove("claimed");
    btn.textContent = "Claim";
    showToast(`Unclaimed "${title}"`);
  } else {
    btn.classList.add("claimed");
    btn.textContent = "Claimed";
    showToast(`Successfully claimed "${title}"!`);
  }
}

// Logout Handler
const logoutBtn = document.getElementById("logout-link");
if (logoutBtn) {
  logoutBtn.addEventListener("click", (e) => {
    e.preventDefault();

    // Clear all possible session/local storage auth keys used across roles
    const storageKeys = [
      "sharebite_user",
      "currentUser",
      "user",
      "loggedInUser",
      "user_id",
      "userId",
      "currentUserId",
    ];

    storageKeys.forEach((key) => {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    });

    // Redirect cleanly back to the login page relative to your folder layout
    window.location.href = "../LogIn_SignUp/index.html";
  });
}
