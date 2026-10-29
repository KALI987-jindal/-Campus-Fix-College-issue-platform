/**
 * CampusFix Teacher / Faculty Portal Controller
 * Aligned with Google Stitch Civic Collegiate Design System
 */

// In-Memory State
let allLoadedIssues = [];
let currentTeacherScope = "ALL"; // "ALL" | "DEPARTMENT_ONLY" | "FACULTY_ROOM" | "CAMPUS_WIDE"
let activeSignOffIssueId = null;
let activeReopenIssueId = null;
let lastFocusedElement = null;

/**
 * Frontend Role Guard
 * Restricts access strictly to TEACHER, HOD, and ADMIN roles.
 * Redirects unauthenticated sessions to index.html and other roles to their dashboards.
 */
function checkTeacherAuthGuard() {
  const user = ApiClient.getUser();
  const token = ApiClient.getToken();

  // If unauthenticated, redirect to index.html
  if (!user || !token) {
    window.location.href = "index.html";
    return false;
  }

  // Allowed roles for faculty portal
  const allowedRoles = ["TEACHER", "HOD", "ADMIN"];
  if (!allowedRoles.includes(user.role)) {
    if (typeof redirectToDashboard === "function") {
      redirectToDashboard(user.role);
    } else {
      switch (user.role) {
        case "STUDENT":
          window.location.href = "student-dashboard.html";
          break;
        case "TECHNICIAN":
        case "SUPERVISOR":
          window.location.href = "technician-workboard.html";
          break;
        default:
          window.location.href = "student-dashboard.html";
      }
    }
    return false;
  }

  return true;
}

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Authenticate & Role Guard
  if (!checkTeacherAuthGuard()) return;

  setupDashboardHeader();
  setupTeacherIdentity();

  // 2. Load Broadcast Notices & Departments
  await loadBroadcastNotice();
  await loadDepartmentsDropdown();

  // 3. Load Real Faculty Data from APIs
  await loadAllDashboardData();

  // 4. Bind Navigation, Filter & Modal Listeners
  setupNavigationTabs();
  setupFilterPills();
  setupSearchAndFilters();
  setupModalAccessibility();

  // 5. Bind Form Submissions
  const lectureCriticalForm = document.getElementById("lectureCriticalForm");
  if (lectureCriticalForm) lectureCriticalForm.addEventListener("submit", handleLectureCriticalSubmit);

  const facultyRoomForm = document.getElementById("facultyRoomForm");
  if (facultyRoomForm) facultyRoomForm.addEventListener("submit", handleFacultyRoomSubmit);

  const reopenForm = document.getElementById("reopenForm");
  if (reopenForm) reopenForm.addEventListener("submit", handleReopenSubmit);
});

/**
 * Configure teacher-specific greeting & department subtitles
 */
function setupTeacherIdentity() {
  const user = ApiClient.getUser();
  if (!user) return;

  const fullName = user.full_name || "Faculty Member";
  const deptName = user.academic_department_name;

  const welcomeEl = document.getElementById("welcomeTeacherName");
  if (welcomeEl) welcomeEl.textContent = fullName;

  const deptSubEl = document.getElementById("facultyDeptSubtitle");
  if (deptSubEl) {
    if (deptName) {
      deptSubEl.textContent = `${deptName} | Faculty Portal`;
    } else {
      deptSubEl.textContent = `General Faculty (Unassigned Department) | Faculty Portal`;
    }
  }

  const officeTextEl = document.getElementById("assignedOfficeText");
  if (officeTextEl) {
    if (deptName) {
      officeTextEl.textContent = `${deptName} Faculty Lounge & Suites`;
    } else {
      officeTextEl.textContent = `General Faculty Lounge & Suites`;
    }
  }
}

/**
 * Load Campus Broadcast Notice via API
 */
async function loadBroadcastNotice() {
  try {
    const notices = await ApiClient.getBroadcasts();
    const banner = document.getElementById("broadcastBanner");
    if (banner && notices && notices.length > 0) {
      const latest = notices[0];
      document.getElementById("broadcastTitle").textContent = latest.title;
      document.getElementById("broadcastMsg").textContent = latest.message;
      banner.style.display = "flex";
    } else if (banner) {
      banner.style.display = "none";
    }
  } catch (e) {
    console.error("Failed to load broadcast notice:", e);
  }
}

/**
 * Populate Department Selects in Emergency and Faculty Modals
 */
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

/**
 * Fetch Issues Queue, Compute Real KPIs, and Render Feeds
 */
async function loadAllDashboardData() {
  try {
    // Teachers are authorized to fetch scope_view=ALL, receiving dept, faculty-room, and campus issues
    const issues = await ApiClient.getIssues({ scope_view: "ALL" });
    allLoadedIssues = Array.isArray(issues) ? issues : [];

    // Calculate Real KPI Metrics with Strict Scoping
    calculateAndRenderTeacherKPIs();

    // Render Urgent Lecture Disruption Alert Banner
    renderLectureDisruptionBanner();

    // Render Faculty Issues Queue
    renderTeacherQueue();

    // Render Verification / Sign-Off Section
    renderSignOffSection();

    // Render Right Panel Private Faculty Quarters List
    renderPrivateQuartersPanel();

  } catch (err) {
    console.error("Failed to load faculty dashboard data:", err);
    const container = document.getElementById("teacherFeedContainer");
    if (container) {
      container.innerHTML = `<div class="badge badge-sla-breached" style="padding: 1rem; width: 100%;">Failed to load faculty issues: ${escapeHtml(err.message)}</div>`;
    }
    showToast("Failed to load dashboard data: " + err.message, "error");
  }
}

