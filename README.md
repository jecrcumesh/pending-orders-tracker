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
- **Expected Delivery Date** is editable — click a cell and pick a date.
  There was no delivery-date data in the source spreadsheet, so this column
  starts empty.
- **Add / delete records for real.** Click **"+ Add Order"** to add a new
  record, or the 🗑 icon on any row to delete it. Both use the **"Save to
  orders.json"** / confirm action to commit the change directly to
  `orders.json` in your GitHub repo (see below) — they are not just saved
  in your browser. A status message appears in the modal itself, so you can
  see immediately whether the save succeeded or failed.
- **Export to Excel.** "⬇ Export All" downloads every order; "⬇ Export
  Filtered" downloads only the rows currently matching your search/filters —
  handy for sharing a specific slice (e.g. one customer, or one status).
- **Delivery Planner page** (📅 button, opens in a new tab). Separate from
  the main list — shows only active orders (not Completed/Cancelled) whose
  Expected Delivery Date is today, tomorrow, or the day after, grouped by
  day, so you can plan deliveries at a glance. Has its own Excel export too.

## Sign in with a GitHub token (required to add/delete)
Adding or deleting a record writes straight to `orders.json` in your repo
via the GitHub API, so the app needs a token with write access:

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
4. Click **Connect**. The app verifies it can read the file, then any
   Add/Delete you do afterwards commits directly to that file.

**Security note:** the token is stored only in your browser's
`localStorage` and is sent only to `api.github.com`. Anyone with access to
that browser (or its dev tools) could read it, so use a token scoped to
this one repo, and sign out ("GitHub settings" → "Sign out") on shared
computers. Viewing/sorting/filtering the table never requires signing in —
only Add and Delete do.

Because the write goes straight to the repo, GitHub Pages will take about a
minute to redeploy after a save before other visitors see the change; your
own browser updates immediately.

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
- **In the app**: sign in with a GitHub token (above), then use "+ Add Order"
  or the 🗑 delete icon — changes commit straight to `orders.json`.
- **Manually**: re-export your Excel sheet, regenerate `orders.json` in the
  same shape (array of objects, one per order row, using the same column
  names as in `app.js`'s `COLUMNS` list), then commit and push.
