/**
 * CampusFix Student Dashboard Logic
 */
let currentScopeView = "ALL";
let currentTab = "my_dept";

document.addEventListener("DOMContentLoaded", async () => {
  setupDashboardHeader();
  await loadBroadcastNotice();
  await loadDepartmentsDropdown();
  await loadIssues();

  // Handle Tab Switch
  document.getElementById("tabMyDept").addEventListener("click", () => switchTab("my_dept"));
  document.getElementById("tabCampusWide").addEventListener("click", () => switchTab("campus_wide"));

  // Handle Issue Creation Form
  const reportForm = document.getElementById("reportIssueForm");
  if (reportForm) {
    reportForm.addEventListener("submit", handleCreateIssue);
  }
});

async function switchTab(tab) {
  currentTab = tab;
  document.getElementById("tabMyDept").classList.toggle("active", tab === "my_dept");
  document.getElementById("tabCampusWide").classList.toggle("active", tab === "campus_wide");

  if (tab === "my_dept") {
    currentScopeView = "DEPARTMENT_ONLY";
  } else {
    currentScopeView = "CAMPUS_WIDE";
  }

  await loadIssues();
}

async function loadBroadcastNotice() {
  try {
    const notices = await ApiClient.getBroadcasts();
    const banner = document.getElementById("broadcastBanner");
    if (notices && notices.length > 0) {
      const latest = notices[0];
      document.getElementById("broadcastTitle").textContent = latest.title;
      document.getElementById("broadcastMsg").textContent = latest.message;
      banner.style.display = "flex";
    } else {
      banner.style.display = "none";
    }
  } catch (e) {
    console.error("Failed to load broadcast notice:", e);
  }
}

async function loadDepartmentsDropdown() {
  const select = document.getElementById("issueDepartment");
  const user = ApiClient.getUser();
  if (!select || !user) return;

  try {
    const depts = await ApiClient.getDepartments();
    select.innerHTML = depts.map(d => {
      const isSelected = d.id === user.academic_department_id ? "selected" : "";
      return `<option value="${d.id}" ${isSelected}>${d.name} (${d.code})</option>`;
    }).join("");
  } catch (e) {
    console.error("Failed to load departments dropdown:", e);
  }
}

