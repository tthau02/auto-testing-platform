# 🚀 Dynamic Auto Testing Platform

> **Local-first, Multi-Project Dynamic Test Automation Platform** built with **TypeScript**, **Playwright**, **Node.js**, and **React (Ant Design)**.  
> Test UI, REST APIs, and Visual Regression across any number of projects simply by configuring JSON — **no engine re-coding needed**.

---

## 🌟 Key Features

- **Dynamic Multi-Project Architecture**: Register and test multiple applications simply via `project.config.json`. Zero hardcoded URLs, locators, or business logic.
- **Dynamic Playwright UI Engine**: Automated browser testing with robust locator resolution (`role`, `label`, `placeholder`, `testId`, `text`, CSS), automatic failure screenshot capture, and video recording.
- **Dynamic REST API Runner**: Tests HTTP methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`), measures latency, asserts status/body/headers/schema, and supports dynamic variable extraction between steps (`{{TOKEN}}`).
- **Visual Regression Engine**: Snapshot baseline comparison using `pixelmatch` & `pngjs` with configurable threshold and automated visual diff generation.
- **Zero-Database Reports Engine**: Every test run generates an isolated timestamped directory with:
  - `results.json`: Machine-readable structured execution data for dashboard and tooling.
  - `report.md`: Beautiful human-readable Markdown summary with tables, error breakdown, and reproduction commands.
  - `junit.xml`: Standard JUnit report for seamless CI/CD integration (GitHub Actions, Jenkins, GitLab).
  - `screenshots/` & `diff/`: Full failure screenshots and pixel diff evidence.
- **Real-Time Interactive QA Studio**:
  - React + Ant Design Dark Luxury UI.
  - Background process execution (Node.js child worker) with Server-Sent Events (SSE) streaming live logs and step-by-step progress. **Never freezes the UI**.
  - OpenAPI / Swagger importer to automatically generate API test cases.
- **CI/CD Ready**: Native CLI runner returning accurate exit codes (`0` for PASS, `1` for FAIL).

---

## 🏗️ Repository Architecture

```text
auto-testing-platform/
├── apps/
│   ├── dashboard/          # React, Vite, Ant Design QA Studio Web UI
│   ├── local-service/      # Node.js 127.0.0.1 service, process management, SSE streaming
│   └── demo-target/        # Built-in mock Web Portal & REST API server (port 3000)
├── packages/
│   ├── test-case-schema/   # Zod runtime schemas & TypeScript types (UI, API, Visual, Result)
│   ├── project-config/     # Config loader, variable interpolation, path traversal & host security
│   ├── test-engine/        # Dynamic UI, API, Visual Playwright runners & CLI tool
│   └── report-engine/      # Structured results aggregator, Markdown & JUnit XML generator
├── projects/
│   ├── hrm/                # Demo HRM System project config, test-cases, and reports
│   └── ecommerce/          # Demo E-Commerce Storefront project config & test-cases
├── templates/
│   ├── project.config.example.json
│   ├── ui-test.example.json
│   ├── api-test.example.json
│   └── visual-test.example.json
├── .github/workflows/
│   └── test.yml            # Sample CI/CD pipeline
├── package.json
└── README.md
```

---

## 🚀 Quick Start

### 1. Installation

Ensure Node.js (v18+) is installed, then run:

```bash
# Install dependencies across all monorepo packages
npm install

# Install Playwright browser binaries (Chromium)
npx playwright install chromium
```

### 2. Launch Local Studio

Start all services (Demo Target on `:3000`, Local Service on `:4000`, Dashboard on `:5173`):

```bash
npm run dev
```

Open your browser at:
- **QA Studio Dashboard**: [http://localhost:5173](http://localhost:5173)
- **Demo Target Portal**: [http://localhost:3000](http://localhost:3000)
- **Local Service API**: [http://127.0.0.1:4000/api/health](http://127.0.0.1:4000/api/health)

---

## 💻 CLI & CI/CD Usage

You can run test suites directly via the command line without opening the dashboard:

```bash
# Run all tests for the HRM project
npm run test:cli -- --project=hrm

# Run only API tests
npm run test:cli -- --project=hrm --type=api

# Run only UI tests with headed browser
npm run test:cli -- --project=hrm --type=ui --headed

