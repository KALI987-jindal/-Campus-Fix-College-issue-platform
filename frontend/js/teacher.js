/**
 * CampusFix Teacher / Faculty Portal Controller
 */
let currentTeacherScope = "ALL";

document.addEventListener("DOMContentLoaded", async () => {
  setupDashboardHeader();
  await loadDepartmentsDropdown();
  await loadTeacherIssues();

  // Tab Listeners
  document.getElementById("tabDept").addEventListener("click", () => switchTeacherTab("DEPARTMENT_ONLY", "tabDept"));
  document.getElementById("tabFacultyRoom").addEventListener("click", () => switchTeacherTab("FACULTY_ROOM", "tabFacultyRoom"));
  document.getElementById("tabCampus").addEventListener("click", () => switchTeacherTab("CAMPUS_WIDE", "tabCampus"));

  // Form Submissions
  const lectureCriticalForm = document.getElementById("lectureCriticalForm");
  if (lectureCriticalForm) lectureCriticalForm.addEventListener("submit", handleLectureCriticalSubmit);

  const facultyRoomForm = document.getElementById("facultyRoomForm");
  if (facultyRoomForm) facultyRoomForm.addEventListener("submit", handleFacultyRoomSubmit);
});

async function switchTeacherTab(scope, activeBtnId) {
  currentTeacherScope = scope;
  ["tabDept", "tabFacultyRoom", "tabCampus"].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle("active", id === activeBtnId);
  });
  await loadTeacherIssues();
}

async function loadDepartmentsDropdown() {
  const user = ApiClient.getUser();
  const selects = [document.getElementById("lcDept"), document.getElementById("frDept")];

  try {
    const depts = await ApiClient.getDepartments();
    selects.forEach(sel => {
      if (!sel) return;
      sel.innerHTML = depts.map(d => {
        const isSelected = user && d.id === user.academic_department_id ? "selected" : "";
        return `<option value="${d.id}" ${isSelected}>${d.name} (${d.code})</option>`;
      }).join("");
    });
  } catch (e) {
    console.error("Failed to load departments:", e);
  }
}

