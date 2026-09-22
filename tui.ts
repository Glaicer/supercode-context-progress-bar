/**
 * Root TUI entry for local-directory loading.
 *
 * When this package is referenced by directory path, the host loads
 * `<dir>/tui.{ts,js}` as the TUI entrypoint directly (same convention as
 * `<dir>/index.{ts,js}` for the server side) and does not consult
 * `package.json` `exports`. The npm route keeps using `exports["./tui"]`.
 * Both entries point at the same built file.
 */
export { default } from "./dist/context-bar.js";
