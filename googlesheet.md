# Google Sheets Integration Feature

## Goal
When a user submits the Project Delivery form, append one new row to a Google Sheet.

## Requirements
- Existing Google Sheet headers exactly match form field names.
- Use Google Sheets API with a Service Account.
- Read credentials from `GOOGLE_SERVICE_ACCOUNT_JSON`.
- Read sheet ID from `LIVE_PROJECTS_WRITE_SHEET_ID`.
- Read tab from `LIVE_PROJECTS_WRITE_TAB`.
- On form submit:
  1. Validate input.
  2. Build row values in the same order as the sheet headers.
  3. Append the row using the Google Sheets API.
  4. Return success/error to the frontend.
- Never overwrite existing rows.

## Suggested implementation
- Backend endpoint: POST `/api/live-projects`
- Use the official `googleapis` npm package.
- Authenticate with the service account JSON.
- Use `spreadsheets.values.append` with `USER_ENTERED`.

## Environment
GOOGLE_SERVICE_ACCOUNT_JSON=<json>
LIVE_PROJECTS_WRITE_SHEET_ID=<spreadsheet id>
LIVE_PROJECTS_WRITE_TAB=Live Projects

## Acceptance criteria
- Every successful submission creates exactly one new row.
- Columns map correctly to form fields.
- Proper error handling and logging.