async function loadIssues() {
  const container = document.getElementById("issuesFeedContainer");
  container.innerHTML = `<div style="text-align: center; padding: 2rem;">Loading scoped complaints...</div>`;

  try {
    const issues = await ApiClient.getIssues({ scope_view: currentScopeView });

    if (!issues || issues.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎉</div>
          <h3>No Open Issues in this Feed</h3>
          <p>Everything in this section is running smoothly or resolved.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = issues.map(renderIssueCard).join("");
  } catch (e) {
    container.innerHTML = `<div class="badge badge-sla-breached" style="padding: 1rem; width: 100%;">Failed to load issues: ${e.message}</div>`;
  }
}

function renderIssueCard(issue) {
  const isUpvoted = issue.user_has_upvoted ? "upvoted" : "";
  const statusBadge = `badge badge-${issue.status.toLowerCase()}`;
  const priorityBadge = issue.priority === "LECTURE_CRITICAL" 
    ? "badge badge-lecture-critical" 
    : (issue.priority === "CRITICAL" ? "badge badge-critical" : "badge");

  const slaBadge = issue.is_sla_breached 
    ? `<span class="badge badge-sla-breached">⚠️ SLA BREACHED</span>` 
    : "";

  const scopeBadge = issue.scope === "CAMPUS_WIDE"
    ? `<span class="badge" style="background: #e0f2fe; color: #0369a1;">🌐 Central Campus</span>`
    : `<span class="badge" style="background: #f1f5f9; color: #475569;">🏢 ${issue.academic_department_name || "Department"}</span>`;

  // Verification button if resolved
  const isResolved = issue.status === "RESOLVED";
  const user = ApiClient.getUser();
  const isReporter = user && issue.reported_by_user_id === user.user_id;

  let verifyBtnHtml = "";
  if (isResolved && isReporter) {
    verifyBtnHtml = `
      <div style="margin-top: 0.75rem; padding: 0.75rem; background: #f0fdf4; border-radius: var(--radius-md); border: 1px solid #bbf7d0; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.85rem; color: #166534; font-weight: 600;">Technician uploaded fix proof. Please verify:</span>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-sm btn-success" onclick="openVerifyModal(${issue.id})">Accept & Rate (★)</button>
          <button class="btn btn-sm btn-danger" onclick="reopenIssue(${issue.id})">Reopen</button>
        </div>
      </div>
    `;
  }

  // Fix proof link
  let proofHtml = "";
  if (issue.resolution_proof_url) {
    proofHtml = `<div style="margin-top: 0.5rem; font-size: 0.8rem; color: #16a34a;">📸 <strong>Fix Proof:</strong> ${issue.resolution_note || "Repaired"} (<a href="http://127.0.0.1:8000${issue.resolution_proof_url}" target="_blank" style="color: #2563eb;">View Photo</a>)</div>`;
  }

  return `
    <div class="issue-card" id="issue-card-${issue.id}">
      <!-- Upvote Component -->
      <div class="upvote-box ${isUpvoted}" onclick="handleUpvote(${issue.id})">
        <span class="upvote-arrow">▲</span>
        <span class="upvote-count" id="upvote-count-${issue.id}">${issue.upvotes_count}</span>
      </div>

      <!-- Main Body -->
      <div class="issue-main">
        <div class="issue-header">
          ${scopeBadge}
          <span class="${priorityBadge}">${issue.priority}</span>
          <span class="${statusBadge}">${issue.status}</span>
          ${slaBadge}
        </div>

        <h3 class="issue-title">${issue.title}</h3>
        <p class="issue-description">${issue.description}</p>

        ${proofHtml}
        ${verifyBtnHtml}

        <div class="issue-meta" style="margin-top: 0.75rem;">
          <span class="meta-item">📍 ${issue.location_room_or_block}</span>
          <span class="meta-item">🛠️ Trade: ${issue.service_trade}</span>
          <span class="meta-item">👤 By: ${issue.reported_by_name}</span>
          <span class="meta-item">📅 ${new Date(issue.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  `;
}

async function handleUpvote(issueId) {
  try {
    const res = await ApiClient.toggleUpvote(issueId);
    const box = document.querySelector(`#issue-card-${issueId} .upvote-box`);
    const countEl = document.getElementById(`upvote-count-${issueId}`);

    if (box && countEl) {
      countEl.textContent = res.upvotes_count;
      box.classList.toggle("upvoted", res.upvoted);
    }
  } catch (err) {
    alert("Could not upvote: " + err.message);
  }
}

async function handleCreateIssue(e) {
  e.preventDefault();
  const title = document.getElementById("issueTitle").value.trim();
  const description = document.getElementById("issueDesc").value.trim();
  const deptId = parseInt(document.getElementById("issueDepartment").value);
  const trade = document.getElementById("issueTrade").value;
  const priority = document.getElementById("issuePriority").value;
  const location = document.getElementById("issueLocation").value.trim();
  const scope = document.getElementById("issueScope").value;
  const isAnonymous = document.getElementById("issueAnonymous").checked;

  try {
    await ApiClient.createIssue({
      title,
      description,
      academic_department_id: deptId,
      service_trade: trade,
      priority,
      location_room_or_block: location,
      scope,
      is_anonymous: isAnonymous
    });

    closeReportModal();
    document.getElementById("reportIssueForm").reset();
    await loadIssues();
  } catch (err) {
    alert("Error creating issue: " + err.message);
  }
}

let activeVerifyIssueId = null;
function openVerifyModal(issueId) {
  activeVerifyIssueId = issueId;
  document.getElementById("verifyModal").classList.add("open");
}

function closeVerifyModal() {
  activeVerifyIssueId = null;
  document.getElementById("verifyModal").classList.remove("open");
}

async function submitVerification() {
  if (!activeVerifyIssueId) return;
  const rating = parseInt(document.getElementById("verifyRating").value);
  const comment = document.getElementById("verifyComment").value.trim();

  try {
    await ApiClient.verifyIssue(activeVerifyIssueId, "ACCEPT", rating, comment);
    closeVerifyModal();
    await loadIssues();
  } catch (e) {
    alert("Failed to submit feedback: " + e.message);
  }
}

async function reopenIssue(issueId) {
  const reason = prompt("Please provide reason for reopening the ticket (e.g. equipment still not working):");
  if (!reason) return;

  try {
    await ApiClient.verifyIssue(issueId, "REOPEN", null, reason);
    await loadIssues();
  } catch (e) {
    alert("Failed to reopen ticket: " + e.message);
  }
}

function openReportModal() {
  document.getElementById("reportModal").classList.add("open");
}
function closeReportModal() {
  document.getElementById("reportModal").classList.remove("open");
}
