/**
 * CampusFix Authentication & Role Routing Controller
 */
document.addEventListener("DOMContentLoaded", async () => {
  // If already logged in on login page, redirect to appropriate dashboard
  const user = ApiClient.getUser();
  const isLoginPage = window.location.pathname.endsWith("index.html") || window.location.pathname === "/";

  if (user && isLoginPage) {
    redirectToDashboard(user.role);
    return;
  }

  // Populate academic department dropdowns if present
  const deptSelect = document.getElementById("regDepartment");
  if (deptSelect) {
    try {
      const depts = await ApiClient.getDepartments();
      deptSelect.innerHTML = depts.map(d => `<option value="${d.id}">${d.name} (${d.code})</option>`).join("");
    } catch (e) {
      console.error("Failed to load departments:", e);
    }
  }

  // Handle Login Form
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;
      const errorBox = document.getElementById("loginError");
      if (errorBox) errorBox.style.display = "none";

      try {
        const data = await ApiClient.login(email, password);
        redirectToDashboard(data.role);
      } catch (err) {
        if (errorBox) {
          errorBox.textContent = err.message || "Invalid credentials";
          errorBox.style.display = "block";
        }
      }
    });
  }

  // Handle Registration Form
  const registerForm = document.getElementById("registerForm");
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fullName = document.getElementById("regFullName").value.trim();
      const email = document.getElementById("regEmail").value.trim();
      const password = document.getElementById("regPassword").value;
      const role = document.getElementById("regRole").value;
      const deptId = document.getElementById("regDepartment").value;
      const designation = document.getElementById("regDesignation").value.trim();
      const errorBox = document.getElementById("regError");
      if (errorBox) errorBox.style.display = "none";

      try {
        const data = await ApiClient.register({
          full_name: fullName,
          email: email,
          password: password,
          role: role,
          academic_department_id: deptId ? parseInt(deptId) : null,
          designation: designation
        });
        redirectToDashboard(data.role);
      } catch (err) {
        if (errorBox) {
          errorBox.textContent = err.message || "Registration failed";
          errorBox.style.display = "block";
        }
      }
    });
  }
});

/**
 * 1-Click Quick Demo Login Helper (Instant Viva Showcase)
 */
async function quickDemoLogin(email) {
  try {
    const data = await ApiClient.login(email, "college123");
    redirectToDashboard(data.role);
  } catch (err) {
    alert("Demo login error: " + err.message);
  }
}

/**
 * Routes user to their dedicated role dashboard
 */
function redirectToDashboard(role) {
  switch (role) {
    case "STUDENT":
      window.location.href = "student-dashboard.html";
      break;
    case "TEACHER":
      window.location.href = "teacher-dashboard.html";
      break;
    case "HOD":
      window.location.href = "teacher-dashboard.html";
      break;
    case "SUPERVISOR":
    case "TECHNICIAN":
      window.location.href = "technician-workboard.html";
      break;
    case "ADMIN":
      window.location.href = "admin-dashboard.html";
      break;
    default:
      window.location.href = "student-dashboard.html";
  }
}

/**
 * Common Header Setup for all dashboards
 */
function setupDashboardHeader() {
  const user = ApiClient.getUser();
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const nameEl = document.getElementById("navUserName");
  const roleEl = document.getElementById("navUserRole");
  const deptEl = document.getElementById("navUserDept");

  if (nameEl) nameEl.textContent = user.full_name;
  if (roleEl) roleEl.textContent = user.role;
  if (deptEl) deptEl.textContent = user.academic_department_name || "Central Campus";

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => ApiClient.logout());
  }
}
