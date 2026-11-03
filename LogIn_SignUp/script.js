document.addEventListener("DOMContentLoaded", () => {
  const API = "login_api.php";

  const tabLogin = document.getElementById("tabLogin");
  const tabSignup = document.getElementById("tabSignup");
  const loginSection = document.getElementById("loginFormSection");
  const signupSection = document.getElementById("signupFormSection");

  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");

  const authAlert = document.getElementById("authAlert");

  // Tab Switching
  function switchTab(targetTab) {
    showAlert(""); // Clear active alerts

    if (targetTab === "login") {
      tabLogin.classList.add("active");
      tabLogin.setAttribute("aria-selected", "true");
      tabSignup.classList.remove("active");
      tabSignup.setAttribute("aria-selected", "false");

      loginSection.classList.add("active");
      signupSection.classList.remove("active");
    } else {
      tabSignup.classList.add("active");
      tabSignup.setAttribute("aria-selected", "true");
      tabLogin.classList.remove("active");
      tabLogin.setAttribute("aria-selected", "false");

      signupSection.classList.add("active");
      loginSection.classList.remove("active");
    }
  }

  tabLogin.addEventListener("click", () => switchTab("login"));
  tabSignup.addEventListener("click", () => switchTab("signup"));

  // Display Notification Alerts
  function showAlert(message, type = "error") {
    if (!message) {
      authAlert.hidden = true;
      authAlert.className = "alert-message";
      authAlert.textContent = "";
      return;
    }

    authAlert.className = `alert-message ${type}`;
    authAlert.textContent = message;
    authAlert.hidden = false;
  }

  // Persist User Session to Local & Session Storage for system compatibility
  function saveUserSession(user) {
    const payload = JSON.stringify(user);

    const storageKeys = [
      "sharebite_user",
      "currentUser",
      "user",
      "loggedInUser",
    ];
    storageKeys.forEach((key) => {
      sessionStorage.setItem(key, payload);
      localStorage.setItem(key, payload);
    });

    sessionStorage.setItem("user_id", user.user_id);
    localStorage.setItem("user_id", user.user_id);
  }

  // Handle Login Submit
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showAlert("");

    const submitBtn = document.getElementById("loginSubmitBtn");
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
      showAlert("Please fill in both email and password.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Logging in...";

    try {
      const response = await fetch(`${API}?action=login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (result.success) {
        showAlert(result.message, "success");
        saveUserSession(result.user);

        setTimeout(() => {
          window.location.href = result.redirect;
        }, 1000);
      } else {
        showAlert(result.message || "Login failed.");
      }
    } catch (error) {
      console.error("Login Error:", error);
      showAlert("Unable to reach server. Please try again.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Log In";
    }
  });

  // Handle Sign Up Submit
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showAlert("");

    const submitBtn = document.getElementById("signupSubmitBtn");
    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const role = document.getElementById("signupRole").value;
    const password = document.getElementById("signupPassword").value;

    if (!name || !email || !password) {
      showAlert("Please complete all required fields.");
      return;
    }

    if (password.length < 6) {
      showAlert("Password should be at least 6 characters long.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Creating account...";

    try {
      const response = await fetch(`${API}?action=signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role, password }),
      });

      const result = await response.json();

      if (result.success) {
        showAlert(result.message, "success");
        signupForm.reset();

        if (!result.requires_approval) {
          setTimeout(() => {
            switchTab("login");
            document.getElementById("loginEmail").value = email;
          }, 1800);
        }
      } else {
        showAlert(result.message || "Registration failed.");
      }
    } catch (error) {
      console.error("Signup Error:", error);
      showAlert("Unable to reach server. Please try again.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Account";
    }
  });
});
