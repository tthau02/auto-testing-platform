# Project Instructions

## Project Overview

This repository is a local-first TypeScript monorepo for configuration-driven UI, API, and visual regression testing. It uses npm workspaces, Playwright, Zod, Express, React, and Vite.

## Repository Map

- `apps/dashboard`: React and Vite user interface.
- `apps/local-service`: Local Express API, run process management, and SSE events.
- `packages/test-case-schema`: Zod schemas and inferred TypeScript types.
- `packages/project-config`: Project configuration, test discovery, variable interpolation, and path/host checks.
- `packages/test-engine`: CLI, orchestration, and UI/API/visual runners.
- `packages/report-engine`: JSON, Markdown, and JUnit report generation.
- `projects/`: Configured test projects and their test cases, baselines, and reports.
- `templates/`: Example project and test case JSON.

## Working Conventions

- Keep changes aligned with the existing TypeScript, ESM, npm workspace, and Zod patterns.
- Treat JSON test cases and `project.config.json` as validated input. Update the relevant schema and examples when changing their supported shape.
- Keep project-specific URLs, locators, credentials, and test behavior in project configuration or test case data rather than hardcoding them into shared runners.
- Preserve the local-only service binding and validate project-controlled paths and target hosts at trust boundaries.
- Never add real credentials or secrets to source, fixtures, reports, or documentation. Use environment variables and `{{VARIABLE_NAME}}` interpolation for runtime values.
- Keep README and templates consistent with actual scripts, directories, ports, and supported behavior.
- Avoid unrelated formatting or refactoring when making a focused change.
- Do not run builds or tests unless the user asks for verification.

## Useful Commands

- `npm run dev`: Start the local service and dashboard.
- `npm run dev:service`: Start only the local service.
- `npm run dev:dashboard`: Start only the dashboard.
- `npm run test:cli -- --project=<project-id>`: Run configured tests for a project.
- `npm run build`: Build workspaces that define a build script.

The checked-in project ID is `hrm-enterprise`. The local service uses `127.0.0.1:4000`, and the dashboard uses port `5174`. No demo target application is included in this repository.
