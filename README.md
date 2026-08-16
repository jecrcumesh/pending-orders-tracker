# Pending Orders Tracker

A static, no-build web app for viewing and managing your pending orders sheet.
Built from `Pending_Order__Organized__1 (1).xlsx` — all 165 valid order rows,
all original 20 columns preserved, plus a new **Expected Delivery Date** column.

## Files
- `index.html` — main tracker page
- `delivery-plan.html` — delivery planner page (today / tomorrow / day after)
- `dispatch-sheet.html` — printable Material Dispatch Sheet
- `style.css` — shared styling, frozen columns, status colors
- `dispatch-sheet.css` — dispatch sheet layout + print (A4 landscape) styling
- `app.js` — main tracker logic (sort, filter, pagination, editing, GitHub save, export)
- `delivery-plan.js` — delivery planner logic
- `dispatch-sheet.js` — dispatch sheet logic (autocomplete, rows, print)
- `orders.json` — your order data (edit this file, or regenerate from a fresh
  export, to update the app's data)

## Features
- Click any column header to sort ascending / descending.
- Type into the filter box under a column header to filter it (dropdowns for
  status-type columns, free text for the rest). There's also a global search
  box that searches every column at once.
- **Customer Name**, **Material Name**, and **Finish / Surface** stay frozen
  on the left while you scroll right through the rest of the columns.
- The table has its own scroll area (~68% of viewport height), so you can
  page through records without scrolling the whole browser window.
- Rows are color-coded by **Order Status** (see the legend above the table).
- Pick 10 / 25 / 50 / 100 / All rows per page, with page navigation controls.
- **Every field is editable in place.** Click any cell (except Sr. No. and
  the calculated columns — Balance Qty, % Dispatched, Days Since Order) to
  edit it. Press Enter or click away to save, or Escape to cancel. The
  change appears in the table immediately. Balance Qty, % Dispatched, and
  Days Since Order recalculate automatically when you edit Order Qty,
  Dispatched Qty, or Order Date.
- **Add / delete records.** Click **"+ Add Order"** to add a new record, or
  the 🗑 icon on any row to delete it — both update the list right away.
- **One "💾 Save Changes" button commits everything.** Edits, adds, and
  deletes are kept in the browser until you click **"💾 Save Changes"** in
  the top bar (it turns green and pulses whenever there's something
  unsaved). One click writes the entire current list to `orders.json` in a
  single commit — much simpler than saving each change separately, and you
  always see exactly what will be saved before you save it. If you try to
  close the tab with unsaved changes, the browser will warn you.
- **Export to Excel.** "⬇ Export All" downloads every order; "⬇ Export
  Filtered" downloads only the rows currently matching your search/filters —
  handy for sharing a specific slice (e.g. one customer, or one status).
- **Delivery Planner page** (📅 button, opens in a new tab). Separate from
  the main list — shows only active orders (not Completed/Cancelled) whose
  Expected Delivery Date is today, tomorrow, or the day after, grouped by
  day, so you can plan deliveries at a glance. Has its own Excel export too.
- **Material Dispatch Sheet page** (📄 button, opens in a new tab). A
  printable, A4-landscape sheet matching the paper Stonedge dispatch form.
  **It auto-fills on load** with every active order (not
  Completed/Cancelled) whose Expected Delivery Date is tomorrow — the exact
  same rule as the Delivery Planner's "Tomorrow" bucket — so most of the
  sheet is prepared for you: Customer Name, Material Name, Finish / Surface,
  Qty (from Balance Qty + Unit), and Delivery Address (from Contact Number)
  are pre-filled; Expected Delivery Time and Remarks are always left blank
  for manual entry, even on auto-filled rows. Auto-filled rows get a faint
  blue tint on screen (not printed) so you can spot them, and a few extra
  blank rows are added after them for anything that comes up. Click
  **"🔄 Refill from Tomorrow's Plan"** any time to re-pull the latest data —
  this replaces everything currently on the sheet, so use it before you've
  made manual edits you want to keep. If nothing's due tomorrow yet, the
  sheet just starts blank like before. Every field, pre-filled or not,
  stays editable: type a Customer Name and pick from the autocomplete
  suggestions (pulled from `orders.json`); Material Name then only suggests
  materials that customer has actually ordered, and Finish / Surface only
  suggests finishes seen for that exact customer + material — the same
  cascading logic as picking a real order line. **Rows auto-sort by
  Expected Delivery Time** — fill it in (or change it) on any row and the
  sheet re-sorts earliest-to-latest automatically; text that isn't a
  recognizable time (e.g. "ASAP") sorts after timed rows, and blank rows
  stay at the bottom. Each row has a 🎨 color
  swatch to highlight it any color you like (✕ clears it) — handy for
  flagging urgent or problem deliveries; the color prints too. Use
  "+ Add Row" / "− Remove Row" to resize the sheet, then **"🖨 Print"**.

## Sign in with a GitHub token (required to click "Save Changes")
Editing, adding, and deleting work locally without signing in — you only
need a token when you're ready to click **"💾 Save Changes"**, which writes
straight to `orders.json` in your repo via the GitHub API:

1. On GitHub, go to **Settings → Developer settings → Personal access
   tokens → Fine-grained tokens → Generate new token**.
2. Scope it to just this repository, and under **Repository permissions**
   set **Contents: Read and write**.
3. In the app, click **"Sign in with GitHub token"** in the top bar and fill in:
   - the token you just created
   - repo owner (your GitHub username or org)
   - repo name
   - branch (defaults to `main`)
   - file path (defaults to `orders.json`)
4. Click **Connect**. The app verifies it can read the file. From then on,
   clicking **"💾 Save Changes"** writes your pending edits directly to
   that file. If you click it before signing in, it opens this same dialog
   first — your pending changes are not lost.

**Security note:** the token is stored only in your browser's
`localStorage` and is sent only to `api.github.com`. Anyone with access to
that browser (or its dev tools) could read it, so use a token scoped to
this one repo, and sign out ("GitHub settings" → "Sign out") on shared
computers.

## Why the table sometimes seems to show "old" data after a refresh

Two separate things are going on here, and the app handles both automatically:

1. **This tab, right now:** every edit, add, and delete updates what you see
   on screen immediately — that's local, instant, and doesn't touch the
   network at all. You never need to refresh to see your own change in the
   tab you made it in.
2. **The saved file, everywhere else:** clicking "💾 Save Changes" (or
   Save on Add Order) writes straight to `orders.json` in your GitHub repo,
   but GitHub Pages then has to rebuild and redeploy the site before that
   new file is actually served — that typically takes under a minute, but
   can occasionally take a couple of minutes. Until it does, anyone loading
   the page fresh (including you, if you hit refresh) — will still be
   served the previous version of `orders.json` by GitHub's servers. This
   isn't a caching bug in the app; it's how any static site hosted on
   GitHub Pages works, and it can't be skipped from the browser side.

To stop that redeploy delay from looking like lost data, the app does two
things after every save:
- It remembers exactly what was just saved (in this browser's
  `localStorage`). If this page — or the Delivery Planner page — is
  reloaded before GitHub Pages has caught up, it shows that remembered
  version instead of the stale one the server is still returning, for up
  to 5 minutes after the save.
- It quietly re-checks the live `orders.json` every few seconds in the
  background and shows **"✅ Live — GitHub Pages has redeployed with your
  latest save"** once the server is actually caught up, so you have a
  clear signal instead of having to guess and refresh repeatedly.

The one case this can't cover: a *different* browser or device loading the
page before GitHub Pages redeploys will still briefly see the old data —
there's no way around that without a real backend, since the "local
memory" trick only exists in the browser that made the save.

## "Save failed: orders.json does not match &lt;sha&gt;"

This error means GitHub refused the write because the copy of `orders.json`
on the server had already changed since the app last read it — most often
because it was open in another tab, another browser, or on another device
(phone + laptop, or two people) at the same time, and a save from there
landed a few seconds earlier. **This is GitHub protecting your data, not
losing it** — a mismatched-sha write is always rejected outright, so
nothing ever gets silently overwritten.

The app now retries this automatically: on a conflict it quietly re-reads
the file's current version and re-attempts the save (up to 5 times, a
moment apart), so a save that collides with another one resolves itself
without you needing to notice or click anything twice. You'll only see an
error if it still can't get a clean write after those retries — in that
case your edits are still sitting safely in this tab (nothing is lost),
and clicking "💾 Save Changes" again will pick up the latest version and
try once more.

