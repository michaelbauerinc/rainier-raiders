# Design principles

Build elegant, simple pieces that compose into powerful workflows. Keep the whole
system easy to understand, change, and operate.

- Solve the current problem with the smallest coherent change. Avoid speculative
  abstractions, extra services, dependencies, configuration, and empty scaffolding.
- Prefer explicit data flow, clear names, and small cohesive modules. Extract shared
  patterns when real repetition or multiple consumers justify them.
- Follow existing repository conventions. Applications belong in `apps/`, application
  Helm charts in `infra/helm/`, and local development starts from the root Makefile
  and Docker Compose. Use the shared pnpm workspace and lockfile.
- Keep authorization and validation beside protected data and mutations. Protect
  secrets and preserve data without turning routine work into ceremony.
- Test meaningful behavior and risky boundaries. Favor focused checks for permissions,
  persistence, concurrency, and regressions; avoid tests that repeat implementation
  details, unnecessary mocks, exhaustive low-value cases, or repeated checks without
  a new reason. Use judgment for small reversible changes.
- Preserve the intended visual design and accessibility. Keep product copy direct;
  avoid generic marketing filler and exposing implementation details in normal flows.
- Keep documentation minimal: a short root README for the purpose and quick start.
  Add comments only where they explain a non-obvious decision.
- Read the relevant version-matched Next.js guidance under
  `apps/website/node_modules/next/dist/docs/` before changing framework behavior.
- Keep changes scoped, remove obsolete code, and explain material tradeoffs plainly.
  Prefer a working vertical slice over layers of future architecture.
