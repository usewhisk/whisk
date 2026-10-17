---
date: 2026-10-17
feature: Vite examples build again, and CI builds every example
scope: fix
scenario-impact: none
---

# Vite examples build again

`examples/donate-button` and `examples/payroll-batch` failed to build after
`@vitejs/plugin-react` moved to 6.1.2. That release imports `vite/internal`, which only
vite 8 exports, and both examples run vite 6. They now use `@vitejs/plugin-react`
^5.2.0, which supports vite 4 through 8.

CI did not catch it because `build:apps` built only the playground. It now builds every
example, so a dependency bump that breaks one fails the pull request.

Also in this change:

- Dependabot no longer proposes `@vitejs/plugin-react` majors until the examples move
  to vite 8.
- The three remaining Next.js examples set `outputFileTracingRoot`, as the playground
  already does, so builds from a worktree pick the right workspace root.

Known: both Vite examples bundle the whole wallet stack into one 2.35 MB chunk, and
vite warns about it. That is tracked for Phase 1, which rebuilds the examples.
