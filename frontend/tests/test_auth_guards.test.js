/**
 * Automated Frontend Unit Tests for Admin and Technician Auth Guards
 * Run using: node --test frontend/tests/test_auth_guards.test.js
 */

const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// Mock Browser Environment
let mockLocalStorage = {};
let mockLocation = { href: "" };

global.localStorage = {
  getItem: (key) => mockLocalStorage[key] || null,
  setItem: (key, val) => { mockLocalStorage[key] = String(val); },
  removeItem: (key) => { delete mockLocalStorage[key]; },
  clear: () => { mockLocalStorage = {}; }
};

global.window = {
  location: mockLocation
};

// Mock ApiClient to use global localStorage
global.ApiClient = {
  getToken: () => global.localStorage.getItem("campus_fix_token"),
  getUser: () => {
    const s = global.localStorage.getItem("campus_fix_user");
    return s ? JSON.parse(s) : null;
  }
};

// Mock auth.js redirectToDashboard
global.redirectToDashboard = function (role) {
  switch (String(role).toUpperCase()) {
    case "STUDENT":
      window.location.href = "student-dashboard.html";
      break;
    case "TEACHER":
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
};

// Load Guard functions
const { checkAdminAuthGuard } = require("../js/admin.js");
const { checkTechnicianAuthGuard } = require("../js/staff.js");

function setSession(token, user) {
  if (token) {
    global.localStorage.setItem("campus_fix_token", token);
  } else {
    global.localStorage.removeItem("campus_fix_token");
  }
  if (user) {
    global.localStorage.setItem("campus_fix_user", JSON.stringify(user));
  } else {
    global.localStorage.removeItem("campus_fix_user");
  }
}

describe("Admin Dashboard Auth Guard (checkAdminAuthGuard)", () => {
  beforeEach(() => {
    mockLocalStorage = {};
    mockLocation.href = "";
  });

  test("Redirects unauthenticated user (no token or user) to index.html", () => {
    setSession(null, null);
    const allowed = checkAdminAuthGuard();
    assert.strictEqual(allowed, false);
    assert.strictEqual(mockLocation.href, "index.html");
  });

  test("Redirects unauthenticated user (token but missing user) to index.html", () => {
    setSession("jwt_mock_token", null);
    const allowed = checkAdminAuthGuard();
    assert.strictEqual(allowed, false);
    assert.strictEqual(mockLocation.href, "index.html");
  });

  test("Redirects STUDENT role to student-dashboard.html", () => {
    setSession("jwt_mock_token", { full_name: "Student", role: "STUDENT" });
    const allowed = checkAdminAuthGuard();
    assert.strictEqual(allowed, false);
    assert.strictEqual(mockLocation.href, "student-dashboard.html");
  });

  test("Redirects TEACHER role to teacher-dashboard.html", () => {
    setSession("jwt_mock_token", { full_name: "Teacher", role: "TEACHER" });
    const allowed = checkAdminAuthGuard();
    assert.strictEqual(allowed, false);
    assert.strictEqual(mockLocation.href, "teacher-dashboard.html");
  });

  test("Redirects TECHNICIAN role to technician-workboard.html", () => {
    setSession("jwt_mock_token", { full_name: "Plumber", role: "TECHNICIAN" });
    const allowed = checkAdminAuthGuard();
    assert.strictEqual(allowed, false);
    assert.strictEqual(mockLocation.href, "technician-workboard.html");
  });

  test("Allows ADMIN role without redirection", () => {
    setSession("jwt_mock_token", { full_name: "Dean Bawa", role: "ADMIN" });
    const allowed = checkAdminAuthGuard();
    assert.strictEqual(allowed, true);
    assert.strictEqual(mockLocation.href, "");
  });

  test("Allows HOD role without redirection", () => {
    setSession("jwt_mock_token", { full_name: "HOD CSE", role: "HOD" });
    const allowed = checkAdminAuthGuard();
    assert.strictEqual(allowed, true);
    assert.strictEqual(mockLocation.href, "");
  });

  test("Allows SUPERVISOR role without redirection", () => {
    setSession("jwt_mock_token", { full_name: "Supervisor", role: "SUPERVISOR" });
    const allowed = checkAdminAuthGuard();
    assert.strictEqual(allowed, true);
    assert.strictEqual(mockLocation.href, "");
  });

  test("Handles case-insensitive roles (e.g. lowercase 'admin')", () => {
    setSession("jwt_mock_token", { full_name: "Dean", role: "admin" });
    const allowed = checkAdminAuthGuard();
    assert.strictEqual(allowed, true);
    assert.strictEqual(mockLocation.href, "");
  });
});

describe("Technician Workboard Auth Guard (checkTechnicianAuthGuard)", () => {
  beforeEach(() => {
    mockLocalStorage = {};
    mockLocation.href = "";
  });

  test("Redirects unauthenticated user to index.html", () => {
    setSession(null, null);
    const allowed = checkTechnicianAuthGuard();
    assert.strictEqual(allowed, false);
    assert.strictEqual(mockLocation.href, "index.html");
  });

  test("Redirects STUDENT role to student-dashboard.html", () => {
    setSession("jwt_mock_token", { full_name: "Student", role: "STUDENT" });
    const allowed = checkTechnicianAuthGuard();
    assert.strictEqual(allowed, false);
    assert.strictEqual(mockLocation.href, "student-dashboard.html");
  });

  test("Redirects TEACHER role to teacher-dashboard.html", () => {
    setSession("jwt_mock_token", { full_name: "Teacher", role: "TEACHER" });
    const allowed = checkTechnicianAuthGuard();
    assert.strictEqual(allowed, false);
    assert.strictEqual(mockLocation.href, "teacher-dashboard.html");
  });

  test("Redirects HOD role to teacher-dashboard.html (HOD cannot access technician workboard)", () => {
    setSession("jwt_mock_token", { full_name: "HOD", role: "HOD" });
    const allowed = checkTechnicianAuthGuard();
    assert.strictEqual(allowed, false);
    assert.strictEqual(mockLocation.href, "teacher-dashboard.html");
  });

  test("Allows TECHNICIAN role without redirection", () => {
    setSession("jwt_mock_token", { full_name: "Tech Worker", role: "TECHNICIAN" });
    const allowed = checkTechnicianAuthGuard();
    assert.strictEqual(allowed, true);
    assert.strictEqual(mockLocation.href, "");
  });

  test("Allows SUPERVISOR role without redirection", () => {
    setSession("jwt_mock_token", { full_name: "Supervisor", role: "SUPERVISOR" });
    const allowed = checkTechnicianAuthGuard();
    assert.strictEqual(allowed, true);
    assert.strictEqual(mockLocation.href, "");
  });

  test("Allows ADMIN role without redirection", () => {
    setSession("jwt_mock_token", { full_name: "Admin", role: "ADMIN" });
    const allowed = checkTechnicianAuthGuard();
    assert.strictEqual(allowed, true);
    assert.strictEqual(mockLocation.href, "");
  });

  test("Handles case-insensitive roles (e.g. lowercase 'technician')", () => {
    setSession("jwt_mock_token", { full_name: "Tech", role: "technician" });
    const allowed = checkTechnicianAuthGuard();
    assert.strictEqual(allowed, true);
    assert.strictEqual(mockLocation.href, "");
  });
});

describe("HTML Inline Early Head Guards", () => {
  test("admin-dashboard.html includes inline head script checking allowed roles", () => {
    const htmlPath = path.resolve(__dirname, "../admin-dashboard.html");
    const html = fs.readFileSync(htmlPath, "utf8");
    assert.ok(html.includes("allowedRoles = [\"ADMIN\", \"HOD\", \"SUPERVISOR\"]"));
    assert.ok(html.includes("window.location.replace(\"index.html\")"));
  });

  test("technician-workboard.html includes inline head script checking allowed roles", () => {
    const htmlPath = path.resolve(__dirname, "../technician-workboard.html");
    const html = fs.readFileSync(htmlPath, "utf8");
    assert.ok(html.includes("allowedRoles = [\"TECHNICIAN\", \"SUPERVISOR\", \"ADMIN\"]"));
    assert.ok(html.includes("window.location.replace(\"index.html\")"));
  });
});

