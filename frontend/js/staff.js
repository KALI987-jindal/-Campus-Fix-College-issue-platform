/**
 * CampusFix Supervisor & Ground Staff Workboard Controller
 * Aligned with Google Stitch Civic Collegiate Design System
 */

let techniciansList = [];
let allLoadedTasks = [];
let currentTaskTab = "ALL"; // "ALL" | "CRITICAL" | "MY_ASSIGNED"
let currentStatusFilter = "ALL";
let currentTradeFilter = "ALL";
let currentSearchTerm = "";

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
 * Frontend Role Guard for Maintenance & Ground Staff Workboard
 * Restricts access strictly to TECHNICIAN, SUPERVISOR, and ADMIN roles (matching backend /staff routes).
 * Redirects unauthenticated sessions to index.html and other roles to their authorized dashboard.
 */
function checkTechnicianAuthGuard() {
  const user = typeof ApiClient !== "undefined" ? ApiClient.getUser() : null;
  const token = typeof ApiClient !== "undefined" ? ApiClient.getToken() : null;

  // If unauthenticated, redirect to index.html
  if (!user || !token) {
    window.location.href = "index.html";
    return false;
  }

  // Allowed roles matching backend /api/v1/staff/my-tasks
  const allowedRoles = ["TECHNICIAN", "SUPERVISOR", "ADMIN"];
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
        case "HOD":
          window.location.href = "teacher-dashboard.html";
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
    if (!checkTechnicianAuthGuard()) return;

    setupDashboardHeader();
    await loadTechnicians();
    await loadStaffTasks();

    // 2. Setup Role Notice Banner
    const user = ApiClient.getUser();
    if (user && user.role === "TECHNICIAN") {
      const techNotice = document.getElementById("techRoleNotice");
      const techNoticeText = document.getElementById("techRoleNoticeText");
      if (techNotice) {
        if (techNoticeText) {
          techNoticeText.textContent = `Active Ground Staff: ${user.full_name} (${user.trade_specialty || "Maintenance Specialist"})`;
        }
        techNotice.style.display = "flex";
      }
    }

    // 3. Bind Search & Filter Controls
    setupTaskFilters();
  });
}

function setupTaskFilters() {
  const searchInput = document.getElementById("taskSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentSearchTerm = (e.target.value || "").trim().toLowerCase();
      filterAndRenderTasks();
    });
  }

  const statusSelect = document.getElementById("taskStatusFilter");
  if (statusSelect) {
    statusSelect.addEventListener("change", (e) => {
      currentStatusFilter = e.target.value;
      filterAndRenderTasks();
    });
  }

  const tradeSelect = document.getElementById("taskTradeFilter");
  if (tradeSelect) {
    tradeSelect.addEventListener("change", (e) => {
      currentTradeFilter = e.target.value;
      filterAndRenderTasks();
    });
  }

  // Nav Tabs
  const tabAll = document.getElementById("tabAllTasks");
  const tabCritical = document.getElementById("tabCriticalTasks");
  const tabMy = document.getElementById("tabMyTasks");

  const setTab = (tabName, el) => {
    currentTaskTab = tabName;
    [tabAll, tabCritical, tabMy].forEach((t) => t && t.classList.remove("active"));
    if (el) el.classList.add("active");
    filterAndRenderTasks();
  };

  if (tabAll) tabAll.addEventListener("click", () => setTab("ALL", tabAll));
  if (tabCritical) tabCritical.addEventListener("click", () => setTab("CRITICAL", tabCritical));
  if (tabMy) tabMy.addEventListener("click", () => setTab("MY_ASSIGNED", tabMy));
}

async function loadTechnicians() {
  const user = ApiClient.getUser();
  if (user && ["SUPERVISOR", "ADMIN", "HOD"].includes((user.role || "").toUpperCase())) {
    try {
      techniciansList = await ApiClient.getTechnicians();
    } catch (e) {
      techniciansList = [];
    }
  } else {
    techniciansList = [];
  }
}

