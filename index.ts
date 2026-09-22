/**
 * Root server entry for local-directory loading.
 *
 * When this package is referenced by directory path in `opencode.json(c)`
 * `plugins` (e.g. `"/abs/path/to/context-progress-bar"`), the host loads
 * `<dir>/index.{ts,js}` directly and does not consult `package.json`
 * `exports` — the same convention as the `notify`/`rtk` local plugins. The
 * npm route keeps using `exports["."]` → `./dist/index.js`. Both entries
 * define the same plugin; the host loads exactly one per package.
 */
export { default } from "./dist/index.js";