/**
 * Calculate KPI Metrics Strictly From Real API Data
 * Department and Role Scoping Enforced
 */
function calculateAndRenderTeacherKPIs() {
  const user = ApiClient.getUser();
  const userId = user ? user.user_id : null;
  const userDeptId = user ? user.academic_department_id : null;
  const isAdmin = user && user.role === "ADMIN";

  // 1. My Open Requests (Reported by this teacher and not closed)
  const myRequests = allLoadedIssues.filter(i => userId && i.reported_by_user_id === userId);
  const myOpenRequests = myRequests.filter(i => i.status !== "CLOSED");

  const kpiMyReqEl = document.getElementById("kpiMyRequestsCount");
  if (kpiMyReqEl) kpiMyReqEl.textContent = myOpenRequests.length;

  const kpiMyReqSub = document.getElementById("kpiMyRequestsSubtext");
  if (kpiMyReqSub) kpiMyReqSub.textContent = `${myRequests.length} Total Filed (${myOpenRequests.length} Active)`;

  // 2. Active Lecture Disruptions (Scoped to teacher's dept or campus-wide, or all if admin)
  const activeLc = allLoadedIssues.filter(i => {
    if (i.priority !== "LECTURE_CRITICAL" || i.status === "CLOSED") return false;
    if (!isAdmin && userDeptId && i.academic_department_id && i.academic_department_id !== userDeptId && i.scope !== "CAMPUS_WIDE") {
      return false;
    }
    return true;
  });

  const kpiLcEl = document.getElementById("kpiLectureCriticalCount");
  if (kpiLcEl) kpiLcEl.textContent = activeLc.length;

  const kpiLcSub = document.getElementById("kpiLectureCriticalSubtext");
  if (kpiLcSub) {
    kpiLcSub.textContent = activeLc.length > 0 ? "🚨 In-Session Alert Active" : "No Active Emergencies";
  }

  const kpiLcBadge = document.getElementById("kpiLectureCriticalBadge");
  if (kpiLcBadge) {
    kpiLcBadge.textContent = activeLc.length > 0 ? "15m SLA Active" : "15m Target";
  }

  // 3. Requests In Progress (Scoped to teacher's dept or campus-wide, or all if admin)
  const inProgress = allLoadedIssues.filter(i => {
    if (i.status !== "IN_PROGRESS" && i.status !== "ASSIGNED") return false;
    if (!isAdmin && userDeptId && i.academic_department_id && i.academic_department_id !== userDeptId && i.scope !== "CAMPUS_WIDE") {
      return false;
    }
    return true;
  });

  const kpiProgEl = document.getElementById("kpiInProgressCount");
  if (kpiProgEl) kpiProgEl.textContent = inProgress.length;

  const kpiProgSub = document.getElementById("kpiInProgressSubtext");
  if (kpiProgSub) kpiProgSub.textContent = `${inProgress.length} Assigned Orders`;

  // 4. Resolved Requests (Completed & Awaiting Sign-off)
  const resolvedAll = allLoadedIssues.filter(i => {
    if (i.status !== "RESOLVED" && i.status !== "CLOSED") return false;
    if (!isAdmin && userDeptId && i.academic_department_id && i.academic_department_id !== userDeptId && i.scope !== "CAMPUS_WIDE") {
      return false;
    }
    return true;
  });

  // Pending Sign-Off: strictly issues authorized for this user to verify
  const pendingSignOff = allLoadedIssues.filter(i => {
    if (i.status !== "RESOLVED") return false;
    if (isAdmin) return true;
    return (userId && i.reported_by_user_id === userId) || (userDeptId && i.academic_department_id === userDeptId);
  });

  const kpiResEl = document.getElementById("kpiResolvedCount");
  if (kpiResEl) kpiResEl.textContent = resolvedAll.length;

  const kpiResSub = document.getElementById("kpiResolvedSubtext");
  if (kpiResSub) {
    kpiResSub.textContent = pendingSignOff.length > 0 ? `${pendingSignOff.length} Awaiting Sign-Off` : "All Verified";
  }

  const badgeSignOff = document.getElementById("pendingSignOffBadge");
  if (badgeSignOff) {
    badgeSignOff.textContent = `${pendingSignOff.length} Pending Sign-Off`;
  }
}

/**
 * Render Prominent Urgent Lecture Disruption Alert Banner
 */