# Run a specific test case by ID
npm run test:cli -- --project=hrm --test=UI_LOGIN_001

# Run with environment override
npm run test:cli -- --project=hrm --env=staging
```

### Exit Codes
- `0`: All tests passed.
- `1`: One or more tests failed or encountered execution errors.

---

## 📁 Adding a New Project (Zero Engine Modification)

To add any new application or website for automated testing:

1. Create a directory in `projects/<your-project-id>/`:
   ```bash
   mkdir -p projects/my-app/test-cases/ui
   mkdir -p projects/my-app/test-cases/api
   mkdir -p projects/my-app/reports
   ```

2. Add `project.config.json`:
   ```json
   {
     "id": "my-app",
     "name": "My Custom Application",
     "baseUrl": "http://localhost:8080",
     "apiBaseUrl": "http://localhost:8080",
     "environment": "local",
     "testDirectories": [
       "test-cases/ui",
       "test-cases/api"
     ],
     "features": {
       "uiTesting": true,
       "apiTesting": true,
       "visualTesting": true
     },
     "security": {
       "allowlistHosts": ["localhost", "127.0.0.1"]
     }
   }
   ```

3. Add your JSON test cases into `projects/my-app/test-cases/` and run!

---

## 📝 Test Case Schemas

### 1. UI Test Case (`type: "ui"`)

```json
{
  "id": "UI_LOGIN_001",
  "name": "Login with valid credentials",
  "type": "ui",
  "startUrl": "/login",
  "steps": [
    {
      "action": "fill",
      "target": { "placeholder": "Enter your username" },
      "value": "{{TEST_USERNAME}}"
    },
    {
      "action": "fill",
      "target": { "placeholder": "Enter your password" },
      "value": "{{TEST_PASSWORD}}"
    },
    {
      "action": "click",
      "target": { "role": "button", "name": "Login" }
    },
    {
      "action": "assertUrl",
      "expected": "**/dashboard"
    }
  ]
}
```

**Supported UI Actions**:
- `goto`, `click`, `fill`, `selectOption`, `check`, `uncheck`, `press`, `hover`, `waitForVisible`, `waitForTimeout`, `assertVisible`, `assertNotVisible`, `assertText`, `assertUrl`, `assertTitle`, `assertValue`, `assertEnabled`, `screenshot`.

---

### 2. API Test Case (`type: "api"`)

```json
{
  "id": "API_AUTH_AND_PRODUCTS_001",
  "name": "Auth and Fetch Products Flow",
  "type": "api",
  "steps": [
    {
      "name": "Login via POST /api/auth/login",
      "method": "POST",
      "endpoint": "/api/auth/login",
      "body": {
        "username": "{{TEST_USERNAME}}",
        "password": "{{TEST_PASSWORD}}"
      },
      "extractVariables": [
        { "name": "AUTH_TOKEN", "path": "token" }
      ],
      "assertions": [
        { "type": "status", "expected": 200 },
        { "type": "responseTime", "maxMs": 2000 }
      ]
    },
    {
      "name": "Query Products with Bearer Token",
      "method": "GET",
      "endpoint": "/api/products",
      "headers": {
        "Authorization": "Bearer {{AUTH_TOKEN}}"
      },
      "assertions": [
        { "type": "status", "expected": 200 },
        { "type": "fieldType", "path": "", "expected": "array" }
      ]
    }
  ]
}
```

---

### 3. Visual Test Case (`type: "visual"`)

```json
{
  "id": "VISUAL_LOGIN_001",
  "name": "Login Screen Visual Regression",
  "type": "visual",
  "url": "/login",
  "snapshotName": "hrm_login_page",
  "threshold": 0.05,
  "fullPage": true,
  "viewports": [
    { "name": "desktop", "width": 1280, "height": 720 }
  ]
}
```

---

## 🔒 Security & Safe Execution

- **Strict Host Allowlist**: Prevents tests from navigating to or querying unapproved external hosts.
- **Path Traversal Protection**: All paths resolving reports, baselines, and test files are validated against base boundaries to prevent `../` directory escapes.
- **Sensitive Data Masking**: Tokens, passwords, and secret headers are automatically masked in results and markdown reports.
- **No Direct Arbitrary Eval**: Test steps are parsed via Zod schema and dispatched through strictly typed Playwright API methods.
