"use strict";
const $ = (id) => document.getElementById(id);
let csrf = "",
  verified = false,
  items = [];
async function api(action, data) {
  const options =
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          body: JSON.stringify(data),
        };
  const response = await fetch(
    "provider.php?action=" + encodeURIComponent(action),
    options,
  );
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Request failed");
  return result;
}
function message(text) {
  $("message").textContent = text;
}
function optionList(id, rows, key, label) {
  $(id).replaceChildren(
    ...rows.map((row) => {
      const o = document.createElement("option");
      o.value = row[key];
      o.textContent = row[label];
      return o;
    }),
  );
}
function fmt(date) {
  return date ? new Date(date.replace(" ", "T")).toLocaleString() : "";
}
function localInput(date) {
  return date ? date.replace(" ", "T").slice(0, 16) : "";
}
function el(tag, content, cls) {
  const e = document.createElement(tag);
  if (content !== undefined) e.textContent = content;
  if (cls) e.className = cls;
  return e;
}
function addButton(parent, text, callback, disabled = false) {
  const b = el("button", text);
  b.type = "button";
  b.disabled = disabled;
  b.addEventListener("click", callback);
  parent.append(b);
}
function render() {
  const cards = $("cards");
  cards.replaceChildren();
  if (!items.length)
    cards.append(
      el("p", "No listings yet. Post your first surplus food listing."),
    );
  for (const item of items) {
    const card = el("article", undefined, "card");
    card.append(
      el("span", item.status, "status"),
      el("h3", item.title),
      el("p", `${item.portions} portions · ${item.estimated_kg} kg`),
      el("p", `${item.category_name} · ${item.location_name}`),
      el("p", "Expires: " + fmt(item.expiry_time)),
      el("p", item.needs_courier == 1 ? "Courier available" : "Self-pickup"),
      el(
        "p",
        item.is_verified == 1 ? "Admin reviewed" : "Awaiting listing review",
      ),
    );
    const actions = el("div", undefined, "actions");
    if (item.status === "available") {
      addButton(actions, "Edit", () => openEditor(item), !verified);
      addButton(actions, "Cancel", () => cancelListing(item));
    }
    if (item.status === "claimed" && item.needs_courier == 0)
      addButton(actions, "Verify pickup", () => {
        $("verifyId").value = item.listing_id;
        $("claimCode").value = "";
        $("verifyDialog").showModal();
      });
    card.append(actions);
    cards.append(card);
  }
}
async function refresh() {
  const result = await api("list");
  items = result.listings;
  const s = result.stats;
  $("active").textContent = s.active;
  $("meals").textContent = s.collected_portions;
  $("expired").textContent = s.expired;
  $("impactMeals").textContent = s.collected_portions;
  $("weight").textContent = Number(s.saved_kg).toFixed(2);
  render();
}
function openEditor(item) {
  $("listingForm").reset();
  $("listingId").value = item?.listing_id || "";
  $("formHeading").textContent = item ? "Edit listing" : "Post a listing";
  if (item) {
    $("title").value = item.title;
    $("portions").value = item.portions;
    $("kg").value = item.estimated_kg;
    $("category").value = item.category_id;
    $("location").value = item.location_id;
    $("expiry").value = localInput(item.expiry_time);
    $("courier").checked = item.needs_courier == 1;
  } else {
    $("expiry").value = localInput(
      new Date(Date.now() + 2 * 3600000).getFullYear() +
        "-" +
        String(new Date().getMonth() + 1).padStart(2, "0") +
        "-" +
        String(new Date().getDate()).padStart(2, "0") +
        " 23:59:00",
    );
  }
  $("editor").showModal();
}
async function cancelListing(item) {
  if (!confirm("Cancel " + item.title + "?")) return;
  try {
    await api("cancel", { listing_id: item.listing_id });
    message("Listing cancelled.");
    await refresh();
  } catch (e) {
    message(e.message);
  }
}
window.addEventListener("DOMContentLoaded", async () => {
  try {
    const init = await api("init");
    csrf = init.csrf;
    verified = init.user.verified;
    $("greeting").textContent =
      "Welcome, " + init.user.name + ". Manage surplus food and reduce waste.";
    $("approval").hidden = verified;
    $("addButton").disabled = !verified;
    optionList("category", init.categories, "category_id", "name");
    optionList("location", init.locations, "location_id", "name");
    await refresh();
  } catch (e) {
    message(e.message);
    $("addButton").disabled = true;
  }
  $("addButton").addEventListener("click", () => openEditor(null));
  $("closeDialog").addEventListener("click", () => $("editor").close());
  $("closeVerify").addEventListener("click", () => $("verifyDialog").close());
  document.querySelectorAll("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      const impact = b.dataset.tab === "impact";
      $("listingsView").hidden = impact;
      $("impactView").hidden = !impact;
      $("pageTitle").textContent = impact ? "Impact stats" : "Your listings";
      document
        .querySelectorAll("[data-tab]")
        .forEach((n) => n.classList.toggle("active", n === b));
    }),
  );
  $("listingForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("listingId").value;
    const data = {
      title: $("title").value,
      portions: Number($("portions").value),
      estimated_kg: Number($("kg").value),
      category_id: Number($("category").value),
      location_id: Number($("location").value),
      expiry_time: $("expiry").value,
      needs_courier: $("courier").checked,
    };
    if (id) data.listing_id = Number(id);
    try {
      await api(id ? "update" : "create", data);
      $("editor").close();
      message(id ? "Listing updated." : "Listing posted.");
      await refresh();
    } catch (err) {
      message(err.message);
    }
  });
  $("verifyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("verify", {
        listing_id: Number($("verifyId").value),
        claim_code: $("claimCode").value,
      });
      $("verifyDialog").close();
      message("Collection confirmed.");
      await refresh();
    } catch (err) {
      message(err.message);
    }
  });
});
// Add this inside your window.addEventListener('DOMContentLoaded', async () => { ... }) function:
$("logoutLink").addEventListener("click", async (e) => {
  e.preventDefault();
  try {
    await api("logout", {});
  } catch (_) {
    // Proceed even if network request fails
  }

  // Clear any client storage tokens just in case
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

  // Redirect to login page
  window.location.href = "../LogIn_SignUp/index.html";
});