function renderLectureDisruptionBanner() {
  const container = document.getElementById("lectureDisruptionContainer");
  if (!container) return;

  const user = ApiClient.getUser();
  const userDeptId = user ? user.academic_department_id : null;
  const isAdmin = user && user.role === "ADMIN";

  const activeLc = allLoadedIssues.filter(i => {
    if (i.priority !== "LECTURE_CRITICAL" || i.status === "CLOSED") return false;
    if (!isAdmin && userDeptId && i.academic_department_id && i.academic_department_id !== userDeptId && i.scope !== "CAMPUS_WIDE") {
      return false;
    }
    return true;
  });

  if (activeLc.length === 0) {
    container.innerHTML = `
      <div style="background: #ffffff; border: 1px solid #bbf7d0; border-radius: var(--radius-lg); padding: 1rem 1.25rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 0.65rem;">
          <div style="width: 32px; height: 32px; border-radius: 50%; background: #d1fae5; color: #065f46; display: flex; align-items: center; justify-content: center;">
            <span class="material-symbols-outlined" style="font-size: 20px;">check_circle</span>
          </div>
          <div>
            <span style="font-size: 0.92rem; font-weight: 700; color: #065f46; display: block;">All Classroom & Lecture AV Systems Operational</span>
            <span style="font-size: 0.78rem; color: var(--secondary);">Zero active in-session lecture disruptions logged across department facilities.</span>
          </div>
        </div>
        <span class="stitch-badge" style="background: #d1fae5; color: #065f46; font-size: 0.75rem;">
          Rapid Dispatch Ready (15m SLA)
        </span>
      </div>
    `;
    return;
  }

  // Active Lecture Disruption
  const topEmergency = activeLc[0];
  const assignedTech = topEmergency.assigned_technician_name ? `Technician Assigned: ${topEmergency.assigned_technician_name}` : "Dispatched to Duty Technician";

  container.innerHTML = `
    <div class="lc-banner-top">
      <div class="lc-banner-title">
        <span class="material-symbols-outlined" style="font-size: 22px; color: #fcd34d;">report_problem</span>
        <span>Active Lecture Disruption & Academic Priority Incident</span>
      </div>
      <div class="lc-sla-pill">
        <span class="material-symbols-outlined" style="font-size: 14px;">timer</span>
        <span>Classroom Emergency Response SLA Target: 15-Minute Rapid AV Dispatch</span>
      </div>
    </div>

    <div class="lc-banner-body">
      <div class="lc-banner-details">
        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <span class="stitch-badge badge-priority-critical">
            <span class="live-dot" style="background: #dc2626; box-shadow: 0 0 6px #dc2626;"></span>
            <span>Critical Priority • In-Session Class</span>
          </span>
          <span class="stitch-badge" style="background: #d8e2ff; color: #004395;">
            <span class="material-symbols-outlined" style="font-size: 14px;">directions_run</span>
            <span>${escapeHtml(assignedTech)}</span>
          </span>
          <span style="font-size: 0.75rem; color: var(--secondary);">Ticket #${topEmergency.id}</span>
        </div>

        <div>
          <div class="lc-hall-title">
            <span class="material-symbols-outlined" style="color: #dc2626;">meeting_room</span>
            <span>${escapeHtml(topEmergency.location_room_or_block)}</span>
          </div>
          <p class="lc-hall-desc">
            <strong>${escapeHtml(topEmergency.title)}:</strong> ${escapeHtml(topEmergency.description)}
          </p>
        </div>

        <div class="lc-progress-track">
          <div class="lc-progress-bar">
            <div class="lc-progress-fill"></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--secondary); margin-top: 4px;">
            <span>Reported: ${new Date(topEmergency.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            <span style="color: #dc2626; font-weight: 700;">Status: ${topEmergency.status}</span>
            <span>Target: 15 Mins</span>
          </div>
        </div>
      </div>

      <div class="lc-banner-actions">
        <a href="tel:4410" class="btn btn-primary" style="background: #0058be; justify-content: center; font-size: 0.85rem; padding: 0.6rem 1rem;">
          <span class="material-symbols-outlined" style="font-size: 18px;">phone_in_talk</span>
          <span>Call AV Desk (Ext. 4410)</span>
        </a>
        <button type="button" class="btn btn-outline btn-sm" onclick="openSignOffModal(${topEmergency.id})" style="justify-content: center;">
          <span class="material-symbols-outlined" style="font-size: 16px;">check_circle</span>
          <span>Mark Resolved</span>
        </button>
      </div>
    </div>
  `;
}

/**
 * Filter & Render Faculty Issues Queue
 */
function renderTeacherQueue() {
  const container = document.getElementById("teacherFeedContainer");
  if (!container) return;

  const searchInput = document.getElementById("searchTeacherInput");
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";

  const prioritySelect = document.getElementById("filterTeacherPriority");
  const selectedPriority = prioritySelect ? prioritySelect.value : "ALL";

  const user = ApiClient.getUser();
  const userDeptId = user ? user.academic_department_id : null;
  const isAdmin = user && user.role === "ADMIN";

  // Filter Issues
  let filtered = allLoadedIssues.filter(issue => {
    // Dept scoping for department-level items (unless campus-wide or admin)
    if (!isAdmin && userDeptId && issue.academic_department_id && issue.academic_department_id !== userDeptId && issue.scope !== "CAMPUS_WIDE") {
      return false;
    }

    // Scope Filter
    if (currentTeacherScope === "DEPARTMENT_ONLY" && issue.scope !== "DEPARTMENT_ONLY") {
      return false;
    }
    if (currentTeacherScope === "FACULTY_ROOM" && issue.scope !== "FACULTY_ROOM") {
      return false;
    }
    if (currentTeacherScope === "CAMPUS_WIDE" && issue.scope !== "CAMPUS_WIDE") {
      return false;
    }

    // Priority Filter
    if (selectedPriority !== "ALL" && issue.priority !== selectedPriority) {
      return false;
    }

    // Search Query
    if (searchTerm) {
      const titleMatch = (issue.title || "").toLowerCase().includes(searchTerm);
      const descMatch = (issue.description || "").toLowerCase().includes(searchTerm);
      const locMatch = (issue.location_room_or_block || "").toLowerCase().includes(searchTerm);
      const tradeMatch = (issue.service_trade || "").toLowerCase().includes(searchTerm);
      const reporterMatch = (issue.reported_by_name || "").toLowerCase().includes(searchTerm);
      if (!titleMatch && !descMatch && !locMatch && !tradeMatch && !reporterMatch) return false;
    }

    return true;
  });

  const badge = document.getElementById("queueActiveBadge");
  if (badge) badge.textContent = `${filtered.length} Requests in View`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="background: #ffffff; border: 1px dashed var(--border); border-radius: var(--radius-lg); padding: 2.5rem 1rem;">
        <div class="empty-state-icon">✅</div>
        <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--primary); margin-bottom: 0.25rem;">No Active Issues</h3>
        <p style="font-size: 0.85rem; color: var(--secondary); margin: 0;">Everything in this category is currently operating properly.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(renderFacultyCard).join("");
}

