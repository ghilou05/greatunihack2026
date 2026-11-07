# Frontend (Person 1 scope)
- Read ../docs/team-mvp-integration-plan.md §3, §3.5 and §5 before starting.
- Wireframe: ../docs/wireframe.png
- Shared types: src/lib/types.ts — do not change; tell the user if something is missing.
- Fixtures (fetch these at runtime):
  /documents/golden-demo.pdf, /fixtures/sample-document-index.json,
  /fixtures/sample-lesson-plan.json
- Do NOT edit components/voice/**, lib/lesson-orchestrator.ts,
  hooks/useLessonSession.ts (Person 3) or anything in ../backend.
- react-pdf must load client-side only (dynamic import, ssr: false).
- `npm run build` must pass before you finish. Small commits.