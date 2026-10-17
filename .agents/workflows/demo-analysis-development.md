# Demo Analysis Development Workflow

1. Read `docs/demo-fixtures.md` before selecting real DEM inputs.
2. For new development phases, use only map-only local fixtures such as `.demo/dust2.dem`, `.demo/nuke.dem`, or `.demo/mirage.dem`, plus `.demo/demo1.dem`, `.demo/demo2.dem`, and `.demo/demo.dem`.
3. Do not use match-named DEM files or legacy `.demo/demo3.dem` for P7+ validation. Historical reports may preserve their old results, but they are not current-stage test evidence.
4. If the retained Dust2 sample has an old match-specific filename, rename it locally to `.demo/dust2.dem` without modifying its bytes; verify SHA-256 when needed.
5. DEM files are local-only: do not commit, copy into the repository, or download replacements.
6. Confirm DEM data availability and inspect the existing parser path before changing adapters.
7. Update parser adapters only when required by verified evidence.
8. Update match-model contracts when the domain semantics require it.
9. Implement deterministic analytics separately from presentation and AI explanation.
10. Add findings rules only when supported by explicit evidence and the applicable rule-design workflow.
11. Validate with allowed real DEM samples and synthetic boundary cases; never present synthetic results as real-data validation.
12. Report the exact fixture filename, SHA-256 when relevant, commands, results, unexecuted checks, and remaining limitations.
