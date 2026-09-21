/**
 * One-command local demo: migrate, seed the synthetic cohort, and print the walkthrough.
 *
 * Usage: npm run demo:up
 * Then in separate terminals: npm run dev:api, npm run dev:kiosk, npm run dev:console.
 * Everything here is synthetic; no credentials, no network, no real patient data.
 */

import { spawnSync } from "node:child_process";

function run(label, command, args) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    process.stderr.write(`demo:up failed at "${label}".\n`);
    process.exit(result.status ?? 1);
  }
}

run("migrate", "npm", ["run", "db:migrate", "--workspace", "@medikiosk/api"]);
run("seed demo cohort", "npm", [
  "run",
  "db:seed",
  "--workspace",
  "@medikiosk/api",
  "--",
  "--profile",
  "demo",
]);

process.stdout.write(`
MediKiosk demo database is ready.

  1. API      npm run dev:api        http://127.0.0.1:8080
  2. Kiosk    npm run dev:kiosk      http://127.0.0.1:5173
  3. Console  npm run dev:console    http://127.0.0.1:5174

Kiosk device credentials and demo logins are printed by the seed step above.
See docs/DEMO_SCRIPT.md for the 5-minute walkthrough.
`);
