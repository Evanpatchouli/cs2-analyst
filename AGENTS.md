# CS2 Coach

## Project Positioning

CS2 Coach is a Windows desktop application focused on CS2 DEM post-match analysis.

It does not include real-time overlays, GSI tracking, or unrelated platform features.

## Architecture Rules

- Desktop application: Electron + React + TypeScript
- UI system: Fluent UI v9 only
- Core capabilities are separated into packages:
  - dem-parser
  - match-model
  - analytics
  - findings

## Development Principles

- Keep product scope focused.
- Keep deterministic analysis separate from AI coaching.
- Evidence first: every coaching conclusion must reference measurable findings.
- Prefer small maintainable changes.
