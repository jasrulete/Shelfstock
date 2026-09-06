# Owner's runbook

The five things only you can do, in the order that works, with what "done"
looks like for each. Written 2026-09-06 from the repos as they stood:
Shelfstock `main` at the merge of #42, companion `main` at the merge of #16,
Shelfstock #41 open and held. Every command was checked against the code,
the tools' own help, or run here; where something could not be verified it
says so.

| # | Task | Time | Depends on |
|---|---|---|---|
| 1 | [Run the production migration, then merge #41](#1-run-the-production-migration-then-merge-41) | 30 min | nothing |
| 2 | [Link the companion to EAS and build the APK](#2-link-the-companion-to-eas-and-build-the-apk) | 1–2 h, mostly waiting | nothing |
| 3 | [Verify the companion on a real phone](#3-verify-the-companion-on-a-real-phone) | 1–2 h | 1 (for the relaunch test), 2 (for push) |
| 4 | [Screenshots and the scan GIF](#4-screenshots-and-the-scan-gif) | 1 h | 2 (for the push shot) |
| 5 | [Promote the CSP](#5-promote-the-csp) | a day of waiting, then 30 min | nothing |

After each task there is a line saying what the agent can take over from
there; say the word and it does that part.

## 0. Before you start

- **Terminal.** Everything below is PowerShell 7, the shell in the Claude
  desktop terminal. Where bash differs, the bash form follows. The commands
  say `curl.exe`: in PowerShell 7 plain `curl` is the real curl too, but in
  the old Windows PowerShell 5 it is an alias for `Invoke-WebRequest`, and
  `curl.exe` works in both.
- **Start clean.** This runbook must be merged and your Shelfstock checkout
  on `main` with `git status` showing nothing, or the first `git checkout`
  in task 1 refuses.
- **Accounts.** GitHub `jasrulete` — other accounts are logged into `gh` and
  the active one flips on its own, so every `gh` command that writes
  (`pr create`, `pr merge`, `release create`) is chained behind
  `gh auth switch --user jasrulete &&` in one line. Git pushes are pinned to
  `jasrulete` by the repo's credential helper and need nothing. Expo login
  `jer2x` (the login also owns a `jer2xs-team` account). Neon console for
  the database. Vercel dashboard: org `jer2xs-projects`, project
  `shelfstock-frontend`.
- **Secrets.** Never paste a connection string or password into a chat with
  an agent, and never echo one in a terminal (`echo $env:DATABASE_URL`,
  `Get-ChildItem Env:`). The previous production password was rotated on
  2026-09-05 for exactly that. Each sequence that sets `$env:DATABASE_URL`
  removes it at its end (task 1, step 5). Put the string in **single**
  quotes: PowerShell expands `$` inside double quotes and would silently
  alter a password that contains one.
- **Demo accounts.** The admin and shopper logins are in the
  [README's Demo accounts table](../README.md#demo-accounts); where a command
  below needs the password it says `<demo admin password>` — replace that,
  angle brackets included, before running. Left as is, the login answers
  "Invalid email or password" and every later call in the same line fails
  with "Missing or malformed Authorization header".
- **Merging to `main` is the production release.** Vercel deploys it within
  minutes; there is no staging gate ([OPERATIONS.md](OPERATIONS.md)).

## 1. Run the production migration, then merge #41

**Done on 2026-09-06.** The migration ran on production, #41 merged as
`5899b11`, `/api/health` was ok, the malformed-id probe answered 400, and
the replay proof passed on product 6: the first `+1` wrote ledger row 3
carrying its request id, the identical request was answered
`replayed: true` with that same row and wrote nothing, and the `-1` wrote
row 4 — two new rows, not three, stock back where it started. Not confirmed
from the terminal transcript: step 6, the Neon `preview` branch; if it was
skipped, PR previews fail on every stock move until it is run. The steps
stay here for the next schema change.

**Why.** The companion now sends a `requestId` with every stepper press so a
press replayed after the app is killed is applied once. Shelfstock
[#41](https://github.com/jasrulete/Shelfstock/pull/41) is the server half. It
adds a column, `stock_adjustments.client_request_id`, and after it every
stock move — storefront checkout, order cancellation, the product form with
a stock value, and adjust-stock — writes that column through the one ledger
INSERT. So the column must exist on the database before the merge deploys,
or all of those fail, customer checkout included. Until #41 is deployed the
server ignores the id, which is harmless.

**What the migration does.** Two idempotent statements: add the nullable
column, and a unique index over it where not null. The web admin's stepper
and the server's own checkout and cancel rows carry no id.

**Which connection string.** Use the **direct** string for this task, not
the pooled one. node-pg-migrate takes a session-level advisory lock and sets
`search_path`, and Neon's pooler (PgBouncer in transaction mode) does not
support either; the "always use the pooled string" rule in OPERATIONS.md
exists for Vercel's many short-lived connections, not for one terminal. Both
strings are in the same Neon Connect dialog; the direct host has no
`-pooler` in it. (If you use the pooled one anyway it usually works, but you
may see `Failed to release migration lock` — the migration still committed —
and a rerun may say `Another migration is already running`, which is the
pooler, not a real migration: run again, or add `--no-lock`.)

### Steps

1. **Check out the branch that contains the migration.** On `main` the file
   does not exist and node-pg-migrate would print `No migrations to run!`,
   which looks like success and is not.

   ```bash
   cd C:\@JERIC\Important\@Projects\shelfstock; git fetch origin; git checkout claude/adjust-stock-idempotency; Get-ChildItem frontend\migrations
   ```

   Expect five files, the last one
   `1788669665419_stock_adjustments_client_request_id.sql`.

2. **Get the production connection string.** Neon console → the project →
   branch `production` → Connect → the direct string. Keep it in the
   clipboard; do not save it anywhere.

3. **Dry run** — prints the SQL, changes nothing.

   ```bash
   cd frontend; $env:DATABASE_URL = '<paste the direct string>'; npx node-pg-migrate --dry-run up --no-check-order
   ```

   Expect exactly one pending migration,
   `1788669665419_stock_adjustments_client_request_id`, with its
   `ALTER TABLE` and `CREATE UNIQUE INDEX`.

   `--no-check-order` is not a one-off for this migration. node-pg-migrate
   compares the names production has recorded, in the order it ran them,
   position by position against the files sorted by name; production ran
   `companion_barcode_and_device_tokens` before `password_resets` on
   2026-09-05, so every future run against production — including this dry
   run — needs the flag. The flag only skips that comparison: it still
   applies nothing that `pgmigrations` already records, so the only thing it
   can run here is the new file, which is `IF NOT EXISTS`. Two things that
   go wrong here:
   - `Not run migration … is preceding already run migration …` — the flag
     was lost or mistyped (node-pg-migrate does not reject unknown flags).
     On PowerShell never use `npm run migrate:up -- --flag`; the `--` is
     dropped and npm swallows the flag. Use `npx node-pg-migrate`.
   - The first connection hangs past 20 seconds — a suspended Neon compute.
     Open the Neon console (that wakes it) and run again.

4. **Apply it.**

   ```bash
   npx node-pg-migrate up --no-check-order
   ```

   Expect the migration's name in the output and no error. It runs in one
   transaction: if it aborts, nothing is recorded and you simply run it
   again. A second run prints `No migrations to run!`.

5. **Confirm, and clear the variable.** `psql` 17 is installed on this PC.

   ```bash
   psql $env:DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name='stock_adjustments' AND column_name='client_request_id';" -c "SELECT name, run_on FROM pgmigrations ORDER BY run_on, id;"; Remove-Item Env:DATABASE_URL
   ```

   Expect one row, `client_request_id`, then five `pgmigrations` rows with
   the new one last and today's `run_on`. If `psql` refuses over TLS, append
   `?sslmode=require` to the string. Without psql, the dry run from step 3
   printing `No migrations to run!` is the same confirmation — but only
   because the tree is on the PR branch.

6. **Repeat steps 2–5 for the Neon `preview` branch** with its own direct
   string (Neon console → branch `preview` → Connect). You are already in
   `frontend/`, so drop the leading `cd frontend;` from step 3. PR previews
   deploy against this branch, and after #41 every stock move there would
   fail without the column. Preview was branched from production once and
   does not follow it, so the dry run may list more than one pending file —
   applying them all with the same command is the intended outcome, and the
   `pgmigrations` check should end with all five files recorded.

7. **Merge #41, deleting its branch.** `--match-head-commit` refuses if the
   branch has moved since this was written.

   ```bash
   cd ..; git checkout main; gh auth switch --user jasrulete && gh pr merge 41 --repo jasrulete/Shelfstock --merge --delete-branch --match-head-commit 5ed2ded99135c9c160bcb21a8235ec3bcd77c708
   ```

   Expect `Merged pull request #41` and the branch deleted, remote and
   local. Then `git pull --ff-only origin main`.

8. **Watch the deploy land**, a minute or two later.

   ```bash
   curl.exe -s https://shelfstock-jer2x.vercel.app/api/health
   ```

   Expect `{"status":"ok","database":"ok"}`. Then a probe that cannot touch
   stock — a malformed `requestId` against a product id that does not exist.
   The new code answers **400** before opening a transaction; the old code
   answers **404**, which means the deploy is not live yet, so wait and retry.
   Put the real demo admin password in place of `<demo admin password>`
   first (§0).

   ```bash
   $login = Invoke-RestMethod -Method Post -Uri 'https://shelfstock-jer2x.vercel.app/api/auth/login' -ContentType 'application/json' -Body '{"email":"admin@shelfstock.demo","password":"<demo admin password>"}'; $r = Invoke-WebRequest -SkipHttpErrorCheck -Method Post -Uri 'https://shelfstock-jer2x.vercel.app/api/products/999999/adjust-stock' -Headers @{ Authorization = "Bearer $($login.token)" } -ContentType 'application/json' -Body '{"delta":1,"source":"companion","requestId":"bad id"}'; $r.StatusCode; $r.Content
   ```

   Expect `400` and
   `{"error":"requestId must be 8-64 characters: letters, digits, dot, dash or underscore"}`.

9. **Optional end-to-end proof**, net-zero on the demo product 6, only after
   step 8 returned 400. Three calls: `+1` with a request id, the identical
   call again, then `-1` with a different id.

   ```bash
   $h = @{ Authorization = "Bearer $($login.token)" }; $u = 'https://shelfstock-jer2x.vercel.app/api/products/6/adjust-stock'; Invoke-RestMethod -Method Post -Uri $u -Headers $h -ContentType 'application/json' -Body '{"delta":1,"source":"web-admin","note":"#41 verification","requestId":"runbook-41-plus-0001"}' | ConvertTo-Json -Compress; Invoke-RestMethod -Method Post -Uri $u -Headers $h -ContentType 'application/json' -Body '{"delta":1,"source":"web-admin","note":"#41 verification","requestId":"runbook-41-plus-0001"}' | ConvertTo-Json -Compress; Invoke-RestMethod -Method Post -Uri $u -Headers $h -ContentType 'application/json' -Body '{"delta":-1,"source":"web-admin","note":"#41 verification","requestId":"runbook-41-minus-0001"}' | ConvertTo-Json -Compress
   ```

   Expect the second answer to carry `"replayed":true` with the same
   adjustment row as the first and the stock unchanged. In `/admin/products`
   → the product's **History**: two new rows (`+1`, `-1`), not three.

**Done when** the column exists on `production` and `preview`, #41 is merged,
`/api/health` is ok and the probe answers 400.

**The agent can then** refresh the handover and, if you did step 9, write
the verification down.

## 2. Link the companion to EAS and build the APK

**Why.** No APK has been built from any of this month's companion work, and
push tokens cannot register until `app.json` carries `extra.eas.projectId`,
which `eas init` writes. Both `eas init` and `eas build` change your Expo
account (a project, a keystore, build minutes), which is why they are yours.

### Steps

1. **Confirm the CLI and the login.** `eas-cli` 20.5.0 is installed globally;
   the CLI itself offers 23.x. Upgrading is optional (`npm install -g eas-cli`);
   the prompts may then differ slightly from older docs.

   ```bash
   cd C:\@JERIC\Important\@Projects\Mobile\shelfstock-companion; npx eas-cli --version; npx eas-cli whoami
   ```

   Expect the version line and your login with two accounts, `jer2x` and
   `jer2xs-team`. If it says not logged in, run `npx eas-cli login` yourself.

2. **Create the EAS project.** It is interactive: it asks which account owns
   the project (`app.json` sets no `owner`) — pick `jer2x`, the account the
   handover refers to — and whether to create a new project for the slug
   `shelfstock-companion`.

   ```bash
   npx eas-cli init
   ```

   Then check what changed:

   ```bash
   git diff app.json; npx eas-cli project:info
   ```

   Expect only an added `"extra": { "eas": { "projectId": "<uuid>" } }` block
   (possibly an `owner` field too), and `project:info` printing the project
   instead of "EAS project not configured".

3. **Build the installable APK in the cloud.** The profile flag is mandatory:
   `eas.json` has no `production` profile, only `development` and `preview`,
   and `preview` is the one that produces an APK (`android.buildType: apk`)
   pointed at production (`EXPO_PUBLIC_API_URL` is baked in at build time
   from `eas.json`; the local `.env` is not used by the cloud build).

   ```bash
   npx eas-cli build --platform android --profile preview
   ```

   On a first build expect prompts: generate an Android keystore (accept the
   EAS-managed one unless you have your own) and possibly an initial remote
   version number. The CLI uploads the project, waits, and ends with a build
   page link. Plan for 10–30 minutes including queue time.

4. **Install it on the phone.** Open the build link (or the QR) on the phone
   → download → allow "install unknown apps" → install. There is no `adb` on
   this PC; if you want `adb install`, `winget install --id Google.PlatformTools --exact`
   provides it. `eas build:run` and `build:download` are emulator-only and not
   the path here.

   To find the build again later:

   ```bash
   npx eas-cli build:list -p android --status finished --limit 5
   ```

5. **Commit the project id through a PR.** The companion's `main` is
   protected: a pull request is mandatory, the CI job `checks` must be green
   first, and that holds for admins too. So open the PR, wait for its check,
   then merge — all as `jasrulete`.

   ```bash
   git checkout -b eas-init; git add app.json; git commit -m "Link the companion to its EAS project"; git push -u origin eas-init; gh auth switch --user jasrulete && gh pr create --repo jasrulete/shelfstock-companion --fill
   ```

   ```bash
   gh pr checks <N> --repo jasrulete/shelfstock-companion --watch; gh auth switch --user jasrulete && gh pr merge <N> --repo jasrulete/shelfstock-companion --merge --delete-branch
   ```

   (`--auto` on the merge line instead of the watch also works: it merges by
   itself once the check passes.)

6. **Push notifications on Android need one more thing: Firebase.** The
   project id gets a token *requested*; delivery needs the steps in the
   companion's [SETUP.md §4b](https://github.com/jasrulete/shelfstock-companion/blob/main/docs/SETUP.md):
   a Firebase project with the Android app `com.jeric.shelfstockcompanion`,
   `google-services.json` in the repo root referenced by
   `android.googleServicesFile` in `app.json` (commit it, it holds no
   secret), and the FCM V1 service-account key uploaded through
   `npx eas-cli credentials` (keep that key outside the repo folder — the
   ignore rules do not match a `.json` key by name). Without this the app
   still works; the notifications switch shows "Could not update
   notifications" and the lock-screen push screenshot in task 4 is not
   possible. Rebuild after adding the file.

7. **Optional, the release itself** (the companion's SETUP.md §6). The APK
   has to be on the PC for this: open the build page in a desktop browser
   (the link the CLI printed, or from `build:list`) and press Download, then
   rename the file to `shelfstock-companion.apk` in the companion folder.

   ```bash
   git tag v1.0.0; git push --tags; gh auth switch --user jasrulete && gh release create v1.0.0 ./shelfstock-companion.apk --title "ShelfStock Companion v1.0.0" --notes "Admin companion app for ShelfStock: order management with push notifications, barcode-scan inventory, offline read caching and an offline write queue. Android 8+."
   ```

   Then link the release from the README. The repo has no releases yet.

**Done when** the APK is installed, you can sign in as the demo admin against
production, `eas build:list` shows the finished build, and `app.json` with
the project id is merged.

**The agent can then** open and merge the `app.json` PR for you if you paste
the diff, write the release notes, and update the README's release link. (Two
stale sentences to know about: the companion README's release section and
SETUP.md §6 both say `eas.json` ships with a placeholder API URL; `eas.json`
already has the real one.)

## 3. Verify the companion on a real phone

**Why.** Pack & verify and everything the companion gained this month exist
only under Jest with a mocked camera and a mocked network. The checklist
below names what each Jest test claims, so you can see it happen for real.

**Two ways to run it.** The APK from task 2 (needed for anything involving
push), or Expo Go for everything else: in the companion folder,
`Copy-Item .env.example .env`, set `EXPO_PUBLIC_API_URL=https://shelfstock-jer2x.vercel.app`
(restart `npx expo start` after any change — the value is inlined at start),
then `npm install; npx expo start` and scan the QR with Expo Go on the same
wifi. Sign in as the demo admin.

**Do task 1 first if you can.** The relaunch test in section G can, on
today's server, apply a press twice in one specific timing window; after #41
is deployed it cannot.

### Set-up

- **Print the barcode sheet.** On the web, signed in as the demo admin, open
  `https://shelfstock-jer2x.vercel.app/admin/barcodes`. Press **Assign N
  missing** if it shows, then **Print sheet**. Expect a three-column grid of
  cards, each with the product name and an EAN-13 starting `200…`. The
  camera reads them off paper; off a laptop screen was never tested.
- **Create two pending orders.** The seeded demo orders are all `completed`
  and cannot be packed. Sign in as the demo shopper on the web, add two or
  three products with one at quantity 2, and check out with Cash on
  Delivery; then place a second, smaller one for section E. They appear on
  the phone's Orders tab under the **pending** chip.
- **Keep the ledger readable.** History shows the last 20 rows per product;
  keep presses per product to a handful so every row is visible.

### Checklist

Do the steps in order; each line says what you should see.

**A. Pack & verify**

| Step | Expect |
|---|---|
| Orders tab → the first pending order → **Pack & verify** | First time: an in-app note "Verifying a box needs the camera to read product barcodes." with **Allow camera**; press it and allow in the Android dialog. Then the header "Pack order #N", one line per item with `scanned / expected` (or "no barcode"), the camera, and a red **Ship anyway (N unverified)** button. |
| Scan a card that matches a line | Green overlay "*name* — 1 of 2", a success buzz, the count moves. When a line is full its name gets a leading ✓ and turns green. |
| Scan the same card again while the line is full | Red overlay "*name* is already fully scanned" and an error buzz. |
| Scan a card for a product not in the order | Red "Not in this order" and an error buzz. |
| Scan a quantity-2 line twice | Move the camera away and back, or wait 1.5 s; the same code is ignored for 1.5 s after it was accepted, so a steady camera counts once. |
| All lines full | The red button becomes **Mark shipped**; pressing it ships the order and returns to the order screen. |
| Before all lines are full, press **Ship anyway** | Alert "Ship without verifying?" / "k of n line(s) were not scanned." with Keep packing / Ship anyway. Confirming ships with a note that reaches the server log only — nothing on the web shows it. |
| Either way of shipping | Nothing arrives by email: transactional mail is a no-op on production (`RESEND_API_KEY` is unset — SECURITY.md KW-6). The check is the order showing **shipped** on the web `/admin/orders` and on the phone's Orders tab. |

**B. The Scan tab**

| Step | Expect |
|---|---|
| Inventory → **Scan** → a card from the sheet | Goes straight to that product's edit screen. |
| Scan any grocery barcode | Goes to **New product** with the code prefilled. |

**C. Inventory search, Retry, low-stock chip**

| Step | Expect |
|---|---|
| Type a word into the search box | One request after you pause, not one per letter; the previous list stays up while the next loads — no flash of "No products". |
| Airplane mode on, then search for a new word | The previous list stays and nothing errors: without signal the request pauses rather than failing, and it completes by itself when the signal returns. The red bar "Couldn't load products." with **Retry** appears only when a request fails *with* signal — reproduce it, if you want, with a wrong `EXPO_PUBLIC_API_URL` in an Expo Go run. |
| Step a product from 6 to 5 with the stepper | The chip "N low on stock" appears or counts up by one and that row's count turns red; step back to 6 and it counts down or disappears. |

**D. Notification preference** — APK with the project id *and* Firebase
from task 2 (steps 2 and 6). Without Firebase the switch can never turn on,
so only the blocked-state row is testable; Expo Go and emulators cannot
register push at all.

| Step | Expect |
|---|---|
| Settings → turn **New-order notifications** on, then off → swipe the app away → reopen | The switch is still off (it used to silently turn itself back on). |
| In Android's app settings deny notifications — Android restarts the app — then open Settings in the app | The switch is disabled and a note says notifications are turned off in system settings, with **Open settings**. Re-allow, then swipe the app away and reopen: the note is gone. (The state is read once per launch; switching tabs does not refresh it.) |
| Switch on, then place an order on the storefront | A notification with title **New order** and body **Order #N — $X** within seconds. |

**E. Offline queue, step 1**

| Step | Expect |
|---|---|
| Airplane mode on → open the second pending order (or the one you shipped in A, which still offers **Mark completed**) → change its status | The button waits; the blue banner "1 queued — sends when you're back online" at the top. Airplane mode off → it sends, the banner clears. |

**F. The stepper offline** — airplane mode *first*, then press. A press whose
request was already sent when the signal dropped is not queued: it reads
"Not applied: …" and you press again later.

| Step | Expect |
|---|---|
| Airplane mode on → press **+** twice on one product | The count stays the server's number; "+2 pending" appears beside it; the blue banner says "2 queued"; both buttons stay usable. |
| Press **−** until the projected count reaches 0 | The − button disables at projected 0 — it never queues a press the server would refuse. |
| Airplane mode off | The presses go one at a time in press order; "pending" disappears; the count lands on the server's number; the banner clears. |

**G. Relaunch replay** — do not sign out in between; signing out clears the
queue by design.

| Step | Expect |
|---|---|
| Airplane mode on → press **+** once → wait two seconds → kill the app *while still offline* (swipe it away in recents; for Expo Go, swipe Expo Go away) → airplane mode off → reopen | Briefly "+1 pending", then the count lands on the server's number. |
| If instead the app is killed within a second *after* reconnecting | Before #41 is deployed this specific timing can apply the press twice (the persisted queue lags the live one by up to a second). After #41 it is answered as a replay. That is the known window, not a new bug. |

**H. A refused press**

| Step | Expect |
|---|---|
| Airplane mode on → press **−** down to projected 0 → on the web, lower the same product's stock with the admin's stepper → airplane mode off | The last press is refused: an error buzz, the count lands on what the server reported, and red "Refused: Only X in stock; cannot remove 1" under it. The notice goes once a later press lands or the count moves on. |

**I. The ledger** — `https://shelfstock-jer2x.vercel.app/admin/products`, the
product's **History** link in its stock cell.

| Check | Expect |
|---|---|
| Rows | One line per accepted press, worded like `+1 from the companion app · just now`; none for a refused press; the web admin's own presses read "from the admin". The list does not show the count after each press — compare the number in the stock cell instead. |

**Done when** every row matched, or you have a list of what did not.

**The agent can then** turn any mismatch into a fix with a test, and record
the verification in the handover.

## 4. Screenshots and the scan GIF

**What is wanted** (roadmap §4.1 and the handover): login, orders list, order
detail, the inventory stepper with a "+N pending" row, the scanner, pack &
verify ticking lines off, a real push on the lock screen, and a short GIF of
scan → product. They go in the companion's `docs/screenshots/` (today only a
`.gitkeep`) and into the companion README's **Screenshots** section, which is
a placeholder comment waiting for them. The web README has no such section
yet; adding one there is a new section, your call where.

**Tools.** `ffmpeg` 8 is installed. `adb` and `scrcpy` are not; both come
from winget and need a new terminal afterwards:

```bash
winget install --id Google.PlatformTools --exact; winget install --id Genymobile.scrcpy --exact
```

### Steps

1. Phone on USB with USB debugging on; `adb devices` shows one line ending
   in `device` (accept the prompt on the phone if it says `unauthorized`).
2. **Stills**, one per screen, from PowerShell 7 (Windows PowerShell 5
   corrupts the binary redirect). Suggested names; none are prescribed:

   ```bash
   cd C:\@JERIC\Important\@Projects\Mobile\shelfstock-companion; adb exec-out screencap -p > docs\screenshots\login.png
   ```

   Repeat for `orders.png`, `order-detail.png`, `inventory-stepper.png` (with
   airplane mode on and a "+2 pending" row), `scan.png`, `pack-verify.png`.
3. **The push shot** needs Firebase (task 2 step 6). Take it with the phone's
   own screenshot combo on the lock screen, then pull the phone's screenshot
   folder, keep the one file as `docs\screenshots\push.png`, and remove the
   rest — nothing in `.gitignore` would keep a stray folder out of the commit:

   ```bash
   adb pull /sdcard/Pictures/Screenshots/ docs\screenshots\_phone\; Move-Item docs\screenshots\_phone\<the one file> docs\screenshots\push.png; Remove-Item -Recurse docs\screenshots\_phone; git status
   ```

   Some phones keep screenshots under `/sdcard/DCIM/Screenshots` instead.
4. **Record the scan** — Inventory → Scan → a card → the product screen,
   ten to fifteen seconds:

   ```bash
   scrcpy --record docs\screenshots\scan.mp4 --max-size 1080 --no-audio
   ```

   Close the mirror window to finish the file.
5. **Convert to a README-sized GIF** (360 px wide, 12 fps, two-pass palette;
   a real recording lands around 1–3 MB — trim with `-ss <start> -t <seconds>`
   before `-vf` if larger):

   ```bash
   ffmpeg -y -i docs\screenshots\scan.mp4 -vf "fps=12,scale=360:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" -loop 0 docs\screenshots\scan.gif
   ```

   Delete the `.mp4` afterwards; nothing in `.gitignore` would keep it out of
   the commit.
6. **Put them in the README** in place of the placeholder comment, and open a
   PR (as `jasrulete`, chained behind the account switch like task 2 step 5;
   `main` is protected, so the merge waits for the `checks` job). The
   companion's CI does not check image links, so preview the README on the PR
   page before merging. If you also add a section to the web README, either
   copy the images into the web repo or link them by absolute `https://`
   URL — the web repo's link checker fails on a relative path that does not
   exist there.

**Done when** the files are in `docs/screenshots/`, the README shows them,
and the PR is merged.

**The agent can then** write the README section (both repos), the commit and
the PR from the files you drop into the folder.

## 5. Promote the CSP

**What it is.** Every page currently carries `Content-Security-Policy-Report-Only`;
browsers report what the policy *would* block to `/api/csp-report`, which
logs one `CSP violation: …` line per report. Promotion renames that header to
`Content-Security-Policy`, so the browser starts enforcing it. There is no
switch or env var: the header name is one string literal in
`frontend/next.config.js`, and the rollout is a merge to `main`.

**What it will and will not enforce.** The policy still allows inline and
eval scripts, so promotion mainly enforces images, fonts, connections, forms
and framing; it does not close the XSS gap that [SECURITY.md](SECURITY.md)
KW-1 describes, and the docs should keep saying so.

### Steps

1. **Walk every route on production** while signed in — in Chrome and in at
   least one of Firefox or Safari, since each reports through a different
   mechanism: `/`, a `/products/[id]`, `/cart`, `/checkout` (complete one),
   `/orders` and an `/orders/[id]`, `/login`, `/register`,
   `/forgot-password`, `/reset-password`, and `/admin/dashboard`,
   `/admin/products`, `/admin/orders`, `/admin/customers`, an
   `/admin/customers/[id]`, `/admin/barcodes`. Do it in a private window, or
   first delete the site's `shelfstock_rates_cache` entry in DevTools →
   Application → Local Storage: the exchange-rate request fires on page load
   when that cache is missing or older than 30 minutes, never on the
   currency switch, and it is the one third-party connection the policy
   must allow.
2. **Read the reports.** Dashboard: Vercel → `jer2xs-projects` →
   `shelfstock-frontend` → Logs → filter `CSP violation`. Or from the
   terminal:

   ```bash
   vercel logs -p shelfstock-frontend --environment production -q "CSP violation" -n 1000
   ```

   Fix or allowlist whatever appears (the policy is the array at the top of
   `frontend/next.config.js`), repeat step 1 until a full pass is clean. Each
   line names the directive, the blocked URL and the page. Product images
   pasted from unknown hosts cannot cause img-src lines — they already go
   through `/_next/image` and degrade to the placeholder.
3. **Leave it a day** of ordinary traffic. Mind the retention: Vercel keeps
   runtime logs for one hour on the Hobby plan and one day on Pro, so a
   single read after a day proves only the last hour, and `No logs found` is
   not evidence of a clean day. Either check every hour or so, or keep

   ```bash
   vercel logs -p shelfstock-frontend --environment production --follow | Tee-Object -FilePath csp-day.log
   ```

   running in a terminal for the day and search the file for
   `CSP violation` afterwards. Nothing else in the log starts with that
   prefix.
4. **Promote.** This is a normal PR, and it is the part the agent can do
   entirely once you say the day was clean: rename the key in
   `frontend/next.config.js`, flip the two assertions in
   `frontend/tests/securityHeaders.test.ts` (one reads the report-only header,
   one asserts the enforcing header is absent), rewrite the "Residual"
   paragraph of [SECURITY.md](SECURITY.md) KW-1 and both bullets under it
   (report-only becomes enforcing, but inline and eval stay allowed so the
   XSS residual stands; "frame-ancestors is inert" stops being true),
   update [OPERATIONS.md §5](OPERATIONS.md#reading-csp-reports) (keep that
   heading's text — it is an anchor other docs link to), the README's
   "report-only" sentence and the handover; run
   `npm run lint; npm run docs:check; npx tsc --noEmit; npm test` in
   `frontend/`; merge.
5. **Check it landed.**

   ```bash
   curl.exe -sI https://shelfstock-jer2x.vercel.app/ | findstr /i "content-security-policy reporting-endpoints"
   ```

   Expect `Content-Security-Policy:` (no `-Report-Only`) and the
   `Reporting-Endpoints:` line, printed in that capitalisation; reports keep
   flowing after promotion because both report directives are in the policy.
   Then walk the routes once more with the browser console open, again with
   the rates cache cleared: fonts render as Inter and Fraunces, product
   photos render, the rates request on load succeeds, and the console shows
   no "Refused to …" lines.
6. **If the storefront breaks**, stop the bleeding first with Vercel's own
   rollback — the CLI is logged in as `jasrulete`:

   ```bash
   vercel rollback <url or id of the last good deployment>
   ```

   (or the dashboard's Instant Rollback), which restores the previous build
   in seconds without touching git. Then make `main` match with a one-line
   PR renaming the key back, merged the usual way.

**Done when** the enforcing header is live, the browser walk is clean, and
the docs say "enforced".

**The agent can then** do step 4 in full and update every doc that still
says report-only.

## When these are done

Nothing is queued for the agent beyond what each section hands over. The
roadmap has no Phase 4; the candidates the 2026-09-06 session noted are in
[HANDOVER.md §0.4](../HANDOVER.md), all now done. If you want more, the honest
next things are a transport-error retry for stepper presses (safe once #41 is
live), and the product form's PUT-with-stock hazard named in the companion's
architecture doc.
