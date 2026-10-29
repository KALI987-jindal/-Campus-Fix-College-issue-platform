/**
 * CampusFix Student Dashboard Controller
 * Aligned with Google Stitch "Civic Collegiate" Design System
 */

// In-Memory State
let allLoadedIssues = [];
let allLoadedSuggestions = [];
let currentTab = "all"; // "all" | "my_dept" | "campus_wide" | "my_reports" | "suggestions"
let currentScopeView = "ALL";
let activeVerifyIssueId = null;

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Authenticate & Setup Header
  setupDashboardHeader();
  setupStudentGreeting();

  // 2. Load Static Dropdowns & Broadcasts
  await loadBroadcastNotice();
  await loadDepartmentsDropdown();

  // 3. Load Real Data from APIs
  await loadAllDashboardData();

  // 4. Bind Search, Filters & Navigation
  setupNavigationTabs();
  setupSearchAndFilters();
  setupDuplicateDetection();

  // 5. Bind Report Issue Form
  const reportForm = document.getElementById("reportIssueForm");
  if (reportForm) {
    reportForm.addEventListener("submit", handleCreateIssue);
  }
});

/**
 * Configure student-specific welcome greeting & subtitles
 */
function setupStudentGreeting() {
  const user = ApiClient.getUser();
  if (!user) return;

  const firstName = user.full_name ? user.full_name.split(" ")[0] : "Student";
  const deptName = user.academic_department_name || "Academic Department";

  const welcomeEl = document.getElementById("welcomeStudentName");
  if (welcomeEl) welcomeEl.textContent = firstName;

  const subtitleEl = document.getElementById("studentDeptSubtitle");
  if (subtitleEl) subtitleEl.textContent = `${deptName} | Student Portal`;

  const deptHeaderEl = document.getElementById("deptHeaderName");
  if (deptHeaderEl) deptHeaderEl.textContent = deptName;
}

/**
 * Load Broadcast Notice Banner via API
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
 * Populate Department Select in Report Modal
 */
async function loadDepartmentsDropdown() {
  const select = document.getElementById("issueDepartment");
  const user = ApiClient.getUser();
  if (!select) return;

  try {
    const depts = await ApiClient.getDepartments();
    select.innerHTML = depts.map(d => {
      const isSelected = user && d.id === user.academic_department_id ? "selected" : "";
      return `<option value="${d.id}" ${isSelected}>${d.name} (${d.code})</option>`;
    }).join("");
  } catch (e) {
    console.error("Failed to load departments dropdown:", e);
  }
}

/**
 * Fetch All Issues and Suggestions, Calculate Real KPIs, and Render Feeds
 */
async function loadAllDashboardData() {
  try {
    const [issues, suggestions] = await Promise.all([
      ApiClient.getIssues({ scope_view: "ALL" }),
      ApiClient.getSuggestions ? ApiClient.getSuggestions().catch(() => []) : Promise.resolve([])
    ]);

    allLoadedIssues = Array.isArray(issues) ? issues : [];
    allLoadedSuggestions = Array.isArray(suggestions) ? suggestions : [];

    // Calculate Real KPI Metrics
    calculateAndRenderKPIs();

    // Render Feeds
    renderFeeds();

    // Render Suggestions Panel
    renderSuggestionsPanel();

  } catch (err) {
    console.error("Failed to load dashboard data:", err);
    const deptContainer = document.getElementById("deptIssuesContainer");
    if (deptContainer) {
      deptContainer.innerHTML = `<div class="badge badge-sla-breached" style="padding: 1rem; width: 100%;">Failed to load issues: ${err.message}</div>`;
    }
  }
}

/**
 * Strictly Calculate Metric KPI Summary Cards using Real API Data
 */
