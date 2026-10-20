---
name: test-case-authoring
description: Create or update project configuration and JSON UI, API, or visual test cases for this Playwright automation platform. Use when adding test cases, configuring a project, or diagnosing schema validation failures.
---

# Test Case Authoring

Use this skill when editing `projects/<project-id>/` test data or `project.config.json`.

## Workflow

1. Read the target project's `project.config.json` and inspect nearby test cases of the same type.
2. Check the authoritative schemas in `packages/test-case-schema/src/` before choosing fields or actions.
3. Keep test case IDs unique within the project and use descriptive names and tags.
4. Put cases under a directory listed in the project's `testDirectories`. Test discovery is recursive and reads JSON files from those configured directories.
5. Use `{{VARIABLE_NAME}}` for values supplied by project variables or environment variables. Do not commit credentials.
6. Keep URLs relative to the configured base URL when practical; configured target hosts must satisfy the project's allowlist.
7. For visual cases, check existing baselines and the visual runner's baseline path and naming behavior before adding or changing snapshots.
8. Update a matching template or README example if the supported authoring contract changes.

## Test Types

- **UI**: `type: "ui"`, a required `startUrl`, and typed sequential `steps`. Locators use the target forms supported by `TargetLocatorSchema`.
- **API**: `type: "api"` and required `steps` containing an HTTP method, endpoint, and optional request details, extractions, and assertions.
- **Visual**: `type: "visual"`, a URL, snapshot name, optional viewports and masks, and a threshold between `0` and `1`.

The schemas in source are authoritative. Do not assume README examples support fields or actions that the schemas do not define.

## Project Configuration

Project configuration controls `baseUrl`, optional `apiBaseUrl`, environment overrides, test directories, feature flags, timeouts, variables, viewports, and host security. Ensure any added test directory is included in `testDirectories`. The current `hrm-enterprise` project enables UI and visual testing; it does not currently configure API cases.