/**
 * Render a Single Faculty Issue Card
 */
function renderFacultyCard(issue) {
  const user = ApiClient.getUser();
  const userId = user ? user.user_id : null;
  const userDeptId = user ? user.academic_department_id : null;
  const isAdmin = user && user.role === "ADMIN";

  const isReporter = userId && issue.reported_by_user_id === userId;
  const isDeptFaculty = user && (user.role === "TEACHER" || user.role === "HOD") && issue.academic_department_id === userDeptId;
  const canVerify = isReporter || isDeptFaculty || isAdmin;

  const isFacultyRoom = issue.scope === "FACULTY_ROOM";
  const isLectureCritical = issue.priority === "LECTURE_CRITICAL";

  let cardClasses = "stitch-issue-card";
  if (isLectureCritical) cardClasses += " lecture-critical-card";
  else if (isFacultyRoom) cardClasses += " faculty-private-card";

  // Priority Badge
  let priorityClass = "badge-priority-low";
  let priorityLabel = issue.priority || "LOW";
  if (isLectureCritical) {
    priorityClass = "badge-priority-critical";
    priorityLabel = "🚨 LECTURE-CRITICAL (15m SLA)";
  } else if (issue.priority === "CRITICAL") {
    priorityClass = "badge-priority-critical";
  } else if (issue.priority === "HIGH") {
    priorityClass = "badge-priority-high";
  } else if (issue.priority === "MEDIUM") {
    priorityClass = "badge-priority-medium";
  }

  // Status Badge
  let statusClass = "badge-status-submitted";
  let statusLabel = issue.status || "SUBMITTED";
  if (issue.status === "ASSIGNED") {
    statusClass = "badge-status-assigned";
    statusLabel = "Technician Assigned";
  } else if (issue.status === "IN_PROGRESS") {
    statusClass = "badge-status-in_progress";
    statusLabel = "In Progress";
  } else if (issue.status === "RESOLVED") {
    statusClass = "badge-status-resolved";
    statusLabel = "Resolved • Fix Uploaded";
  } else if (issue.status === "CLOSED") {
    statusClass = "badge-status-closed";
    statusLabel = "Closed";
  } else if (issue.status === "REOPENED") {
    statusClass = "badge-status-reopened";
    statusLabel = "Reopened";
  }

  // Scope Badge
  const scopeBadgeHtml = isFacultyRoom
    ? `<span class="stitch-badge badge-faculty-private">🔒 Staff Room (Private)</span>`
    : `<span class="stitch-badge" style="background: #f1f5f9; color: #475569;">🏢 ${escapeHtml(issue.academic_department_name || "Department")}</span>`;

  // Free Slot Banner if present
  let slotHtml = "";
  if (issue.teacher_availability_slot) {
    slotHtml = `
      <div class="teacher-slot-box">
        <span class="material-symbols-outlined" style="font-size: 16px;">schedule</span>
        <span><strong>Teacher Access Window:</strong> ${escapeHtml(issue.teacher_availability_slot)}</span>
      </div>
    `;
  }

  // Fix Proof Preview
  let proofHtml = "";
  if (issue.resolution_proof_url) {
    proofHtml = `
      <div class="stitch-proof-box">
        <span class="material-symbols-outlined" style="font-size: 20px;">photo_camera</span>
        <span>
          <strong>Fix Proof:</strong> ${escapeHtml(issue.resolution_note || "Repair completed.")}
          <a href="http://127.0.0.1:8000${issue.resolution_proof_url}" target="_blank" style="color: #15803d; font-weight: 700; text-decoration: underline; margin-left: 4px;">View Full Image</a>
        </span>
      </div>
    `;
  }

  // Verification Prompt for Authorized Faculty
  let signoffHtml = "";
  if (issue.status === "RESOLVED" && canVerify) {
    signoffHtml = `
      <div class="stitch-verify-action-box" style="background: #ecfdf5; border-color: #a7f3d0;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="material-symbols-outlined" style="font-size: 20px; color: #065f46;">verified_user</span>
          <span style="font-size: 0.85rem; font-weight: 600; color: #065f46;">Technician completed repair. Sign off on work order:</span>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-sm btn-success" type="button" onclick="openSignOffModal(${issue.id})">
            Approve & Close (5★)
          </button>
          <button class="btn btn-sm btn-danger" type="button" onclick="openReopenModal(${issue.id})">
            Reject & Reopen
          </button>
        </div>
      </div>
    `;
  }

  const createdDate = issue.created_at ? new Date(issue.created_at).toLocaleDateString() : "Recent";
  const ticketIdStr = `#TICKET-${issue.id}`;

  return `
    <article class="${cardClasses}" id="issue-card-${issue.id}">
      <div class="stitch-card-top-row">
        <div class="stitch-badges-cluster">
          <span class="stitch-badge ${priorityClass}">${priorityLabel}</span>
          <span class="stitch-badge ${statusClass}">${statusLabel}</span>
          ${scopeBadgeHtml}
          <span class="stitch-ticket-number">${ticketIdStr}</span>
        </div>
        <span class="stitch-card-time">${createdDate}</span>
      </div>

      <div>
        <h3 class="stitch-card-title">${escapeHtml(issue.title)}</h3>
        <div class="stitch-card-location" style="margin-top: 4px;">
          <span class="material-symbols-outlined">location_on</span>
          <span>${escapeHtml(issue.location_room_or_block)}</span>
        </div>
      </div>

      <p class="stitch-card-desc">${escapeHtml(issue.description || "")}</p>

      ${slotHtml}
      ${proofHtml}
      ${signoffHtml}

      <div class="stitch-card-meta">
        <span class="stitch-meta-chip">
          <span class="material-symbols-outlined" style="font-size: 15px;">build</span>
          <span>Trade: ${escapeHtml(issue.service_trade || "General")}</span>
        </span>
        <span class="stitch-meta-chip">
          <span class="material-symbols-outlined" style="font-size: 15px;">person</span>
          <span>Reported By: ${escapeHtml(issue.reported_by_name || "Faculty")} (${issue.reported_by_role || "TEACHER"})</span>
        </span>
        ${issue.assigned_technician_name ? `
          <span class="stitch-meta-chip" style="color: var(--accent-blue); font-weight: 600;">
            <span class="material-symbols-outlined" style="font-size: 15px;">engineering</span>
            <span>Tech: ${escapeHtml(issue.assigned_technician_name)}</span>
          </span>` : ""}
      </div>
    </article>
  `;
}

