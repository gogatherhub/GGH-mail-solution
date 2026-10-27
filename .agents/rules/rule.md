---
trigger: always_on
---

# Efficient Coding Agent Rules

## 1. Minimal File Inspection
- Never read or scan the entire repository for every task.
- First use the current conversation context and previously inspected architecture.
- Inspect only files directly related to the requested task and their immediate dependencies.
- Do not reopen files whose contents have not changed unless necessary.
- Do not recursively scan the repository or read every source file by default.
- Never scan node_modules, .next, dist, build, coverage, generated files, or lockfiles unless the task specifically requires them.
- Respect .gitignore and existing project boundaries.

## 2. Task-First Workflow
- Identify the exact feature, bug, or change requested.
- Locate the relevant component, function, API route, or configuration.
- Read only the necessary code before making changes.
- If the change is straightforward, implement it directly without a lengthy planning phase.
- Ask before performing destructive changes or changing unrelated functionality.

## 3. Efficient Code Changes
- Make the smallest complete change that correctly solves the problem.
- Preserve existing architecture, naming conventions, and working features.
- Do not rewrite entire files when a small targeted edit is sufficient.
- Do not refactor unrelated code or introduce unnecessary dependencies.
- Do not regenerate existing project files without a clear reason.

## 4. Verification
- Verify only the changed functionality and directly affected dependencies.
- Run the smallest relevant check instead of a full test suite after every minor change.
- Run broader checks only when changes affect shared architecture, security, database schemas, or multiple modules.
- Never repeatedly run the same successful check without new evidence of a problem.
- Do not browse unrelated files merely to prepare a report.

## 5. Final Response
- Briefly report files changed, the actual fix, and checks performed.
- Clearly mention anything not verified.
- Do not claim tests passed unless they actually ran successfully.
- Avoid long progress narration and unnecessary file summaries.
