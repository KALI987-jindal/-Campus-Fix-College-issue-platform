/**
 * CampusFix Central API Client (Fetch API with JWT Bearer Token)
 */
const API_BASE_URL = "http://127.0.0.1:8000/api/v1";

class ApiClient {
  static getToken() {
    return localStorage.getItem("campus_fix_token");
  }

  static setToken(token) {
    localStorage.setItem("campus_fix_token", token);
  }

  static getUser() {
    const userStr = localStorage.getItem("campus_fix_user");
    return userStr ? JSON.parse(userStr) : null;
  }

  static setUser(user) {
    localStorage.setItem("campus_fix_user", JSON.stringify(user));
  }

  static logout() {
    localStorage.removeItem("campus_fix_token");
    localStorage.removeItem("campus_fix_user");
    window.location.href = "index.html";
  }

  static async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = this.getToken();

    const headers = {
      ...(options.headers || {})
    };

    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, { ...options, headers });

      if (response.status === 401) {
        // Token expired or invalid
        localStorage.removeItem("campus_fix_token");
        localStorage.removeItem("campus_fix_user");
        if (!window.location.pathname.endsWith("index.html")) {
          window.location.href = "index.html";
        }
        throw new Error("Session expired. Please log in again.");
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || "Something went wrong with the request");
      }

      return data;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err);
      throw err;
    }
  }

  // Auth Endpoints
  static async login(email, password) {
    const data = await this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    this.setToken(data.access_token);
    this.setUser(data);
    return data;
  }

  static async register(userData) {
    const data = await this.request("/auth/register", {
      method: "POST",
      body: JSON.stringify(userData)
    });
    this.setToken(data.access_token);
    this.setUser(data);
    return data;
  }

  static async getMe() {
    return this.request("/auth/me");
  }

  // Departments
  static async getDepartments() {
    return this.request("/departments");
  }

  static async getDepartmentStats(deptId) {
    return this.request(`/departments/${deptId}/stats`);
  }

  // Issues
  static async getIssues(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/issues${query ? `?${query}` : ""}`);
  }

  static async getIssueById(issueId) {
    return this.request(`/issues/${issueId}`);
  }

  static async createIssue(issueData) {
    return this.request("/issues", {
      method: "POST",
      body: JSON.stringify(issueData)
    });
  }

  static async toggleUpvote(issueId) {
    return this.request(`/issues/${issueId}/upvote`, {
      method: "POST"
    });
  }

  static async addComment(issueId, message, isStaffOnly = false) {
    return this.request(`/issues/${issueId}/comments`, {
      method: "POST",
      body: JSON.stringify({ message, is_staff_only_note: isStaffOnly })
    });
  }

  static async verifyIssue(issueId, action, starRating = null, feedback = null) {
    return this.request(`/issues/${issueId}/verify`, {
      method: "POST",
      body: JSON.stringify({ action, star_rating: starRating, feedback_comment: feedback })
    });
  }

  // Suggestions (Student Senate & Campus Improvements)
  static async getSuggestions(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/suggestions${query ? `?${query}` : ""}`);
  }

  static async createSuggestion(suggestionData) {
    return this.request("/suggestions", {
      method: "POST",
      body: JSON.stringify(suggestionData)
    });
  }

  static async toggleSuggestionUpvote(suggestionId) {
    return this.request(`/suggestions/${suggestionId}/upvote`, {
      method: "POST"
    });
  }

  // Staff / Supervisor / Technician Operations
  static async getTechnicians(trade = null) {
    const query = trade ? `?trade=${trade}` : "";
    return this.request(`/staff/technicians${query}`);
  }

  static async getMyTasks() {
    return this.request("/staff/my-tasks");
  }

  static async assignTicket(issueId, techId) {
    return this.request(`/staff/issues/${issueId}/assign`, {
      method: "PUT",
      body: JSON.stringify({ assigned_technician_id: techId })
    });
  }

  static async updateStatus(issueId, status, note = null) {
    return this.request(`/staff/issues/${issueId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status, resolution_note: note })
    });
  }

  static async uploadProof(issueId, photoUrl, note = null) {
    const formData = new FormData();
    formData.append("photo_url", photoUrl);
    formData.append("photo_type", "AFTER_FIX");
    if (note) formData.append("resolution_note", note);

    return this.request(`/staff/issues/${issueId}/proof`, {
      method: "POST",
      body: formData
    });
  }

  // Admin & Governance
  static async getAdminDashboard() {
    return this.request("/admin/dashboard");
  }

  static async getBroadcasts() {
    return this.request("/admin/broadcasts");
  }

  static async createBroadcast(title, message, scope = "CAMPUS_WIDE") {
    return this.request("/admin/broadcasts", {
      method: "POST",
      body: JSON.stringify({ title, message, scope })
    });
  }

  static async getAuditReport() {
    return this.request("/admin/audit-report");
  }
}