function calculateAndRenderKPIs() {
  const user = ApiClient.getUser();
  const userId = user ? user.user_id : null;

  // 1. My Reported Issues
  const myIssues = allLoadedIssues.filter(i => userId && i.reported_by_user_id === userId);
  const myUnderReview = myIssues.filter(i => i.status === "SUBMITTED").length;
  const myActive = myIssues.filter(i => i.status !== "CLOSED" && i.status !== "RESOLVED").length;

  const kpiMyIssuesEl = document.getElementById("kpiMyIssuesCount");
  if (kpiMyIssuesEl) kpiMyIssuesEl.textContent = myIssues.length;

  const kpiMyIssuesSub = document.getElementById("kpiMyIssuesSubtext");
  if (kpiMyIssuesSub) kpiMyIssuesSub.textContent = `${myUnderReview} Under Review`;

  const kpiMyIssuesBadge = document.getElementById("kpiMyIssuesBadge");
  if (kpiMyIssuesBadge) kpiMyIssuesBadge.textContent = `${myActive} Active`;

  // 2. In Progress Issues (Assigned or In Progress)
  const inProgressIssues = allLoadedIssues.filter(i => i.status === "IN_PROGRESS" || i.status === "ASSIGNED");
  const kpiInProgressEl = document.getElementById("kpiInProgressCount");
  if (kpiInProgressEl) kpiInProgressEl.textContent = inProgressIssues.length;

  const kpiInProgressSub = document.getElementById("kpiInProgressSubtext");
  if (kpiInProgressSub) kpiInProgressSub.textContent = `${inProgressIssues.length} Assigned Technicians`;

  // 3. Resolved Issues
  const resolvedIssues = allLoadedIssues.filter(i => i.status === "RESOLVED" || i.status === "CLOSED");
  const awaitingVerify = allLoadedIssues.filter(i => i.status === "RESOLVED" && userId && i.reported_by_user_id === userId).length;

  const kpiResolvedEl = document.getElementById("kpiResolvedCount");
  if (kpiResolvedEl) kpiResolvedEl.textContent = resolvedIssues.length;

  const kpiResolvedSub = document.getElementById("kpiResolvedSubtext");
  if (kpiResolvedSub) {
    kpiResolvedSub.textContent = awaitingVerify > 0 ? `${awaitingVerify} Awaiting Verification` : "Fixes Completed";
  }

  // 4. Suggestions Count
  const approvedSuggestions = allLoadedSuggestions.filter(s => s.status === "APPROVED").length;
  const kpiSuggestionsEl = document.getElementById("kpiSuggestionsCount");
  if (kpiSuggestionsEl) kpiSuggestionsEl.textContent = allLoadedSuggestions.length;

  const kpiSuggestionsSub = document.getElementById("kpiSuggestionsSubtext");
  if (kpiSuggestionsSub) kpiSuggestionsSub.textContent = `${approvedSuggestions} Senate Approved`;
}

/**
 * Filter and Render Department & Campus Common Feeds
 */