/**
 * Render Classroom & Lab Repair Sign-Off Subsection
 * Scoped strictly to issues authorized for current faculty member to verify
 */
function renderSignOffSection() {
  const container = document.getElementById("signOffContainer");
  if (!container) return;

  const user = ApiClient.getUser();
  const userId = user ? user.user_id : null;
  const userDeptId = user ? user.academic_department_id : null;
  const isAdmin = user && user.role === "ADMIN";

  const resolvedIssues = allLoadedIssues.filter(i => {
    if (i.status !== "RESOLVED") return false;
    if (isAdmin) return true;
    return (userId && i.reported_by_user_id === userId) || (userDeptId && i.academic_department_id === userDeptId);
  });

  if (resolvedIssues.length === 0) {
    container.innerHTML = `
      <div style="background: var(--surface-low); border-radius: var(--radius-md); padding: 1.5rem; text-align: center; color: var(--secondary); font-size: 0.85rem;">
        <span class="material-symbols-outlined" style="font-size: 28px; color: #10b981; display: block; margin-bottom: 0.25rem;">task_alt</span>
        <span>Zero work orders awaiting faculty sign-off. All classroom repairs are up to date.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = resolvedIssues.map(issue => `
    <div class="stitch-signoff-card" id="signoff-card-${issue.id}">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; flex-wrap: wrap;">
        <div>
          <span class="stitch-badge" style="background: #d1fae5; color: #065f46; font-weight: 700;">
            Work Order Awaiting Faculty Sign-Off
          </span>
          <h4 style="font-family: var(--font-sans); font-size: 1.05rem; font-weight: 700; color: var(--primary); margin: 0.35rem 0 0.15rem 0;">
            #${issue.id}: ${escapeHtml(issue.title)}
          </h4>
          <span style="font-size: 0.8rem; color: var(--secondary);">
            📍 ${escapeHtml(issue.location_room_or_block)} • Reported By: ${escapeHtml(issue.reported_by_name)}
          </span>
        </div>
        <span class="stitch-badge" style="background: var(--surface-container); color: var(--text-main);">SLA Completed</span>
      </div>

      <div class="signoff-proof-preview">
        <div class="signoff-proof-thumb">
          <span class="material-symbols-outlined" style="font-size: 24px;">photo_camera</span>
        </div>
        <div style="flex: 1;">
          <span style="font-size: 0.85rem; font-weight: 700; color: var(--primary); display: block;">
            Technician Resolution Proof
          </span>
          <p style="font-size: 0.8rem; color: var(--secondary); margin: 2px 0 0 0;">
            ${escapeHtml(issue.resolution_note || "Work order marked completed.")}
            ${issue.resolution_proof_url ? `<a href="http://127.0.0.1:8000${issue.resolution_proof_url}" target="_blank" style="color: var(--accent-blue); text-decoration: underline; margin-left: 4px;">Inspect Photo</a>` : ""}
          </p>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 0.65rem; padding-top: 0.35rem;">
        <button class="btn btn-outline btn-sm" type="button" onclick="openReopenModal(${issue.id})" style="color: #b91c1c;">
          <span class="material-symbols-outlined" style="font-size: 16px;">close</span>
          <span>Request Rework / Reopen</span>
        </button>
        <button class="btn btn-success btn-sm" type="button" onclick="openSignOffModal(${issue.id})">
          <span class="material-symbols-outlined" style="font-size: 16px;">thumb_up</span>
          <span>Approve & Close Ticket</span>
        </button>
      </div>
    </div>
  `).join("");
}

/**
 * Render Right Sidebar Private Faculty Quarters Panel
 * Strictly restricted to faculty member's department
 */
function renderPrivateQuartersPanel() {
  const container = document.getElementById("facultyRoomListContainer");
  if (!container) return;

  const user = ApiClient.getUser();
  const userDeptId = user ? user.academic_department_id : null;
  const isAdmin = user && user.role === "ADMIN";

  const facultyRoomIssues = allLoadedIssues.filter(i => {
    if (i.scope !== "FACULTY_ROOM") return false;
    if (isAdmin) return true;
    return !userDeptId || i.academic_department_id === userDeptId;
  });

  if (facultyRoomIssues.length === 0) {
    container.innerHTML = `
      <div style="background: var(--surface-low); border-radius: var(--radius-md); padding: 1rem; text-align: center; color: var(--secondary); font-size: 0.8rem;">
        No active private faculty room tickets logged.
      </div>
    `;
    return;
  }

  container.innerHTML = facultyRoomIssues.slice(0, 3).map(iss => `
    <div style="background: var(--surface-low); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.75rem; display: flex; flex-direction: column; gap: 0.25rem;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.75rem; font-weight: 700; color: var(--secondary);">#TICKET-${iss.id}</span>
        <span class="stitch-badge badge-status-${iss.status.toLowerCase()}">${iss.status}</span>
      </div>
      <span style="font-size: 0.85rem; font-weight: 700; color: var(--primary);">${escapeHtml(iss.title)}</span>
      <span style="font-size: 0.75rem; color: var(--secondary);">📍 ${escapeHtml(iss.location_room_or_block)}</span>
    </div>
  `).join("");
}

/**
 * Form Submission: Lecture-Critical Emergency (15m SLA)
 * Replaced native alert with accessible inline feedback and duplicate-prevention
 */
async function handleLectureCriticalSubmit(e) {
  e.preventDefault();
  clearModalFeedback("lcModalFeedback");

  const titleEl = document.getElementById("lcTitle");
  const descEl = document.getElementById("lcDesc");
  const deptEl = document.getElementById("lcDept");
  const locEl = document.getElementById("lcLocation");
  const tradeEl = document.getElementById("lcTrade");

  const title = titleEl ? titleEl.value.trim() : "";
  const description = descEl ? descEl.value.trim() : "";
  const deptId = deptEl ? parseInt(deptEl.value) : NaN;
  const location = locEl ? locEl.value.trim() : "";
  const trade = tradeEl ? tradeEl.value : "";

  if (!title || !description || !location || isNaN(deptId)) {
    showModalFeedback("lcModalFeedback", "Please fill in all required fields before triggering dispatch.", "error");
    if (!title && titleEl) titleEl.focus();
    else if (!location && locEl) locEl.focus();
    else if (!description && descEl) descEl.focus();
    return;
  }

  const submitBtn = document.getElementById("lcSubmitBtn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.dataset.originalHtml = submitBtn.innerHTML;
    submitBtn.innerHTML = `
      <span class="material-symbols-outlined" style="font-size: 16px; animation: spin 1s linear infinite;">sync</span>
      <span>Dispatching 15m Alert...</span>
    `;
  }

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
    await loadAllDashboardData();
    showToast("🚨 Urgent Lecture-Critical alert dispatched to duty technician! 15-minute response SLA active.", "success", 5000);
  } catch (err) {
    showModalFeedback("lcModalFeedback", "Failed to submit alert: " + err.message, "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = submitBtn.dataset.originalHtml;
    }
  }
}

/**
 * Form Submission: Private Faculty Room Maintenance
 * Replaced native alert with accessible inline feedback and duplicate-prevention
 */
async function handleFacultyRoomSubmit(e) {
  e.preventDefault();
  clearModalFeedback("frModalFeedback");

  const titleEl = document.getElementById("frTitle");
  const descEl = document.getElementById("frDesc");
  const deptEl = document.getElementById("frDept");
  const locEl = document.getElementById("frLocation");
  const slotEl = document.getElementById("frSlot");
  const tradeEl = document.getElementById("frTrade");

  const title = titleEl ? titleEl.value.trim() : "";
  const description = descEl ? descEl.value.trim() : "";
  const deptId = deptEl ? parseInt(deptEl.value) : NaN;
  const location = locEl ? locEl.value.trim() : "";
  const slot = slotEl ? slotEl.value.trim() : "";
  const trade = tradeEl ? tradeEl.value : "";

  if (!title || !description || !location || isNaN(deptId)) {
    showModalFeedback("frModalFeedback", "Please fill in all required fields before filing request.", "error");
    if (!title && titleEl) titleEl.focus();
    else if (!location && locEl) locEl.focus();
    else if (!description && descEl) descEl.focus();
    return;
  }

  const submitBtn = document.getElementById("frSubmitBtn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.dataset.originalHtml = submitBtn.innerHTML;
    submitBtn.innerHTML = `
      <span class="material-symbols-outlined" style="font-size: 16px; animation: spin 1s linear infinite;">sync</span>
      <span>Filing Private Ticket...</span>
    `;
  }

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
    await loadAllDashboardData();
    showToast("☕ Private faculty ticket created! Guaranteed hidden from student feeds.", "success", 5000);
  } catch (err) {
    showModalFeedback("frModalFeedback", "Failed to submit faculty room issue: " + err.message, "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = submitBtn.dataset.originalHtml;
    }
  }
}

/**
 * Verification & Sign-Off Modals
 * Replaced native alerts with accessible feedback and loading states
 */
function openSignOffModal(issueId) {
  activeSignOffIssueId = issueId;
  lastFocusedElement = document.activeElement;
  clearModalFeedback("verifyModalFeedback");

  const modal = document.getElementById("verifyModal");
  if (modal) {
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    const ratingEl = document.getElementById("verifyRating");
    if (ratingEl) ratingEl.focus();
  }
}

function closeVerifyModal() {
  activeSignOffIssueId = null;
  clearModalFeedback("verifyModalFeedback");

  const modal = document.getElementById("verifyModal");
  if (modal) {
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }
  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
  }
}

async function submitTeacherVerification() {
  if (!activeSignOffIssueId) return;
  clearModalFeedback("verifyModalFeedback");

  const ratingEl = document.getElementById("verifyRating");
  const commentEl = document.getElementById("verifyComment");
  const rating = ratingEl ? parseInt(ratingEl.value) : 5;
  const comment = commentEl ? commentEl.value.trim() : "Faculty approved and closed.";

  const submitBtn = document.getElementById("verifySubmitBtn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.dataset.originalHtml = submitBtn.innerHTML;
    submitBtn.innerHTML = `
      <span class="material-symbols-outlined" style="font-size: 16px; animation: spin 1s linear infinite;">sync</span>
      <span>Signing Off...</span>
    `;
  }

  try {
    await ApiClient.verifyIssue(activeSignOffIssueId, "ACCEPT", rating, comment);
    closeVerifyModal();
    await loadAllDashboardData();
    showToast("Work order signed off and closed successfully!", "success", 4000);
  } catch (e) {
    showModalFeedback("verifyModalFeedback", "Sign-off failed: " + e.message, "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = submitBtn.dataset.originalHtml;
    }
  }
}

/**
 * Work Order Rework / Reopen Modal
 * Replaces native browser prompt dialog with an accessible, styled modal
 */
function openReopenModal(issueId) {
  activeReopenIssueId = issueId;
  lastFocusedElement = document.activeElement;
  clearModalFeedback("reopenModalFeedback");

  const reasonEl = document.getElementById("reopenReason");
  if (reasonEl) reasonEl.value = "";

  const modal = document.getElementById("reopenModal");
  if (modal) {
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    if (reasonEl) reasonEl.focus();
  }
}

function closeReopenModal() {
  activeReopenIssueId = null;
  clearModalFeedback("reopenModalFeedback");

  const modal = document.getElementById("reopenModal");
  if (modal) {
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }
  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
  }
}

async function handleReopenSubmit(e) {
  e.preventDefault();
  if (!activeReopenIssueId) return;
  clearModalFeedback("reopenModalFeedback");

  const reasonEl = document.getElementById("reopenReason");
  const reason = reasonEl ? reasonEl.value.trim() : "";

  if (!reason) {
    showModalFeedback("reopenModalFeedback", "Please provide specific rework instructions so technicians know what to address.", "error");
    if (reasonEl) reasonEl.focus();
    return;
  }

  const submitBtn = document.getElementById("reopenSubmitBtn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.dataset.originalHtml = submitBtn.innerHTML;
    submitBtn.innerHTML = `
      <span class="material-symbols-outlined" style="font-size: 16px; animation: spin 1s linear infinite;">sync</span>
      <span>Reopening Ticket...</span>
    `;
  }

  try {
    await ApiClient.verifyIssue(activeReopenIssueId, "REOPEN", null, reason);
    closeReopenModal();
    await loadAllDashboardData();
    showToast("Ticket reopened and flagged for maintenance rework.", "info", 4500);
  } catch (e) {
    showModalFeedback("reopenModalFeedback", "Reopen failed: " + e.message, "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = submitBtn.dataset.originalHtml;
    }
  }
}

// Backward compatibility alias for any existing trigger button
function reopenIssue(issueId) {
  openReopenModal(issueId);
}

/**
 * Setup Navigation Tabs (Top Header Bar)
 */
function setupNavigationTabs() {
  const tabDashboard = document.getElementById("tabFacultyDashboard");
  const tabDept = document.getElementById("tabDept");
  const tabFacultyRoom = document.getElementById("tabFacultyRoom");
  const tabCampus = document.getElementById("tabCampus");
  const tabSignOff = document.getElementById("tabSignOffNav");

  const tabs = [
    { btn: tabDashboard, scope: "ALL" },
    { btn: tabDept, scope: "DEPARTMENT_ONLY" },
    { btn: tabFacultyRoom, scope: "FACULTY_ROOM" },
    { btn: tabCampus, scope: "CAMPUS_WIDE" },
    { btn: tabSignOff, scope: "SIGNOFF" }
  ];

  tabs.forEach(({ btn, scope }) => {
    if (!btn) return;
    btn.addEventListener("click", () => {
      tabs.forEach(t => { if (t.btn) t.btn.classList.toggle("active", t.scope === scope); });

      if (scope === "SIGNOFF") {
        const sec = document.getElementById("verificationSection");
        if (sec) {
          sec.scrollIntoView({ behavior: "smooth", block: "start" });
          sec.style.outline = "2px solid #10b981";
          setTimeout(() => { sec.style.outline = "none"; }, 2500);
        }
      } else {
        currentTeacherScope = scope;
        syncFilterPills(scope);
        renderTeacherQueue();
      }
    });
  });

  // KPI card clicks
  const kpiMyReq = document.getElementById("kpiCardMyRequests");
  if (kpiMyReq) {
    kpiMyReq.addEventListener("click", () => {
      const search = document.getElementById("searchTeacherInput");
      const user = ApiClient.getUser();
      if (search && user) {
        search.value = user.full_name || "";
        renderTeacherQueue();
      }
    });
  }

  const kpiRes = document.getElementById("kpiCardResolved");
  if (kpiRes && tabSignOff) {
    kpiRes.addEventListener("click", () => tabSignOff.click());
  }
}

/**
 * Setup Queue Filter Pills Bar
 */
function setupFilterPills() {
  const pillAll = document.getElementById("pillAllRequests");
  const pillClassrooms = document.getElementById("pillClassrooms");
  const pillFacultyRoom = document.getElementById("pillFacultyRoom");
  const pillCampusWide = document.getElementById("pillCampusWide");

  const pills = [
    { btn: pillAll, scope: "ALL" },
    { btn: pillClassrooms, scope: "DEPARTMENT_ONLY" },
    { btn: pillFacultyRoom, scope: "FACULTY_ROOM" },
    { btn: pillCampusWide, scope: "CAMPUS_WIDE" }
  ];

  pills.forEach(({ btn, scope }) => {
    if (!btn) return;
    btn.addEventListener("click", () => {
      pills.forEach(p => { if (p.btn) p.btn.classList.toggle("active", p.scope === scope); });
      currentTeacherScope = scope;
      renderTeacherQueue();
    });
  });
}

function syncFilterPills(scope) {
  const pills = [
    { id: "pillAllRequests", scope: "ALL" },
    { id: "pillClassrooms", scope: "DEPARTMENT_ONLY" },
    { id: "pillFacultyRoom", scope: "FACULTY_ROOM" },
    { id: "pillCampusWide", scope: "CAMPUS_WIDE" }
  ];
  pills.forEach(({ id, scope: s }) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", s === scope);
  });
}

/**
 * Setup Search & Filter Toolbar
 */
function setupSearchAndFilters() {
  const searchInput = document.getElementById("searchTeacherInput");
  const prioritySelect = document.getElementById("filterTeacherPriority");
  const resetBtn = document.getElementById("resetTeacherFiltersBtn");

  if (searchInput) {
    searchInput.addEventListener("input", debounce(() => {
      renderTeacherQueue();
    }, 200));
  }

  if (prioritySelect) {
    prioritySelect.addEventListener("change", () => {
      renderTeacherQueue();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (prioritySelect) prioritySelect.value = "ALL";
      currentTeacherScope = "ALL";
      syncFilterPills("ALL");
      renderTeacherQueue();
    });
  }
}

/**
 * Keyboard & Focus Modal Accessibility
 */
function setupModalAccessibility() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const reopenModal = document.getElementById("reopenModal");
      if (reopenModal && reopenModal.classList.contains("open")) {
        closeReopenModal();
        return;
      }

      const verifyModal = document.getElementById("verifyModal");
      if (verifyModal && verifyModal.classList.contains("open")) {
        closeVerifyModal();
        return;
      }

      const lcModal = document.getElementById("lectureCriticalModal");
      if (lcModal && lcModal.classList.contains("open")) {
        closeLectureCriticalModal();
        return;
      }

      const frModal = document.getElementById("facultyRoomModal");
      if (frModal && frModal.classList.contains("open")) {
        closeFacultyRoomModal();
        return;
      }
    }
  });
}

/**
 * Modal Open & Close Helpers
 */
function openLectureCriticalModal() {
  lastFocusedElement = document.activeElement;
  clearModalFeedback("lcModalFeedback");
  const modal = document.getElementById("lectureCriticalModal");
  if (modal) {
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    const titleEl = document.getElementById("lcTitle");
    if (titleEl) titleEl.focus();
  }
}

function closeLectureCriticalModal() {
  clearModalFeedback("lcModalFeedback");
  const modal = document.getElementById("lectureCriticalModal");
  if (modal) {
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }
  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
  }
}

function openFacultyRoomModal() {
  lastFocusedElement = document.activeElement;
  clearModalFeedback("frModalFeedback");
  const modal = document.getElementById("facultyRoomModal");
  if (modal) {
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    const titleEl = document.getElementById("frTitle");
    if (titleEl) titleEl.focus();
  }
}

function closeFacultyRoomModal() {
  clearModalFeedback("frModalFeedback");
  const modal = document.getElementById("facultyRoomModal");
  if (modal) {
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }
  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
  }
}

/**
 * Toast & Feedback Banner Utilities
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

function showModalFeedback(elementId, message, type = "error") {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.className = `modal-feedback-banner ${type}`;
  el.innerHTML = `
    <span class="material-symbols-outlined" style="font-size: 18px;">${type === "error" ? "error" : "check_circle"}</span>
    <span>${escapeHtml(message)}</span>
  `;
  el.style.display = "flex";
}

function clearModalFeedback(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.style.display = "none";
  el.textContent = "";
}

// Utility: Escape HTML
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Utility: Debounce
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
