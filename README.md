# IT Asset Management — Production Package

## Architecture
**HTML/CSS/JS frontend → Google Apps Script Web App API → Google Sheets database**

Included:
- `index.html`
- `css/style.css`
- `js/app.js`
- `Code.gs`
- `appsscript.json`
- `Google_Sheets_Setup.md`

## Important security note
This package uses server-side role validation and salted SHA-256 passwords. For a small internal system this is practical, but the strongest deployment is still a Google Workspace/domain-restricted Apps Script Web App with HTTPS and controlled accounts.

**Before production:**
1. Replace the Spreadsheet ID in `Code.gs`.
2. Run `setup()` once.
3. Change the demo admin password.
4. Do not leave the demo password active.
5. Restrict the Apps Script deployment to the intended users/domain where possible.
6. Keep backups outside the live sheet.
7. Use HTTPS hosting for the frontend.

## Frontend API
Open `js/app.js` and set:
`const API_URL = "YOUR_APPS_SCRIPT_EXEC_URL";`

If `API_URL` is empty, the UI runs in offline demo mode using browser localStorage. Demo mode is for testing only and is not the production database.

## Features
- Auto Asset ID `IT-0001` style, never reused
- Asset CRUD with Admin-only edit/delete
- Normal User: add asset, change status, view assets/repairs, add repair, backup, exports
- Repair history and completed repair cost
- Auto repair creation when an asset moves to Under Repair
- Completed/Returned repair requires Return Date
- Repair completion automatically sets asset Active
- 120-day Laptop/Desktop completed-repair analytics
- Warranty expired and next-60-day analytics
- Dashboard KPIs and repair analytics
- Excel import with duplicate skip list
- Excel export using SheetJS
- Print / browser Save as PDF
- JSON backup and Admin restore
- Admin user/master-data management
- Audit log
- Server-side authorization

## Demo
The Apps Script `setup()` creates:
- admin@example.com / admin123

Change this immediately after setup.


## v3 Assets list update
Assets list/details now include Purchase Date, Purchase Amount, Serial No., and Last Repair Date. Last Repair Date is based on the latest completed repair record.