function renderFeeds() {
  const user = ApiClient.getUser();
  const userDeptId = user ? user.academic_department_id : null;
  const userId = user ? user.user_id : null;

  const searchInput = document.getElementById("searchIssuesInput");
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";

  const prioritySelect = document.getElementById("filterPriority");
  const selectedPriority = prioritySelect ? prioritySelect.value : "ALL";

  const scopeSelect = document.getElementById("filterScope");
  const selectedScope = scopeSelect ? scopeSelect.value : "ALL";

  // Filter Issues
  let filtered = allLoadedIssues.filter(issue => {
    // Priority Filter
    if (selectedPriority !== "ALL" && issue.priority !== selectedPriority) {
      return false;
    }

    // Scope Select Filter
    if (selectedScope === "DEPARTMENT_ONLY" && issue.scope !== "DEPARTMENT_ONLY") {
      return false;
    }
    if (selectedScope === "CAMPUS_WIDE" && issue.scope !== "CAMPUS_WIDE") {
      return false;
    }
    if (selectedScope === "MY_REPORTS" && (!userId || issue.reported_by_user_id !== userId)) {
      return false;
    }

    // Search Query
    if (searchTerm) {
      const titleMatch = (issue.title || "").toLowerCase().includes(searchTerm);
      const descMatch = (issue.description || "").toLowerCase().includes(searchTerm);
      const locMatch = (issue.location_room_or_block || "").toLowerCase().includes(searchTerm);
      const tradeMatch = (issue.service_trade || "").toLowerCase().includes(searchTerm);
      if (!titleMatch && !descMatch && !locMatch && !tradeMatch) return false;
    }

    return true;
  });

  // Split into Department, Campus, and My Reports
  const deptIssues = filtered.filter(i => i.scope === "DEPARTMENT_ONLY" || (userDeptId && i.academic_department_id === userDeptId));
  const campusIssues = filtered.filter(i => i.scope === "CAMPUS_WIDE");
  const myIssues = filtered.filter(i => userId && i.reported_by_user_id === userId);

  // Section Visibility Based on Current Tab
  const deptSection = document.getElementById("deptSection");
  const campusSection = document.getElementById("campusSection");
  const myReportsSection = document.getElementById("myReportsSection");

  if (currentTab === "my_dept") {
    if (deptSection) deptSection.style.display = "block";
    if (campusSection) campusSection.style.display = "none";
    if (myReportsSection) myReportsSection.style.display = "none";
  } else if (currentTab === "campus_wide") {
    if (deptSection) deptSection.style.display = "none";
    if (campusSection) campusSection.style.display = "block";
    if (myReportsSection) myReportsSection.style.display = "none";
  } else if (currentTab === "my_reports") {
    if (deptSection) deptSection.style.display = "none";
    if (campusSection) campusSection.style.display = "none";
    if (myReportsSection) myReportsSection.style.display = "block";
  } else {
    // All
    if (deptSection) deptSection.style.display = "block";
    if (campusSection) campusSection.style.display = "block";
    if (myReportsSection) myReportsSection.style.display = "none";
  }

  // Update Section Badges
  const deptBadge = document.getElementById("deptActiveCountBadge");
  if (deptBadge) deptBadge.textContent = `${deptIssues.length} in Department`;

  const campusBadge = document.getElementById("campusActiveCountBadge");
  if (campusBadge) campusBadge.textContent = `${campusIssues.length} Public Tickets`;

  const myReportsBadge = document.getElementById("myReportsCountBadge");
  if (myReportsBadge) myReportsBadge.textContent = `${myIssues.length} Reported`;

  // Render Department Container
  const deptContainer = document.getElementById("deptIssuesContainer");
  if (deptContainer) {
    if (deptIssues.length === 0) {
      deptContainer.innerHTML = renderEmptyState("🏢 No department complaints found matching your filters.");
    } else {
      deptContainer.innerHTML = deptIssues.map(renderStitchIssueCard).join("");
    }
  }

  // Render Campus Container
  const campusContainer = document.getElementById("campusIssuesContainer");
  if (campusContainer) {
    if (campusIssues.length === 0) {
      campusContainer.innerHTML = renderEmptyState("🌐 No common campus issues found matching your filters.");
    } else {
      campusContainer.innerHTML = campusIssues.map(renderStitchIssueCard).join("");
    }
  }

  // Render My Reports Container
  const myReportsContainer = document.getElementById("myReportsIssuesContainer");
  if (myReportsContainer) {
    if (myIssues.length === 0) {
      myReportsContainer.innerHTML = renderEmptyState("👤 You have not submitted any complaints yet. Use '+ Report an Issue' to file a request.");
    } else {
      myReportsContainer.innerHTML = myIssues.map(renderStitchIssueCard).join("");
    }
  }
}

/**
 * Render a Single Issue Card matching Google Stitch Civic Collegiate Design
 */
