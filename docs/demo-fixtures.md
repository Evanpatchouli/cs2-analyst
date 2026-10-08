# Demo fixture matrix

Map-only names identify local fixtures; renaming does not change DEM bytes. No DEM is tracked, copied or downloaded by this migration.

| Role | Local file | Required scope |
| --- | --- | --- |
| Primary Deep Review | `.demo/nuke.dem` | P5.7 core gate |
| Core cross-map | `.demo/inferno.dem`, `.demo/dust2.dem` | P5.7 core gate |
| Findings sanity | `.demo/mirage.dem` | P5.7.7 core gate |
| Extended compatibility | `.demo/ancient.dem`, `.demo/anubis.dem`, `.demo/overpass.dem` | Optional; not mandatory acceptance gates |
| Excluded / Not Required | `.demo/train.dem` | **REMOVED / NOT REQUIRED** |
| Personal compatibility | `.demo/demo1.dem`, `.demo/demo2.dem`, `.demo/demo3.dem` | Product Owner-confirmed personal fixtures; compatibility gate **FAIL** (demo2) |

Train is retained locally only. Its professional sample is stale and insufficiently compatible with current CS2; high-quality current competitive samples are difficult to obtain. Historical-version compatibility noise is not introduced for map coverage. Train is neither a P5.7 nor a v0.1 Final Acceptance gate, debt or blocker; do not run it or add tests.

The professional core is Nuke + Inferno + Dust2 + Mirage. Passing it establishes current professional GOTV cross-map compatibility only. The exact `demo1.dem` is present; unchanged historical golden tests PASS.

Locked SHA-256 identities, verified during the rename migration:

- Nuke: `dea9382b9cc263fed9ee4ed7e71fa6be8c176cf888868f05b26d850af6f5cb3c`
- Inferno: `b61c040074f84f1f2c1b683642923243dbe123c2a0c70ed3c0670b0e4cd7a265`
- Dust2: `db90fe85aab023a1d2c8a5996182e6120d98ef494f02a070b17982b235e4958c`

Mirage first Findings V2 identity: `62cb3af35c3893a91c7dd8c9007fdb1105950ec8963a46eca6006dac96655acb`, header/domain map `de_mirage`, 296074918 bytes, 64 tick/s, 17 rounds, 10 players. Only filename + SHA + map are locked; counts are observations. Scores, winners, player names and finding counts are not fixture identity.

During P5.7.7, `demo1.dem` is present again; its existing historical goldens run. The Product Owner has now explicitly confirmed all three personal fixtures. This is human provenance evidence, separate from raw header recording metadata.

Identity hashes and acceptance-only target nicknames: [manifest](./deep-review-personal-fixtures.json). Personal fixtures validate target-user compatibility; professional fixtures validate cross-map/complex scenarios. Personal gate evidence: [report](./deep-review-personal-acceptance.md).