If you're hitting this constantly rather than occasionally, it usually
means this tracker is genuinely being edited from more than one place at
once — which is expected with concurrent editors on a single shared file;
just re-clicking Save resolves it every time.

## JSON vs. Excel as the saved format

Short answer: **keep `orders.json` as the file the app reads and writes.**
Switching that to an `.xlsx` file wouldn't fix the conflict error above —
GitHub's same-sha protection applies to any file type equally, JSON or
Excel — and it would trade away things JSON is better at here:

- **Reliability of round-tripping.** The app writes JSON in exactly the
  shape it expects to read back. An `.xlsx` file, once someone opens and
  re-saves it in Excel, can pick up merged cells, extra header/summary
  rows, or reordered columns — exactly the kind of formatting quirks that
  made the original source spreadsheet fragile to parse in the first
  place. JSON has no such ambiguity.
- **Size and speed.** JSON is plain text and tiny; `.xlsx` is a zipped
  binary format, larger and slower to read/write over the API for no
  benefit here.
- **Git-friendliness.** JSON changes are at least somewhat readable in a
  diff; `.xlsx` is opaque binary, so you'd lose the ability to see what
  changed in a commit.

If you want an Excel copy for your own records, that's what **"⬇ Export
All"** is for — it converts the live JSON into a proper `.xlsx` on demand,
without making Excel the thing that's actually being edited and synced.

## Run locally
No build step needed. From this folder:
```
python3 -m http.server 8000
```
Then open http://localhost:8000 in a browser.

## Deploy to GitHub Pages
1. Create a new repository on GitHub (e.g. `pending-orders-tracker`), no README/template needed.
2. From this folder, run:
   ```
   git init
   git add .
   git commit -m "Initial commit: pending orders tracker"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
3. On GitHub: go to the repo's **Settings → Pages**. Under "Build and deployment",
   set **Source** to "Deploy from a branch", branch `main`, folder `/ (root)`. Save.
4. Wait a minute, then your app will be live at:
   `https://<your-username>.github.io/<your-repo>/`

## Updating the data later
You have two options:
- **In the app**: make your edits/adds/deletes, then sign in with a GitHub
  token if you haven't already, then click **"💾 Save Changes"**.
- **Manually**: re-export your Excel sheet, regenerate `orders.json` in the
  same shape (array of objects, one per order row, using the same column
  names as in `app.js`'s `COLUMNS` list), then commit and push.