function renderStitchIssueCard(issue) {
  const user = ApiClient.getUser();
  const userId = user ? user.user_id : null;
  const isReporter = userId && issue.reported_by_user_id === userId;
  const isVoted = issue.user_has_upvoted;

  // Priority Badge
  let priorityClass = "badge-priority-low";
  let priorityLabel = issue.priority || "LOW";
  if (issue.priority === "CRITICAL" || issue.priority === "LECTURE_CRITICAL") {
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

  // SLA Breached Pill
  const slaBadgeHtml = issue.is_sla_breached
    ? `<span class="stitch-badge badge-priority-critical">⚠️ SLA BREACHED</span>`
    : "";

  // Scope Pill
  const scopeBadgeHtml = issue.scope === "CAMPUS_WIDE"
    ? `<span class="stitch-badge" style="background: #e0f2fe; color: #0369a1;">🌐 Campus Shared</span>`
    : `<span class="stitch-badge" style="background: #f1f5f9; color: #475569;">🏢 ${issue.academic_department_name || "Department"}</span>`;

  // Fix Proof Banner
  let proofHtml = "";
  if (issue.resolution_proof_url) {
    proofHtml = `
      <div class="stitch-proof-box">
        <span class="material-symbols-outlined" style="font-size: 20px;">photo_camera</span>
        <span>
          <strong>Fix Proof:</strong> ${issue.resolution_note || "Repair work completed."}
          <a href="http://127.0.0.1:8000${issue.resolution_proof_url}" target="_blank" style="color: #15803d; font-weight: 700; text-decoration: underline; margin-left: 4px;">View Photo</a>
        </span>
      </div>
    `;
  }

  // Verification Prompt for Reporter on Resolved Tickets
  let verifyActionHtml = "";
  if (issue.status === "RESOLVED" && isReporter) {
    verifyActionHtml = `
      <div class="stitch-verify-action-box">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="material-symbols-outlined" style="font-size: 20px; color: #0284c7;">task_alt</span>
          <span class="stitch-verify-text">Technician completed repair. Please verify:</span>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-sm btn-success" type="button" onclick="openVerifyModal(${issue.id})">
            Accept & Rate (★)
          </button>
          <button class="btn btn-sm btn-danger" type="button" onclick="reopenIssue(${issue.id})">
            Reopen Ticket
          </button>
        </div>
      </div>
    `;
  }

  // Star Rating Display if ticket is Closed with rating
  let ratingHtml = "";
  if (issue.star_rating) {
    const stars = "★".repeat(issue.star_rating) + "☆".repeat(5 - issue.star_rating);
    ratingHtml = `<span style="color: #f59e0b; font-size: 0.82rem; font-weight: 700;">Rating: ${stars}</span>`;
  }

  const createdDate = issue.created_at ? new Date(issue.created_at).toLocaleDateString() : "Recent";
  const ticketIdStr = `#TICKET-${issue.id}`;

  return `
    <article class="stitch-issue-card" id="issue-card-${issue.id}">
      <!-- Top Badges Row -->
      <div class="stitch-card-top-row">
        <div class="stitch-badges-cluster">
          <span class="stitch-badge ${priorityClass}">${priorityLabel}</span>
          <span class="stitch-badge ${statusClass}">${statusLabel}</span>
          ${scopeBadgeHtml}
          ${slaBadgeHtml}
          <span class="stitch-ticket-number">${ticketIdStr}</span>
        </div>
        <span class="stitch-card-time">${createdDate}</span>
      </div>

      <!-- Card Title & Location -->
      <div>
        <h3 class="stitch-card-title">${escapeHtml(issue.title)}</h3>
        <div class="stitch-card-location" style="margin-top: 4px;">
          <span class="material-symbols-outlined">location_on</span>
          <span>${escapeHtml(issue.location_room_or_block || "Campus Facility")}</span>
        </div>
      </div>

      <!-- Description -->
      <p class="stitch-card-desc">${escapeHtml(issue.description || "")}</p>

      <!-- Proof & Verification Banners -->
      ${proofHtml}
      ${verifyActionHtml}

      <!-- Metadata Chips -->
      <div class="stitch-card-meta">
        <span class="stitch-meta-chip">
          <span class="material-symbols-outlined" style="font-size: 15px;">build</span>
          <span>Trade: ${issue.service_trade || "General"}</span>
        </span>
        <span class="stitch-meta-chip">
          <span class="material-symbols-outlined" style="font-size: 15px;">person</span>
          <span>By: ${escapeHtml(issue.reported_by_name || "Student")}</span>
        </span>
        ${ratingHtml}
      </div>

      <!-- Footer with Upvote Button -->
      <div class="stitch-card-footer">
        <button class="stitch-upvote-btn ${isVoted ? 'voted' : ''}" id="upvote-btn-${issue.id}" onclick="handleUpvote(${issue.id}, event)" type="button">
          <span class="material-symbols-outlined" style="font-size: 18px;">thumb_up</span>
          <span>Me Too (<span id="upvote-count-${issue.id}" class="vote-num font-bold">${issue.upvotes_count || 0}</span>)</span>
        </button>

        <span style="font-size: 0.78rem; color: var(--secondary);">
          ${issue.assigned_technician_name ? `Technician: ${issue.assigned_technician_name}` : "Status: Scoped to Grounds"}
        </span>
      </div>
    </article>
  `;
}

/**
 * Render Empty State Placeholder
 */
function renderEmptyState(message) {
  return `
    <div class="empty-state" style="background: #ffffff; border: 1px dashed var(--border); border-radius: var(--radius-lg); padding: 2.5rem 1rem;">
      <div class="empty-state-icon">🎉</div>
      <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--primary); margin-bottom: 0.25rem;">Feed Up to Date</h3>
      <p style="font-size: 0.85rem; color: var(--secondary); margin: 0;">${message}</p>
    </div>
  `;
}

/**
 * Handle "Me Too" Upvote Toggle via API
 */
async function handleUpvote(issueId, event) {
  if (event) event.preventDefault();

  try {
    const res = await ApiClient.toggleUpvote(issueId);

    // Update In-Memory Issue
    const targetIssue = allLoadedIssues.find(i => i.id === issueId);
    if (targetIssue) {
      targetIssue.upvotes_count = res.upvotes_count;
      targetIssue.user_has_upvoted = res.upvoted;
    }

    // Update DOM
    const btn = document.getElementById(`upvote-btn-${issueId}`);
    const countSpan = document.getElementById(`upvote-count-${issueId}`);

    if (btn && countSpan) {
      countSpan.textContent = res.upvotes_count;
      btn.classList.toggle("voted", res.upvoted);
    }

    // Also update backward-compatible upvote-box if present
    const oldBox = document.querySelector(`#issue-card-${issueId} .upvote-box`);
    if (oldBox) {
      oldBox.classList.toggle("upvoted", res.upvoted);
    }

  } catch (err) {
    alert("Could not register upvote: " + err.message);
  }
}

/**
 * Render Right Sidebar: Campus Suggestions Panel
 */
function renderSuggestionsPanel() {
  const container = document.getElementById("suggestionsContainer");
  if (!container) return;

  if (allLoadedSuggestions.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 1.5rem; color: var(--secondary); font-size: 0.82rem;">
        No campus suggestions posted yet. Be the first to submit one!
      </div>
    `;
    return;
  }

  // Show top suggestions (up to 4)
  const topSuggestions = allLoadedSuggestions.slice(0, 4);

  container.innerHTML = topSuggestions.map(sugg => {
    const isVoted = sugg.user_has_upvoted;
    let statusPill = "";
    if (sugg.status === "APPROVED") {
      statusPill = `<span class="stitch-badge" style="background: #d1fae5; color: #065f46;">Approved • Pilot</span>`;
    } else if (sugg.status === "REJECTED") {
      statusPill = `<span class="stitch-badge" style="background: #fee2e2; color: #991b1b;">Closed</span>`;
    } else {
      statusPill = `<span class="stitch-badge" style="background: #fef3c7; color: #92400e;">Under Review</span>`;
    }

    return `
      <div class="suggestion-item-card" id="suggestion-card-${sugg.id}">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem;">
          <h4 class="suggestion-title">${escapeHtml(sugg.title)}</h4>
        </div>
        <p class="suggestion-desc">${escapeHtml(sugg.description)}</p>
        <div class="suggestion-footer">
          ${statusPill}
          <button class="suggestion-endorsements ${isVoted ? 'voted' : ''}" type="button" onclick="handleSuggestionUpvote(${sugg.id})" title="Endorse suggestion">
            <span class="material-symbols-outlined" style="font-size: 14px;">how_to_vote</span>
            <span id="sugg-count-${sugg.id}">${sugg.upvotes_count || 0}</span>
          </button>
        </div>
      </div>
    `;
  }).join("");
}

/**
 * Handle Suggestion Endorsement Upvote
 */
async function handleSuggestionUpvote(suggestionId) {
  try {
    const res = await ApiClient.toggleSuggestionUpvote(suggestionId);

    // Update in-memory
    const target = allLoadedSuggestions.find(s => s.id === suggestionId);
    if (target) {
      target.upvotes_count = res.upvotes_count;
      target.user_has_upvoted = res.upvoted;
    }

    // Update DOM
    const countSpan = document.getElementById(`sugg-count-${suggestionId}`);
    const card = document.getElementById(`suggestion-card-${suggestionId}`);
    const btn = card ? card.querySelector(".suggestion-endorsements") : null;

    if (countSpan) countSpan.textContent = res.upvotes_count;
    if (btn) btn.classList.toggle("voted", res.upvoted);

  } catch (err) {
    alert("Could not endorse suggestion: " + err.message);
  }
}

/**
 * Handle Submitting a New Suggestion
 */
async function handleCreateSuggestion(e) {
  e.preventDefault();
  const title = document.getElementById("suggestionTitle").value.trim();
  const category = document.getElementById("suggestionCategory").value;
  const description = document.getElementById("suggestionDesc").value.trim();
  const isAnonymous = document.getElementById("suggestionAnonymous").checked;

  if (!title || !description) return;

  try {
    await ApiClient.createSuggestion({
      title,
      category,
      description,
      is_anonymous: isAnonymous
    });

    closeSuggestionModal();
    document.getElementById("suggestionForm").reset();

    // Reload Suggestions & KPIs
    const suggestions = await ApiClient.getSuggestions();
    allLoadedSuggestions = Array.isArray(suggestions) ? suggestions : [];
    calculateAndRenderKPIs();
    renderSuggestionsPanel();

    alert("Suggestion submitted successfully! It will be reviewed in the monthly Senate session.");
  } catch (err) {
    alert("Error submitting suggestion: " + err.message);
  }
}

/**
 * Handle Issue Creation Form Submission
 */
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

  if (!title || !description || !location || isNaN(deptId)) {
    alert("Please fill in all required fields.");
    return;
  }

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
    const warningBox = document.getElementById("duplicateWarningBox");
    if (warningBox) warningBox.style.display = "none";

    await loadAllDashboardData();
    alert("Grievance ticket created successfully! Dispatched to facilities technicians.");
  } catch (err) {
    alert("Error creating issue: " + err.message);
  }
}

/**
 * Real-Time Client-Side Duplicate Detection
 */
function setupDuplicateDetection() {
  const titleInput = document.getElementById("issueTitle");
  const warningBox = document.getElementById("duplicateWarningBox");
  const warningText = document.getElementById("duplicateWarningText");
  const viewBtn = document.getElementById("duplicateViewBtn");

  if (!titleInput || !warningBox || !warningText) return;

  titleInput.addEventListener("input", () => {
    const rawVal = titleInput.value.trim().toLowerCase();

    if (rawVal.length < 4) {
      warningBox.style.display = "none";
      return;
    }

    // Clean tokens (>3 chars)
    const tokens = rawVal.split(/\s+/).filter(w => w.length > 3);
    if (tokens.length === 0) {
      warningBox.style.display = "none";
      return;
    }

    // Check open issues
    const match = allLoadedIssues.find(issue => {
      if (issue.status === "CLOSED" || issue.status === "RESOLVED") return false;
      const issueTitle = (issue.title || "").toLowerCase();
      const issueLoc = (issue.location_room_or_block || "").toLowerCase();

      // Check if substring matches or multiple tokens match
      if (issueTitle.includes(rawVal) || rawVal.includes(issueTitle)) return true;

      const matchingTokens = tokens.filter(t => issueTitle.includes(t) || issueLoc.includes(t));
      return matchingTokens.length >= 2;
    });

    if (match) {
      warningText.innerHTML = `
        <strong>${escapeHtml(match.title)}</strong> at <em>${escapeHtml(match.location_room_or_block)}</em> (${match.upvotes_count || 0} upvotes).
      `;
      warningBox.style.display = "flex";

      if (viewBtn) {
        viewBtn.onclick = () => {
          closeReportModal();
          const targetCard = document.getElementById(`issue-card-${match.id}`);
          if (targetCard) {
            targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
            targetCard.style.outline = "2px solid var(--accent-blue)";
            setTimeout(() => { targetCard.style.outline = "none"; }, 3000);
          }
        };
      }
    } else {
      warningBox.style.display = "none";
    }
  });
}

/**
 * Ticket Verification (Accept / Reopen)
 */
function openVerifyModal(issueId) {
  activeVerifyIssueId = issueId;
  const modal = document.getElementById("verifyModal");
  if (modal) modal.classList.add("open");
}

function closeVerifyModal() {
  activeVerifyIssueId = null;
  const modal = document.getElementById("verifyModal");
  if (modal) modal.classList.remove("open");
}

async function submitVerification() {
  if (!activeVerifyIssueId) return;
  const ratingEl = document.getElementById("verifyRating");
  const commentEl = document.getElementById("verifyComment");
  const rating = ratingEl ? parseInt(ratingEl.value) : 5;
  const comment = commentEl ? commentEl.value.trim() : "";

  try {
    await ApiClient.verifyIssue(activeVerifyIssueId, "ACCEPT", rating, comment);
    closeVerifyModal();
    await loadAllDashboardData();
    alert("Thank you! Work order confirmed verified and closed.");
  } catch (e) {
    alert("Failed to submit verification: " + e.message);
  }
}

async function reopenIssue(issueId) {
  const reason = prompt("Please provide reason for reopening the ticket (e.g. equipment still not working):");
  if (!reason || !reason.trim()) return;

  try {
    await ApiClient.verifyIssue(issueId, "REOPEN", null, reason.trim());
    await loadAllDashboardData();
    alert("Ticket reopened and flagged for maintenance review.");
  } catch (e) {
    alert("Failed to reopen ticket: " + e.message);
  }
}

/**
 * Setup Navigation Tabs (Stitch Top Navigation Bar)
 */
function setupNavigationTabs() {
  const tabAll = document.getElementById("tabAllIssues");
  const tabDept = document.getElementById("tabMyDept");
  const tabCampus = document.getElementById("tabCampusWide");
  const tabReports = document.getElementById("tabMyReports");
  const tabSugg = document.getElementById("tabSuggestions");

  const tabs = [
    { btn: tabAll, key: "all" },
    { btn: tabDept, key: "my_dept" },
    { btn: tabCampus, key: "campus_wide" },
    { btn: tabReports, key: "my_reports" },
    { btn: tabSugg, key: "suggestions" }
  ];

  tabs.forEach(({ btn, key }) => {
    if (!btn) return;
    btn.addEventListener("click", () => {
      tabs.forEach(t => { if (t.btn) t.btn.classList.toggle("active", t.key === key); });
      currentTab = key;

      if (key === "suggestions") {
        const panel = document.getElementById("suggestionsPanel");
        if (panel) {
          panel.scrollIntoView({ behavior: "smooth", block: "start" });
          panel.style.boxShadow = "0 0 0 3px rgba(0, 88, 190, 0.3)";
          setTimeout(() => { panel.style.boxShadow = ""; }, 2500);
        }
      } else {
        renderFeeds();
      }
    });
  });

  // KPI card clicks
  const kpiMyIssues = document.getElementById("kpiCardMyIssues");
  if (kpiMyIssues) {
    kpiMyIssues.addEventListener("click", () => {
      if (tabReports) tabReports.click();
    });
  }

  const kpiSuggestions = document.getElementById("kpiCardSuggestions");
  if (kpiSuggestions) {
    kpiSuggestions.addEventListener("click", () => {
      if (tabSugg) tabSugg.click();
    });
  }
}

/**
 * Setup Search & Filter Toolbar Listeners
 */
function setupSearchAndFilters() {
  const searchInput = document.getElementById("searchIssuesInput");
  const prioritySelect = document.getElementById("filterPriority");
  const scopeSelect = document.getElementById("filterScope");
  const resetBtn = document.getElementById("resetFiltersBtn");

  if (searchInput) {
    searchInput.addEventListener("input", debounce(() => {
      renderFeeds();
    }, 200));
  }

  if (prioritySelect) {
    prioritySelect.addEventListener("change", () => {
      renderFeeds();
    });
  }

  if (scopeSelect) {
    scopeSelect.addEventListener("change", () => {
      renderFeeds();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (prioritySelect) prioritySelect.value = "ALL";
      if (scopeSelect) scopeSelect.value = "ALL";
      renderFeeds();
    });
  }
}

/**
 * Modal Open & Close Helpers
 */
function openReportModal() {
  const modal = document.getElementById("reportModal");
  if (modal) {
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }
}

function closeReportModal() {
  const modal = document.getElementById("reportModal");
  if (modal) {
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }
}

function openSuggestionModal() {
  const modal = document.getElementById("suggestionModal");
  if (modal) {
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }
}

function closeSuggestionModal() {
  const modal = document.getElementById("suggestionModal");
  if (modal) {
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }
}

// Utility: Escape HTML to avoid XSS
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
