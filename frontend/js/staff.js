/**
 * CampusFix Supervisor & Ground Staff Workboard Controller
 */
let techniciansList = [];

document.addEventListener("DOMContentLoaded", async () => {
  setupDashboardHeader();
  await loadTechnicians();
  await loadStaffTasks();

  const user = ApiClient.getUser();
  if (user && user.role === "TECHNICIAN") {
    // Show specialized technician banner
    const techNotice = document.getElementById("techRoleNotice");
    if (techNotice) {
      techNotice.textContent = `Active Ground Staff: ${user.full_name} (${user.trade_specialty || "Maintenance Specialist"})`;
      techNotice.style.display = "block";
    }
  }
});

async function loadTechnicians() {
  try {
    techniciansList = await ApiClient.getTechnicians();
  } catch (e) {
    console.error("Failed to load technicians:", e);
  }
}

async function loadStaffTasks() {
  const container = document.getElementById("tasksContainer");
  container.innerHTML = `<div style="text-align: center; padding: 2rem;">Loading maintenance assignments...</div>`;

  try {
    const tasks = await ApiClient.getMyTasks();

    if (!tasks || tasks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎉</div>
          <h3>All Clear! No Pending Tasks</h3>
          <p>No complaints are currently awaiting maintenance in your queue.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = tasks.map(renderTaskCard).join("");
  } catch (e) {
    container.innerHTML = `<div class="badge badge-sla-breached" style="padding: 1rem; width: 100%;">Failed to load tasks: ${e.message}</div>`;
  }
}

function renderTaskCard(task) {
  const user = ApiClient.getUser();
  const isSupervisor = user && (user.role === "SUPERVISOR" || user.role === "ADMIN");

  const isLectureCritical = task.priority === "LECTURE_CRITICAL";
  const priorityBadge = isLectureCritical
    ? `<span class="badge badge-lecture-critical">🚨 LECTURE-CRITICAL (15m SLA)</span>`
    : `<span class="badge">${task.priority}</span>`;

  const statusBadge = `badge badge-${task.status.toLowerCase()}`;

  // Supervisor Assignment Dropdown
  let assignControlsHtml = "";
  if (isSupervisor && task.status === "SUBMITTED") {
    const techOptions = techniciansList.map(t => `<option value="${t.id}">${t.full_name} (${t.trade_specialty})</option>`).join("");
    assignControlsHtml = `
      <div style="margin-top: 1rem; padding: 0.75rem; background: #f8fafc; border: 1px solid var(--border); border-radius: var(--radius-md); display: flex; align-items: center; gap: 0.75rem;">
        <span style="font-size: 0.85rem; font-weight: 600;">Dispatch Ground Worker:</span>
        <select id="assignTech-${task.id}" class="form-control" style="max-width: 260px; padding: 0.4rem;">
          <option value="">-- Choose Worker --</option>
          ${techOptions}
        </select>
        <button class="btn btn-sm btn-primary" onclick="handleAssignWorker(${task.id})">Dispatch Order</button>
      </div>
    `;
  }

  // Ground Worker 1-Click Action Buttons
  let workerActionsHtml = "";
  if (task.status === "ASSIGNED" || task.status === "SUBMITTED") {
    workerActionsHtml = `
      <button class="btn btn-primary" onclick="updateTaskStatus(${task.id}, 'IN_PROGRESS')">
        🟢 Start Work
      </button>
    `;
  } else if (task.status === "IN_PROGRESS") {
    workerActionsHtml = `
      <button class="btn btn-success" onclick="openProofModal(${task.id})">
        📸 Upload Fix Photo & Complete
      </button>
    `;
  }

  let slotHtml = "";
  if (task.teacher_availability_slot) {
    slotHtml = `<div style="font-size: 0.8rem; background: #faf5ff; padding: 0.35rem 0.6rem; border-radius: var(--radius-sm); border: 1px dashed #d8b4fe; margin-top: 0.5rem; color: #6b21a8;">
      ⏰ <strong>Teacher Free Window:</strong> ${task.teacher_availability_slot}
    </div>`;
  }

  return `
    <div class="tech-mobile-card" id="task-card-${task.id}">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <span class="badge" style="background: #e2e8f0; color: #1e293b;">🏢 ${task.academic_department_name || "Campus Facility"}</span>
        <div style="display: flex; gap: 0.4rem;">
          ${priorityBadge}
          <span class="${statusBadge}">${task.status}</span>
        </div>
      </div>

      <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.3rem;">${task.title}</h3>
      <p style="font-size: 0.9rem; color: var(--secondary); margin-bottom: 0.75rem;">${task.description}</p>

      <div style="background: #f1f5f9; padding: 0.6rem 0.85rem; border-radius: var(--radius-md); font-size: 0.85rem; margin-bottom: 0.75rem;">
        <div>📍 <strong>Exact Location:</strong> ${task.location_room_or_block}</div>
        <div>🛠️ <strong>Trade Required:</strong> ${task.service_trade}</div>
        <div>👤 <strong>Assigned Worker:</strong> ${task.assigned_technician_name || "Awaiting Dispatch"}</div>
      </div>

      ${slotHtml}
      ${assignControlsHtml}

      <div class="tech-mobile-actions">
        ${workerActionsHtml}
      </div>
    </div>
  `;
}

async function handleAssignWorker(taskId) {
  const select = document.getElementById(`assignTech-${taskId}`);
  const techId = select ? select.value : null;
  if (!techId) {
    alert("Please select a technician to dispatch");
    return;
  }

  try {
    await ApiClient.assignTicket(taskId, parseInt(techId));
    alert("Task dispatched to ground worker!");
    await loadStaffTasks();
  } catch (e) {
    alert("Dispatch error: " + e.message);
  }
}

async function updateTaskStatus(taskId, status) {
  try {
    await ApiClient.updateStatus(taskId, status, "Technician on site, work in progress");
    await loadStaffTasks();
  } catch (e) {
    alert("Status update error: " + e.message);
  }
}

let activeProofTaskId = null;
function openProofModal(taskId) {
  activeProofTaskId = taskId;
  document.getElementById("proofModal").classList.add("open");
}
function closeProofModal() {
  activeProofTaskId = null;
  document.getElementById("proofModal").classList.remove("open");
}

async function submitProof() {
  if (!activeProofTaskId) return;
  const photoUrl = document.getElementById("proofPhotoUrl").value.trim();
  const note = document.getElementById("proofNote").value.trim();

  if (!photoUrl) {
    alert("Please provide the photo proof URL or filename");
    return;
  }

  try {
    await ApiClient.uploadProof(activeProofTaskId, photoUrl, note);
    closeProofModal();
    alert("Proof verified! Ticket marked as RESOLVED.");
    await loadStaffTasks();
  } catch (e) {
    alert("Failed to complete ticket: " + e.message);
  }
}
