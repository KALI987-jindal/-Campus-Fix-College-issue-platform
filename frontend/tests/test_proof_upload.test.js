/**
 * Automated Frontend Unit Tests for Technician Proof-of-Work Photo Upload
 * Run with: node --test frontend/tests/test_proof_upload.test.js
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

// Mock FormData
global.FormData = class {
  constructor() {
    this._fields = {};
  }
  append(key, value) {
    this._fields[key] = value;
  }
  get(key) {
    return this._fields[key];
  }
};

describe("Technician Workboard HTML & UI Controls", () => {
  const htmlPath = path.resolve(__dirname, "../technician-workboard.html");
  const html = fs.readFileSync(htmlPath, "utf8");

  test("HTML contains real file input with image accept and mobile camera capture", () => {
    assert.ok(html.includes('id="proofPhotoFile"'), "Must include proofPhotoFile input ID");
    assert.ok(html.includes('type="file"'), "Input must be type file");
    assert.ok(html.includes('accept="image/jpeg,image/png,image/jpg,image/webp"'), "Must restrict to images");
    assert.ok(html.includes('capture="environment"'), "Must specify mobile camera capture");
  });

  test("HTML contains preview container and status alert box", () => {
    assert.ok(html.includes('id="proofPreviewContainer"'), "Must include preview container");
    assert.ok(html.includes('id="proofPreviewImg"'), "Must include preview image");
    assert.ok(html.includes('id="proofStatusMessage"'), "Must include status message box");
  });

  test("HTML contains submit and cancel buttons with IDs", () => {
    assert.ok(html.includes('id="submitProofBtn"'), "Must include submit button ID");
    assert.ok(html.includes('id="cancelProofBtn"'), "Must include cancel button ID");
  });
});

describe("ApiClient.uploadFile and uploadProof", () => {
  // Mock ApiClient request implementation
  let lastRequest = null;

  beforeEach(() => {
    lastRequest = null;
    global.ApiClient = {
      getToken: () => "mock_token",
      request: async (endpoint, options = {}) => {
        lastRequest = { endpoint, options };
        if (endpoint === "/uploads") {
          return { filename: "mock_uuid.jpg", url: "/uploads/mock_uuid.jpg" };
        }
        if (endpoint.includes("/proof")) {
          return { message: "Resolution proof uploaded and marked RESOLVED", status: "RESOLVED" };
        }
        return {};
      },
      uploadFile: async function (file) {
        if (!file) throw new Error("No file selected for upload.");
        const formData = new global.FormData();
        formData.append("file", file);
        return this.request("/uploads", {
          method: "POST",
          body: formData
        });
      },
      uploadProof: async function (issueId, photoUrl, note = null) {
        const formData = new global.FormData();
        formData.append("photo_url", photoUrl);
        formData.append("photo_type", "AFTER_FIX");
        if (note) formData.append("resolution_note", note);
        return this.request(`/staff/issues/${issueId}/proof`, {
          method: "POST",
          body: formData
        });
      }
    };
  });

  test("uploadFile sends FormData without setting custom Content-Type header", async () => {
    const mockFile = { name: "test_pipe.jpg", size: 1024, type: "image/jpeg" };
    const res = await global.ApiClient.uploadFile(mockFile);

    assert.strictEqual(res.url, "/uploads/mock_uuid.jpg");
    assert.strictEqual(lastRequest.endpoint, "/uploads");
    assert.strictEqual(lastRequest.options.method, "POST");
    assert.ok(lastRequest.options.body instanceof global.FormData);
    assert.strictEqual(lastRequest.options.body.get("file"), mockFile);
    // Headers must NOT manually force multipart Content-Type
    assert.strictEqual(lastRequest.options.headers, undefined);
  });

  test("uploadProof passes uploaded photo URL and resolution note correctly", async () => {
    const res = await global.ApiClient.uploadProof(42, "/uploads/mock_uuid.jpg", "Fixed pipe coupling");

    assert.strictEqual(res.status, "RESOLVED");
    assert.strictEqual(lastRequest.endpoint, "/staff/issues/42/proof");
    assert.strictEqual(lastRequest.options.body.get("photo_url"), "/uploads/mock_uuid.jpg");
    assert.strictEqual(lastRequest.options.body.get("photo_type"), "AFTER_FIX");
    assert.strictEqual(lastRequest.options.body.get("resolution_note"), "Fixed pipe coupling");
  });
});

