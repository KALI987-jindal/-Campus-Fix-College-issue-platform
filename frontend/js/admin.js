/**
 * CampusFix Dean & Executive Admin Controller
 */
document.addEventListener("DOMContentLoaded", async () => {
  setupDashboardHeader();
  await loadExecutiveDashboard();
  await loadBroadcasts();

  const broadcastForm = document.getElementById("createBroadcastForm");
  if (broadcastForm) {
    broadcastForm.addEventListener("submit", handleCreateBroadcast);
  }
});

async function loadExecutiveDashboard() {
  try {
    const data = await ApiClient.getAdminDashboard();

    // 1. Update KPIs
    document.getElementById("kpiTotal").textContent = data.kpis.total_issues;
    document.getElementById("kpiResolved").textContent = data.kpis.resolved_issues;
    document.getElementById("kpiOpen").textContent = data.kpis.open_issues;
    document.getElementById("kpiRate").textContent = `${data.kpis.resolution_rate_percent}%`;
    document.getElementById("kpiSla").textContent = data.kpis.sla_breached;
    document.getElementById("kpiCritical").textContent = data.kpis.critical_active;

    // 2. Render Department League Table
    const tbody = document.getElementById("deptLeagueTbody");
    if (tbody && data.department_league) {
      tbody.innerHTML = data.department_league.map(d => `
        <tr>
          <td style="font-weight: 700;">${d.name} <span class="badge" style="background: #e2e8f0; font-size: 0.7rem;">${d.code}</span></td>
          <td>${d.total}</td>
          <td><span style="color: #16a34a; font-weight: 600;">${d.resolved}</span></td>
          <td><span style="color: #dc2626; font-weight: 600;">${d.open}</span></td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <div style="flex: 1; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
                <div style="width: ${d.rate_percent}%; height: 100%; background: #2563eb;"></div>
              </div>
              <span style="font-size: 0.82rem; font-weight: 700;">${d.rate_percent}%</span>
            </div>
          </td>
        </tr>
      `).join("");
    }
  } catch (e) {
    console.error("Failed to load admin metrics:", e);
  }
}

async function loadBroadcasts() {
  const container = document.getElementById("broadcastListContainer");
  if (!container) return;

  try {
    const notices = await ApiClient.getBroadcasts();
    if (!notices || notices.length === 0) {
      container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem;">No active maintenance announcements.</div>`;
      return;
    }

    container.innerHTML = notices.map(n => `
      <div style="background: #f8fafc; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.85rem 1rem; margin-bottom: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h4 style="font-size: 0.95rem; font-weight: 700; color: #1e3a8a;">📢 ${n.title}</h4>
          <p style="font-size: 0.85rem; color: var(--secondary); margin-top: 0.2rem;">${n.message}</p>
          <span style="font-size: 0.75rem; color: var(--text-muted);">Published: ${new Date(n.created_at).toLocaleString()}</span>
        </div>
      </div>
    `).join("");
  } catch (e) {
    console.error("Failed to load broadcasts:", e);
  }
}

async function handleCreateBroadcast(e) {
  e.preventDefault();
  const title = document.getElementById("bcTitle").value.trim();
  const message = document.getElementById("bcMessage").value.trim();

  try {
    await ApiClient.createBroadcast(title, message, "CAMPUS_WIDE");
    document.getElementById("createBroadcastForm").reset();
    alert("Campus-wide announcement broadcasted!");
    await loadBroadcasts();
  } catch (err) {
    alert("Broadcast error: " + err.message);
  }
}

async function openAuditModal() {
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
    alert("Failed to generate audit report: " + e.message);
  }
}

function closeAuditModal() {
  document.getElementById("auditModal").classList.remove("open");
}