async function loadStaffTasks() {
  const container = document.getElementById("tasksContainer");
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 3rem; color: var(--secondary);">
      <span class="material-symbols-outlined" style="font-size: 32px; animation: spin 1.5s linear infinite; margin-bottom: 0.5rem;">sync</span>
      <div>Refreshing maintenance assignments...</div>
    </div>
  `;

  try {
    const tasks = await ApiClient.getMyTasks();
    allLoadedTasks = tasks || [];

    // Calculate Quick Queue KPIs
    updateQueueKPIs(allLoadedTasks);

    // Render Filtered Tasks
    filterAndRenderTasks();
  } catch (e) {
    console.error("Failed to load tasks:", e);
    container.innerHTML = `
      <div style="background: #fee2e2; border: 1px solid #f87171; color: #991b1b; padding: 1.25rem; border-radius: var(--radius-md); text-align: center;">
        <span class="material-symbols-outlined" style="font-size: 28px; margin-bottom: 0.25rem;">error</span>
        <div style="font-weight: 700;">Failed to load maintenance tasks</div>
        <div style="font-size: 0.85rem; margin-top: 0.25rem;">${escapeHtml(e.message)}</div>
      </div>
    `;
    showToast("Failed to load maintenance queue: " + e.message, "error");
  }
}

function updateQueueKPIs(tasks) {
  const kpiTotal = document.getElementById("kpiQueueTotal");
  const kpiCritical = document.getElementById("kpiQueueCritical");
  const kpiInProgress = document.getElementById("kpiQueueInProgress");
  const kpiSubmitted = document.getElementById("kpiQueueSubmitted");

  const total = tasks.length;
  const critical = tasks.filter((t) => t.priority === "LECTURE_CRITICAL").length;
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const submitted = tasks.filter((t) => t.status === "SUBMITTED").length;

  if (kpiTotal) kpiTotal.textContent = total;
  if (kpiCritical) kpiCritical.textContent = critical;
  if (kpiInProgress) kpiInProgress.textContent = inProgress;
  if (kpiSubmitted) kpiSubmitted.textContent = submitted;
}

function filterAndRenderTasks() {
  const container = document.getElementById("tasksContainer");
  if (!container) return;

  const user = ApiClient.getUser();
  const userId = user ? user.user_id : null;

  let filtered = [...allLoadedTasks];

  // 1. Tab Filter
  if (currentTaskTab === "CRITICAL") {
    filtered = filtered.filter((t) => t.priority === "LECTURE_CRITICAL");
  } else if (currentTaskTab === "MY_ASSIGNED") {
    filtered = filtered.filter((t) => userId && t.assigned_technician_id === userId);
  }

  // 2. Status Select Filter
  if (currentStatusFilter !== "ALL") {
    filtered = filtered.filter((t) => t.status === currentStatusFilter);
  }

  // 3. Trade Select Filter
  if (currentTradeFilter !== "ALL") {
    filtered = filtered.filter((t) => (t.service_trade || "").toUpperCase() === currentTradeFilter);
  }

  // 4. Keyword Search Filter
  if (currentSearchTerm) {
    filtered = filtered.filter((t) => {
      const title = (t.title || "").toLowerCase();
      const desc = (t.description || "").toLowerCase();
      const loc = (t.location_room_or_block || "").toLowerCase();
      const trade = (t.service_trade || "").toLowerCase();
      const dept = (t.academic_department_name || "").toLowerCase();
      return (
        title.includes(currentSearchTerm) ||
        desc.includes(currentSearchTerm) ||
        loc.includes(currentSearchTerm) ||
        trade.includes(currentSearchTerm) ||
        dept.includes(currentSearchTerm)
      );
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="background: #ffffff; border: 1px dashed var(--border); border-radius: var(--radius-lg); padding: 3rem 1.5rem; text-align: center; color: var(--secondary);">
        <span class="material-symbols-outlined" style="font-size: 48px; color: #10b981; opacity: 0.8; margin-bottom: 0.5rem;">task_alt</span>
        <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--primary); margin: 0 0 0.35rem 0;">No Active Tasks In This View</h3>
        <p style="font-size: 0.88rem; margin: 0; max-width: 420px; margin: 0 auto; line-height: 1.5;">
          All work orders matching your filters have either been resolved or cleared from the queue.
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(renderTaskCard).join("");
}

function renderTaskCard(task) {
  const user = ApiClient.getUser();
  const isSupervisor = user && (user.role === "SUPERVISOR" || user.role === "ADMIN");

  const isLectureCritical = task.priority === "LECTURE_CRITICAL";
  const cardCriticalClass = isLectureCritical ? "tech-card-critical" : "";

  const priorityBadge = isLectureCritical
    ? `<span class="badge badge-lecture-critical" style="display: inline-flex; align-items: center; gap: 0.3rem;"><span class="material-symbols-outlined" style="font-size: 14px;">emergency</span><span>🚨 LECTURE-CRITICAL (15m SLA)</span></span>`
    : `<span class="badge" style="font-weight: 700;">${escapeHtml(task.priority)}</span>`;

  const statusBadge = `badge badge-${task.status.toLowerCase()}`;

  // Supervisor Assignment Dropdown
  let assignControlsHtml = "";
  if (isSupervisor && task.status === "SUBMITTED") {
    const techOptions = techniciansList
      .map((t) => `<option value="${t.id}">${escapeHtml(t.full_name)} (${escapeHtml(t.trade_specialty || "General")})</option>`)
      .join("");

    assignControlsHtml = `
      <div style="margin-top: 1rem; padding: 0.85rem 1rem; background: var(--surface-low); border: 1px solid var(--border); border-radius: var(--radius-md); display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
        <span style="font-size: 0.85rem; font-weight: 700; color: var(--primary); display: flex; align-items: center; gap: 0.35rem;">
          <span class="material-symbols-outlined" style="font-size: 18px; color: var(--accent-blue);">send_time_extension</span>
          <span>Dispatch Ground Worker:</span>
        </span>
        <select id="assignTech-${task.id}" class="form-control" style="max-width: 260px; padding: 0.45rem 0.65rem; font-size: 0.85rem;">
          <option value="">-- Choose Specialist --</option>
          ${techOptions}
        </select>
        <button class="btn btn-sm btn-primary" onclick="handleAssignWorker(${task.id})" style="display: flex; align-items: center; gap: 0.35rem; font-weight: 700;">
          <span class="material-symbols-outlined" style="font-size: 16px;">outgoing_mail</span>
          <span>Dispatch Order</span>
        </button>
      </div>
    `;
  }

  // Ground Worker 1-Click Action Buttons
  let workerActionsHtml = "";
  if (task.status === "ASSIGNED" || task.status === "SUBMITTED") {
    workerActionsHtml = `
      <button class="btn btn-primary" onclick="updateTaskStatus(${task.id}, 'IN_PROGRESS')" style="display: flex; align-items: center; gap: 0.4rem; font-weight: 700;">
        <span class="material-symbols-outlined" style="font-size: 18px;">play_arrow</span>
        <span>🟢 Start Work</span>
      </button>
    `;
  } else if (task.status === "IN_PROGRESS") {
    workerActionsHtml = `
      <button class="btn btn-success" onclick="openProofModal(${task.id})" style="display: flex; align-items: center; gap: 0.4rem; font-weight: 700;">
        <span class="material-symbols-outlined" style="font-size: 18px;">photo_camera</span>
        <span>📸 Upload Fix Photo &amp; Complete</span>
      </button>
    `;
  }

  let slotHtml = "";
  if (task.teacher_availability_slot) {
    slotHtml = `
      <div style="font-size: 0.82rem; background: #faf5ff; padding: 0.45rem 0.75rem; border-radius: var(--radius-sm); border: 1px dashed #d8b4fe; margin-top: 0.65rem; color: #6b21a8; display: flex; align-items: center; gap: 0.4rem;">
        <span class="material-symbols-outlined" style="font-size: 16px;">schedule</span>
        <span><strong>Teacher Availability Window:</strong> ${escapeHtml(task.teacher_availability_slot)}</span>
      </div>
    `;
  }

  return `
    <div class="tech-card-modern ${cardCriticalClass} tech-mobile-card" id="task-card-${task.id}">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.65rem; flex-wrap: wrap; gap: 0.5rem;">
        <span class="badge" style="background: var(--surface-low); color: var(--primary); font-weight: 700; display: flex; align-items: center; gap: 0.35rem;">
          <span class="material-symbols-outlined" style="font-size: 15px;">corporate_fare</span>
          <span>${escapeHtml(task.academic_department_name || "Campus Facility")}</span>
        </span>
        <div style="display: flex; gap: 0.4rem; align-items: center;">
          ${priorityBadge}
          <span class="${statusBadge}" style="font-weight: 700;">${escapeHtml(task.status)}</span>
        </div>
      </div>

      <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--primary); margin: 0 0 0.35rem 0; line-height: 1.3;">${escapeHtml(task.title)}</h3>
      <p style="font-size: 0.9rem; color: var(--secondary); margin: 0 0 0.85rem 0; line-height: 1.5;">${escapeHtml(task.description)}</p>

      <div class="tech-meta-grid">
        <div style="display: flex; align-items: center; gap: 0.35rem;">
          <span class="material-symbols-outlined" style="font-size: 18px; color: var(--accent-blue);">pin_drop</span>
          <span><strong>Location:</strong> ${escapeHtml(task.location_room_or_block)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.35rem;">
          <span class="material-symbols-outlined" style="font-size: 18px; color: #b45309;">build</span>
          <span><strong>Trade:</strong> ${escapeHtml(task.service_trade)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.35rem;">
          <span class="material-symbols-outlined" style="font-size: 18px; color: #166534;">badge</span>
          <span><strong>Worker:</strong> ${escapeHtml(task.assigned_technician_name || "Awaiting Dispatch")}</span>
        </div>
      </div>

      ${slotHtml}
      ${assignControlsHtml}

      <div class="tech-mobile-actions" style="margin-top: 1rem; display: flex; justify-content: flex-end; gap: 0.5rem;">
        ${workerActionsHtml}
      </div>
    </div>
  `;
}

async function handleAssignWorker(taskId) {
  const select = document.getElementById(`assignTech-${taskId}`);
  const techId = select ? select.value : null;
  if (!techId) {
    showToast("Please choose a ground worker from the list before dispatching.", "error");
    return;
  }

  try {
    await ApiClient.assignTicket(taskId, parseInt(techId));
    showToast("Work order dispatched to ground worker successfully!", "success");
    await loadStaffTasks();
  } catch (e) {
    console.error("Dispatch error:", e);
    showToast("Dispatch error: " + e.message, "error");
  }
}

async function updateTaskStatus(taskId, status) {
  try {
    await ApiClient.updateStatus(taskId, status, "Technician on site, work in progress");
    showToast(`Status updated to ${status}. Work started!`, "success");
    await loadStaffTasks();
  } catch (e) {
    console.error("Status update error:", e);
    showToast("Status update error: " + e.message, "error");
  }
}

// ── Proof Modal & File Upload Logic (Batch 5C Integration Preserved) ──────────

let activeProofTaskId = null;

function openProofModal(taskId) {
  activeProofTaskId = taskId;

  const fileInput = document.getElementById("proofPhotoFile");
  const noteInput = document.getElementById("proofNote");
  const hiddenUrl = document.getElementById("proofPhotoUrl");
  const previewBox = document.getElementById("proofPreviewContainer");
  const statusBox = document.getElementById("proofStatusMessage");
  const submitBtn = document.getElementById("submitProofBtn");

  if (fileInput) {
    fileInput.value = "";
    fileInput.onchange = handleProofFileChange;
  }
  if (noteInput) noteInput.value = "";
  if (hiddenUrl) hiddenUrl.value = "";
  if (previewBox) previewBox.style.display = "none";
  if (statusBox) {
    statusBox.style.display = "none";
    statusBox.textContent = "";
  }
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `
      <span class="material-symbols-outlined" style="font-size: 18px;">verified</span>
      <span>Verify &amp; Mark Resolved</span>
    `;
  }

  const modal = document.getElementById("proofModal");
  if (modal) modal.classList.add("open");
}

function closeProofModal() {
  activeProofTaskId = null;
  const modal = document.getElementById("proofModal");
  if (modal) modal.classList.remove("open");
}

function handleProofFileChange(e) {
  const fileInput = e ? e.target : document.getElementById("proofPhotoFile");
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) return;

  const file = fileInput.files[0];
  const maxBytes = 10 * 1024 * 1024; // 10 MB

  if (file.size > maxBytes) {
    showProofStatus("File exceeds the 10 MB limit. Please select a smaller image.", "error");
    fileInput.value = "";
    const previewBox = document.getElementById("proofPreviewContainer");
    if (previewBox) previewBox.style.display = "none";
    return;
  }

  // Clear any existing error
  const statusBox = document.getElementById("proofStatusMessage");
  if (statusBox) statusBox.style.display = "none";

  // Show image preview
  const previewBox = document.getElementById("proofPreviewContainer");
  const previewImg = document.getElementById("proofPreviewImg");
  const fileInfo = document.getElementById("proofFileInfo");

  if (previewImg && typeof URL !== "undefined" && URL.createObjectURL) {
    previewImg.src = URL.createObjectURL(file);
    if (previewBox) previewBox.style.display = "block";
  }

  if (fileInfo) {
    const sizeKb = (file.size / 1024).toFixed(1);
    fileInfo.textContent = `📷 ${escapeHtml(file.name)} (${sizeKb} KB)`;
  }
}

function showProofStatus(message, type) {
  const statusBox = document.getElementById("proofStatusMessage");
  if (!statusBox) return;

  statusBox.textContent = message;
  statusBox.style.display = "block";

  if (type === "error") {
    statusBox.style.background = "#fee2e2";
    statusBox.style.color = "#991b1b";
    statusBox.style.border = "1px solid #f87171";
  } else if (type === "success") {
    statusBox.style.background = "#dcfce7";
    statusBox.style.color = "#166534";
    statusBox.style.border = "1px solid #86efac";
  } else {
    statusBox.style.background = "#e0f2fe";
    statusBox.style.color = "#075985";
    statusBox.style.border = "1px solid #7dd3fc";
  }
}

function setProofLoading(isLoading, label = "Processing...") {
  const submitBtn = document.getElementById("submitProofBtn");
  const cancelBtn = document.getElementById("cancelProofBtn");

  if (submitBtn) {
    submitBtn.disabled = isLoading;
    submitBtn.innerHTML = isLoading
      ? `<span class="material-symbols-outlined" style="font-size: 18px; animation: spin 1s linear infinite;">sync</span><span>${escapeHtml(label)}</span>`
      : `<span class="material-symbols-outlined" style="font-size: 18px;">verified</span><span>Verify &amp; Mark Resolved</span>`;
  }
  if (cancelBtn) {
    cancelBtn.disabled = isLoading;
  }
}

async function submitProof() {
  if (!activeProofTaskId) return;

  const fileInput = document.getElementById("proofPhotoFile");
  const noteInput = document.getElementById("proofNote");

  const file = fileInput && fileInput.files ? fileInput.files[0] : null;
  const note = noteInput ? noteInput.value.trim() : "";

  // 1. Client-Side Validations
  if (!file) {
    showProofStatus("Please select or capture a proof photo before resolving.", "error");
    return;
  }

  const maxBytes = 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    showProofStatus("File exceeds the 10 MB limit. Please select a smaller image.", "error");
    return;
  }

  if (!note) {
    showProofStatus("Please provide a brief resolution summary note.", "error");
    return;
  }

  // 2. Set Loading State
  setProofLoading(true, "Uploading photo proof...");
  showProofStatus("Uploading image to server...", "info");

  try {
    // 3. Upload file via FormData to POST /api/v1/uploads
    const uploadRes = await ApiClient.uploadFile(file);
    if (!uploadRes || !uploadRes.url) {
      throw new Error("Upload did not return a valid photo URL.");
    }

    const hiddenUrl = document.getElementById("proofPhotoUrl");
    if (hiddenUrl) hiddenUrl.value = uploadRes.url;

    setProofLoading(true, "Recording resolution proof...");
    showProofStatus("Registering repair proof...", "info");

    // 4. Submit proof URL to POST /api/v1/staff/issues/{id}/proof
    await ApiClient.uploadProof(activeProofTaskId, uploadRes.url, note);

    showProofStatus("Proof verified! Ticket marked as RESOLVED.", "success");
    showToast("Repair proof verified and ticket closed!", "success");

    // Brief delay so user sees confirmation before queue refresh
    setTimeout(async () => {
      closeProofModal();
      await loadStaffTasks();
    }, 600);

  } catch (err) {
    console.error("Proof submission failed:", err);
    showProofStatus(`Failed to complete ticket: ${err.message}`, "error");
    setProofLoading(false);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    checkTechnicianAuthGuard,
    submitProof,
    handleProofFileChange,
  };
}