async function loadTeacherIssues() {
  const container = document.getElementById("teacherFeedContainer");
  container.innerHTML = `<div style="text-align: center; padding: 2rem;">Loading faculty queue...</div>`;

  try {
    const issues = await ApiClient.getIssues({ scope_view: currentTeacherScope });

    if (!issues || issues.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✅</div>
          <h3>No Active Issues in this View</h3>
          <p>Everything in this category is currently operating properly.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = issues.map(renderTeacherCard).join("");
  } catch (e) {
    container.innerHTML = `<div class="badge badge-sla-breached" style="padding: 1rem; width: 100%;">Failed to load issues: ${e.message}</div>`;
  }
}

function renderTeacherCard(issue) {
  const isFacultyRoom = issue.scope === "FACULTY_ROOM";
  const isLectureCritical = issue.priority === "LECTURE_CRITICAL";

  let cardClass = "issue-card";
  if (isLectureCritical) cardClass += " lecture-critical-card";
  else if (isFacultyRoom) cardClass += " faculty-private-card";

  const statusBadge = `badge badge-${issue.status.toLowerCase()}`;
  const priorityBadge = isLectureCritical 
    ? `<span class="badge badge-lecture-critical">🚨 LECTURE-CRITICAL (15m SLA)</span>` 
    : `<span class="badge">${issue.priority}</span>`;

  const scopeBadge = isFacultyRoom
    ? `<span class="badge" style="background: #f3e8ff; color: #7e22ce;">☕ Staff Room (Private)</span>`
    : `<span class="badge" style="background: #f1f5f9; color: #475569;">🏢 ${issue.academic_department_name || "Department"}</span>`;

  // Availability Slot banner if present
  let slotHtml = "";
  if (issue.teacher_availability_slot) {
    slotHtml = `<div style="font-size: 0.8rem; background: #faf5ff; padding: 0.35rem 0.6rem; border-radius: var(--radius-sm); border: 1px dashed #d8b4fe; margin-top: 0.5rem; color: #6b21a8;">
      ⏰ <strong>Teacher Free Slot:</strong> ${issue.teacher_availability_slot}
    </div>`;
  }

  // Teacher Approval Sign-off button
  let signoffHtml = "";
  if (issue.status === "RESOLVED") {
    signoffHtml = `
      <div style="margin-top: 0.75rem; padding: 0.75rem; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.85rem; color: #065f46; font-weight: 600;">Technician uploaded fix proof. Sign off on repair:</span>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-sm btn-success" onclick="approveRepair(${issue.id})">Approve & Close (5★)</button>
          <button class="btn btn-sm btn-danger" onclick="reopenIssue(${issue.id})">Reject & Reopen</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="${cardClass}" id="issue-card-${issue.id}">
      <div class="issue-main">
        <div class="issue-header">
          ${scopeBadge}
          ${priorityBadge}
          <span class="${statusBadge}">${issue.status}</span>
        </div>

        <h3 class="issue-title">${issue.title}</h3>
        <p class="issue-description">${issue.description}</p>

        ${slotHtml}
        ${signoffHtml}

        <div class="issue-meta" style="margin-top: 0.75rem;">
          <span class="meta-item">📍 ${issue.location_room_or_block}</span>
          <span class="meta-item">🛠️ Trade: ${issue.service_trade}</span>
          <span class="meta-item">👤 Reported By: ${issue.reported_by_name} (${issue.reported_by_role})</span>
          <span class="meta-item">📅 ${new Date(issue.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  `;
}

async function handleLectureCriticalSubmit(e) {
  e.preventDefault();
  const title = document.getElementById("lcTitle").value.trim();
  const description = document.getElementById("lcDesc").value.trim();
  const deptId = parseInt(document.getElementById("lcDept").value);
  const location = document.getElementById("lcLocation").value.trim();
  const trade = document.getElementById("lcTrade").value;

  try {
    await ApiClient.createIssue({
      title,
      description,
      academic_department_id: deptId,
      service_trade: trade,
      priority: "LECTURE_CRITICAL",
      location_room_or_block: location,
      scope: "DEPARTMENT_ONLY"
    });

    closeLectureCriticalModal();
    document.getElementById("lectureCriticalForm").reset();
    alert("🚨 Urgent Lecture-Critical alert dispatched to duty technician! (15-min SLA active)");
    await loadTeacherIssues();
  } catch (err) {
    alert("Failed to submit alert: " + err.message);
  }
}

async function handleFacultyRoomSubmit(e) {
  e.preventDefault();
  const title = document.getElementById("frTitle").value.trim();
  const description = document.getElementById("frDesc").value.trim();
  const deptId = parseInt(document.getElementById("frDept").value);
  const location = document.getElementById("frLocation").value.trim();
  const slot = document.getElementById("frSlot").value.trim();
  const trade = document.getElementById("frTrade").value;

  try {
    await ApiClient.createIssue({
      title,
      description,
      academic_department_id: deptId,
      service_trade: trade,
      priority: "MEDIUM",
      location_room_or_block: location,
      teacher_availability_slot: slot,
      scope: "FACULTY_ROOM"
    });

    closeFacultyRoomModal();
    document.getElementById("facultyRoomForm").reset();
    alert("☕ Faculty Room ticket created! (This ticket is 100% private and hidden from students).");
    await loadTeacherIssues();
  } catch (err) {
    alert("Failed to submit faculty room issue: " + err.message);
  }
}

async function approveRepair(issueId) {
  try {
    await ApiClient.verifyIssue(issueId, "ACCEPT", 5, "Faculty verified and approved repair.");
    await loadTeacherIssues();
  } catch (e) {
    alert("Sign-off error: " + e.message);
  }
}

async function reopenIssue(issueId) {
  const reason = prompt("Enter rejection reason for technician:");
  if (!reason) return;
  try {
    await ApiClient.verifyIssue(issueId, "REOPEN", null, reason);
    await loadTeacherIssues();
  } catch (e) {
    alert("Reopen error: " + e.message);
  }
}

function openLectureCriticalModal() {
  document.getElementById("lectureCriticalModal").classList.add("open");
}
function closeLectureCriticalModal() {
  document.getElementById("lectureCriticalModal").classList.remove("open");
}
function openFacultyRoomModal() {
  document.getElementById("facultyRoomModal").classList.add("open");
}
function closeFacultyRoomModal() {
  document.getElementById("facultyRoomModal").classList.remove("open");
}
