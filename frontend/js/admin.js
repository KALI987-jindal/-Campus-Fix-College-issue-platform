/**
 * CampusFix Dean & Executive Admin Controller
 * Aligned with Google Stitch Civic Collegiate Design System
 */

let loadedDeptLeague = [];

/**
 * Escape HTML for XSS prevention
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Floating Toast Notification Helper
 */
function showToast(message, type = "success", duration = 4000) {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "stitch-toast-container";
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-atomic", "true");
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `stitch-toast toast-${type}`;
  toast.setAttribute("role", "status");

  let icon = "check_circle";
  if (type === "error") icon = "error";
  else if (type === "info") icon = "info";

  toast.innerHTML = `
    <span class="material-symbols-outlined stitch-toast-icon">${icon}</span>
    <div class="stitch-toast-content">${escapeHtml(message)}</div>
    <button class="stitch-toast-close" type="button" aria-label="Dismiss notification">&times;</button>
  `;

  const closeBtn = toast.querySelector(".stitch-toast-close");
  let removeTimeout = null;

  const dismissToast = () => {
    if (removeTimeout) clearTimeout(removeTimeout);
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 200);
  };

  if (closeBtn) closeBtn.addEventListener("click", dismissToast);
  removeTimeout = setTimeout(dismissToast, duration);
  container.appendChild(toast);
}

/**
 * Frontend Role Guard for Admin Command Center
 * Restricts access strictly to ADMIN, HOD, and SUPERVISOR roles (matching backend /admin routes).
 * Redirects unauthenticated sessions to index.html and other roles to their authorized dashboard.
 */
function checkAdminAuthGuard() {
  const user = typeof ApiClient !== "undefined" ? ApiClient.getUser() : null;
  const token = typeof ApiClient !== "undefined" ? ApiClient.getToken() : null;

  // If unauthenticated, redirect to index.html
  if (!user || !token) {
    window.location.href = "index.html";
    return false;
  }

  // Allowed roles matching backend /api/v1/admin/dashboard
  const allowedRoles = ["ADMIN", "HOD", "SUPERVISOR"];
  const userRole = (user.role || "").toUpperCase();

  if (!allowedRoles.includes(userRole)) {
    if (typeof redirectToDashboard === "function") {
      redirectToDashboard(userRole);
    } else {
      switch (userRole) {
        case "STUDENT":
          window.location.href = "student-dashboard.html";
          break;
        case "TEACHER":
          window.location.href = "teacher-dashboard.html";
          break;
        case "TECHNICIAN":
          window.location.href = "technician-workboard.html";
          break;
        default:
          window.location.href = "index.html";
      }
    }
    return false;
  }

  return true;
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", async () => {
    // 1. Authenticate & Role Guard
    if (!checkAdminAuthGuard()) return;

    setupDashboardHeader();
    await loadExecutiveDashboard();
    await loadBroadcasts();

    const broadcastForm = document.getElementById("createBroadcastForm");
    if (broadcastForm) {
      broadcastForm.addEventListener("submit", handleCreateBroadcast);
    }

    const deptSearchInput = document.getElementById("deptSearchInput");
    if (deptSearchInput) {
      deptSearchInput.addEventListener("input", handleDeptSearch);
    }
  });
}

function handleDeptSearch(e) {
  const term = (e.target.value || "").trim().toLowerCase();
  if (!loadedDeptLeague || loadedDeptLeague.length === 0) return;

  const filtered = loadedDeptLeague.filter(
    (d) =>
      d.name.toLowerCase().includes(term) ||
      (d.code && d.code.toLowerCase().includes(term))
  );
  renderDeptLeagueTable(filtered);
}

