# Pending Orders Tracker

A static, no-build web app for viewing and managing your pending orders sheet.
Built from `Pending_Order__Organized__1 (1).xlsx` — all 165 valid order rows,
all original 20 columns preserved, plus a new **Expected Delivery Date** column.

## Files
- `index.html` — page structure
- `style.css` — styling, frozen columns, status colors
- `app.js` — all logic (sort, filter, pagination, editing)
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
  starts empty; values you enter are saved in the browser (`localStorage`),
  per visitor/browser — not synced to the spreadsheet.

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
Re-export your Excel sheet and regenerate `orders.json` in the same shape
(array of objects, one per order row, using the same column names as in
`app.js`'s `COLUMNS` list), then commit and push — GitHub Pages will pick it
up automatically. If you add the "Expected Delivery Date" column properly to
the spreadsheet later, you can drop the `localStorage`-based editing and just
include that field in `orders.json` directly.
