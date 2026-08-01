# Pending Orders Tracker

A static, no-build web app for viewing and managing your pending orders sheet.
Built from `Pending_Order__Organized__1 (1).xlsx` — all 165 valid order rows,
all original 20 columns preserved, plus a new **Expected Delivery Date** column.

## Files
- `index.html` — main tracker page
- `delivery-plan.html` — delivery planner page (today / tomorrow / day after)
- `style.css` — shared styling, frozen columns, status colors
- `app.js` — main tracker logic (sort, filter, pagination, editing, GitHub save, export)
- `delivery-plan.js` — delivery planner logic
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