function renderDeptLeagueTable(departments) {
  const tbody = document.getElementById("deptLeagueTbody");
  if (!tbody) return;

  if (!departments || departments.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 2rem; color: var(--secondary);">
          No matching academic departments found.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = departments
    .map(
      (d) => `
      <tr>
        <td style="font-weight: 700; color: var(--primary);">
          ${escapeHtml(d.name)}
          <span class="badge" style="background: var(--surface-low); color: var(--secondary); font-size: 0.72rem; margin-left: 0.35rem; font-weight: 700;">
            ${escapeHtml(d.code || "")}
          </span>
        </td>
        <td style="text-align: center; font-weight: 600;">${d.total}</td>
        <td style="text-align: center;"><span style="color: var(--success); font-weight: 700;">${d.resolved}</span></td>
        <td style="text-align: center;"><span style="color: var(--danger); font-weight: 700;">${d.open}</span></td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div style="flex: 1; height: 8px; background: #e2e8f0; border-radius: 9999px; overflow: hidden;">
              <div style="width: ${Math.min(d.rate_percent, 100)}%; height: 100%; background: ${d.rate_percent >= 80 ? 'var(--success)' : d.rate_percent >= 50 ? 'var(--accent-blue)' : 'var(--danger)'}; border-radius: 9999px;"></div>
            </div>
            <span style="font-size: 0.82rem; font-weight: 800; min-width: 48px; text-align: right; color: var(--text-main);">${d.rate_percent}%</span>
          </div>
        </td>
      </tr>
    `
    )
    .join("");
}

async function loadExecutiveDashboard() {
  try {
    const data = await ApiClient.getAdminDashboard();

    // 1. Update KPIs
    const kpiTotal = document.getElementById("kpiTotal");
    const kpiResolved = document.getElementById("kpiResolved");
    const kpiOpen = document.getElementById("kpiOpen");
    const kpiRate = document.getElementById("kpiRate");
    const kpiSla = document.getElementById("kpiSla");
    const kpiCritical = document.getElementById("kpiCritical");

    if (kpiTotal) kpiTotal.textContent = data.kpis.total_issues;
    if (kpiResolved) kpiResolved.textContent = data.kpis.resolved_issues;
    if (kpiOpen) kpiOpen.textContent = data.kpis.open_issues;
    if (kpiRate) kpiRate.textContent = `${data.kpis.resolution_rate_percent}%`;
    if (kpiSla) kpiSla.textContent = data.kpis.sla_breached;
    if (kpiCritical) kpiCritical.textContent = data.kpis.critical_active;

    // 2. Render Department League Table
    loadedDeptLeague = data.department_league || [];
    renderDeptLeagueTable(loadedDeptLeague);
  } catch (e) {
    console.error("Failed to load admin metrics:", e);
    showToast("Failed to load executive metrics: " + e.message, "error");
  }
}

async function loadBroadcasts() {
  const container = document.getElementById("broadcastListContainer");
  if (!container) return;

  try {
    const notices = await ApiClient.getBroadcasts();
    if (!notices || notices.length === 0) {
      container.innerHTML = `
        <div style="color: var(--secondary); font-size: 0.85rem; padding: 1.5rem; text-align: center; background: var(--surface-low); border-radius: var(--radius-md); border: 1px dashed var(--border);">
          <span class="material-symbols-outlined" style="font-size: 28px; opacity: 0.5; margin-bottom: 0.25rem;">campaign</span>
          <div>No active maintenance bulletins.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = notices
      .map(
        (n) => `
      <div style="background: var(--surface-low); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.85rem 1rem; margin-bottom: 0.75rem; transition: all 0.15s ease;">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem;">
          <h4 style="font-size: 0.92rem; font-weight: 700; color: var(--primary); margin: 0; display: flex; align-items: center; gap: 0.4rem;">
            <span class="material-symbols-outlined" style="font-size: 18px; color: var(--accent-blue);">info</span>
            <span>${escapeHtml(n.title)}</span>
          </h4>
          <span class="term-badge" style="font-size: 0.65rem; padding: 0.15rem 0.45rem;">${escapeHtml(n.scope || "CAMPUS")}</span>
        </div>
        <p style="font-size: 0.84rem; color: var(--secondary); margin: 0.35rem 0 0.5rem 0; line-height: 1.4;">${escapeHtml(n.message)}</p>
        <div style="font-size: 0.72rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.35rem;">
          <span class="material-symbols-outlined" style="font-size: 14px;">schedule</span>
          <span>Published: ${new Date(n.created_at).toLocaleString()}</span>
        </div>
      </div>
    `
      )
      .join("");
  } catch (e) {
    console.error("Failed to load broadcasts:", e);
    container.innerHTML = `<div style="color: var(--danger); font-size: 0.82rem;">Failed to load broadcasts: ${escapeHtml(e.message)}</div>`;
  }
}

async function handleCreateBroadcast(e) {
  e.preventDefault();
  const titleInput = document.getElementById("bcTitle");
  const messageInput = document.getElementById("bcMessage");
  const submitBtn = document.getElementById("submitBroadcastBtn");

  const title = titleInput ? titleInput.value.trim() : "";
  const message = messageInput ? messageInput.value.trim() : "";

  if (!title || !message) {
    showToast("Please provide both a headline and details for the announcement.", "error");
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <span class="material-symbols-outlined" style="font-size: 18px; animation: spin 1s linear infinite;">sync</span>
      <span>Publishing...</span>
    `;
  }

  try {
    await ApiClient.createBroadcast(title, message, "CAMPUS_WIDE");
    document.getElementById("createBroadcastForm").reset();
    showToast("Campus-wide bulletin published successfully!", "success");
    await loadBroadcasts();
  } catch (err) {
    console.error("Broadcast error:", err);
    showToast("Broadcast error: " + err.message, "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <span class="material-symbols-outlined" style="font-size: 18px;">send</span>
        <span>Publish Campus Bulletin</span>
      `;
    }
  }
}

async function openAuditModal() {
  const exportBtn = document.getElementById("exportAuditBtn");
  if (exportBtn) exportBtn.disabled = true;

  try {
    const report = await ApiClient.getAuditReport();
    document.getElementById("auditInstitution").textContent = report.institution;
    document.getElementById("auditGenerated").textContent = new Date(report.generated_at).toLocaleString();
    document.getElementById("auditReceived").textContent = report.total_grievances_received;
    document.getElementById("auditResolved").textContent = report.total_grievances_resolved;
    document.getElementById("auditRate").textContent = `${report.resolution_percentage}%`;
    document.getElementById("auditInterventions").textContent = report.lecture_critical_interventions;
    document.getElementById("auditCompliance").textContent = report.statutory_compliance_status;

    document.getElementById("auditModal").classList.add("open");
  } catch (e) {
    console.error("Failed to generate audit report:", e);
    showToast("Failed to generate audit report: " + e.message, "error");
  } finally {
    if (exportBtn) exportBtn.disabled = false;
  }
}

function closeAuditModal() {
  document.getElementById("auditModal").classList.remove("open");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    checkAdminAuthGuard,
  };
}
