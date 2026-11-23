/**
 * Unit tests for Supervisor & Technician Workboard Card Rendering and Action Permissions
 * Run using: node --test frontend/tests/test_staff_workboard.test.js
 */

const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");

// Mock Browser Environment
let mockLocalStorage = {};

global.localStorage = {
  getItem: (key) => mockLocalStorage[key] || null,
  setItem: (key, val) => { mockLocalStorage[key] = String(val); },
  removeItem: (key) => { delete mockLocalStorage[key]; },
  clear: () => { mockLocalStorage = {}; }
};

global.window = {};

global.ApiClient = {
  getUser: () => {
    const s = global.localStorage.getItem("campus_fix_user");
    return s ? JSON.parse(s) : null;
  }
};

const { renderTaskCard } = require("../js/staff.js");

describe("Supervisor & Technician Workboard Card Permissions", () => {
  beforeEach(() => {
    global.localStorage.clear();
  });

  const submittedTask = {
    id: 101,
    title: "Leaking Faucet in Lab A",
    description: "Cold water tap cannot be turned off",
    priority: "HIGH",
    status: "SUBMITTED",
    academic_department_name: "Engineering & Technology",
    location_room_or_block: "Block B, Room 204",
    service_trade: "PLUMBING",
    assigned_technician_id: null,
    assigned_technician_name: null,
  };

  const assignedTask = {
    id: 102,
    title: "Broken Bench in Room 101",
    description: "Wood frame snapped",
    priority: "MEDIUM",
    status: "ASSIGNED",
    academic_department_name: "Engineering & Technology",
    location_room_or_block: "Block A, Room 101",
    service_trade: "CARPENTRY",
    assigned_technician_id: 42,
    assigned_technician_name: "Ramesh Sharma",
  };

  const inProgressTask = {
    id: 103,
    title: "Faulty Projector Cable",
    description: "HDMI port disconnected",
    priority: "LECTURE_CRITICAL",
    status: "IN_PROGRESS",
    academic_department_name: "Engineering & Technology",
    location_room_or_block: "Auditorium",
    service_trade: "ELECTRICAL",
    assigned_technician_id: 42,
    assigned_technician_name: "Ramesh Sharma",
  };

  test("1. SUBMITTED ticket viewed by Supervisor shows only dispatch dropdown & button, NO Start Work", () => {
    global.localStorage.setItem("campus_fix_user", JSON.stringify({
      user_id: 10,
      full_name: "Er. Satish Sharma",
      role: "SUPERVISOR"
    }));

    const html = renderTaskCard(submittedTask);

    assert.ok(html.includes("Dispatch Ground Worker:"), "Must include dispatch dropdown section");
    assert.ok(html.includes("Dispatch Order"), "Must include Dispatch Order button");
    assert.ok(!html.includes("Start Work"), "Must NOT include Start Work button on unassigned ticket");
    assert.ok(html.includes("Awaiting Dispatch"), "Worker status must be Awaiting Dispatch");
  });

  test("2. SUBMITTED ticket viewed by Technician hides dispatch dropdown and hides Start Work", () => {
    global.localStorage.setItem("campus_fix_user", JSON.stringify({
      user_id: 42,
      full_name: "Ramesh Sharma",
      role: "TECHNICIAN",
      trade_specialty: "PLUMBING"
    }));

    const html = renderTaskCard(submittedTask);

    assert.ok(!html.includes("Dispatch Ground Worker:"), "Technician must not see dispatch controls");
    assert.ok(!html.includes("Dispatch Order"), "Technician must not see dispatch button");
    assert.ok(!html.includes("Start Work"), "Start Work must NOT appear before technician is assigned");
    assert.ok(html.includes("Awaiting Dispatch"), "Worker status must be Awaiting Dispatch");
  });

  test("3. ASSIGNED ticket viewed by Supervisor shows assigned technician details, NO Start Work button", () => {
    global.localStorage.setItem("campus_fix_user", JSON.stringify({
      user_id: 10,
      full_name: "Er. Satish Sharma",
      role: "SUPERVISOR"
    }));

    const html = renderTaskCard(assignedTask);

    assert.ok(!html.includes("Dispatch Ground Worker:"), "Must not show unassigned dispatch controls");
    assert.ok(html.includes("Ramesh Sharma"), "Must display assigned technician name");
    assert.ok(html.includes("ASSIGNED"), "Must display ASSIGNED status badge");
    assert.ok(!html.includes("Start Work"), "Supervisor must NEVER see Start Work button");
  });

  test("4. ASSIGNED ticket viewed by Assigned Technician shows Start Work button", () => {
    global.localStorage.setItem("campus_fix_user", JSON.stringify({
      user_id: 42,
      full_name: "Ramesh Sharma",
      role: "TECHNICIAN"
    }));

    const html = renderTaskCard(assignedTask);

    assert.ok(html.includes("Start Work"), "Assigned technician MUST see Start Work button");
    assert.ok(html.includes("Ramesh Sharma (You)"), "Assigned technician must see (You) identifier");
    assert.ok(html.includes("ASSIGNED"), "Must display ASSIGNED status badge");
  });

  test("5. ASSIGNED ticket viewed by a Different Technician hides Start Work button", () => {
    global.localStorage.setItem("campus_fix_user", JSON.stringify({
      user_id: 99,
      full_name: "Other Tech",
      role: "TECHNICIAN"
    }));

    const html = renderTaskCard(assignedTask);

    assert.ok(!html.includes("Start Work"), "Other technicians must NOT see Start Work button");
    assert.ok(!html.includes("(You)"), "Other technicians must not be marked as assigned");
    assert.ok(html.includes("Ramesh Sharma"), "Must display the true assigned technician's name");
  });

  test("6. IN_PROGRESS ticket shows Upload Fix Photo button to assigned technician", () => {
    global.localStorage.setItem("campus_fix_user", JSON.stringify({
      user_id: 42,
      full_name: "Ramesh Sharma",
      role: "TECHNICIAN"
    }));

    const html = renderTaskCard(inProgressTask);

    assert.ok(html.includes("Upload Fix Photo &amp; Complete"), "Must include proof upload button");
    assert.ok(!html.includes("Start Work"), "Must not show Start Work once already in progress");
    assert.ok(html.includes("IN_PROGRESS"), "Must display IN_PROGRESS status badge");
  });
});

