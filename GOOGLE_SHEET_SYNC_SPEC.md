# Function Specification: Smart Lens Sync to Google Sheets

## 1. Overview
This specification defines the synchronization logic between the Smart Lens web application and Google Sheets via Google Apps Script (GAS). The system utilizes a "local-first with cloud master" strategy, ensuring offline availability while maintaining data persistence across sessions and devices.

## 2. Technical Architecture

### 2.1 Protocol & Data Format
- **PULL (GET)**: Used to retrieve the full list of records from the spreadsheet.
    - URL Parameter: `token=[SECRET_KEY]` for authentication.
    - Response: JSON array of `ScanResult` objects OR error JSON.
- **PUSH (POST)**: Used to upload one or more records.
    - **Crucial Tech Note**: To avoid CORS Preflight (`OPTIONS` request) which GAS does not support, we use `Content-Type: text/plain`. This classifies the POST as a "Simple Request", allowing the browser to read the response body after the mandatory Google redirect.
    - Data Structure (Body as JSON String):
      ```json
      {
        "token": "YOUR_SECRET_KEY",
        "items": [
          { "id": "...", "data": "...", "timestamp": 12345, "type": "...", "name": "..." }
        ]
      }
      ```

### 2.2 Identification
- **Primary Key**: The `id` field (generated locally) is the unique identifier.
- **Conflict Resolution**: The Cloud is the "Source of Truth". If an ID exists on both sides, the Cloud data overwrites local data during a Pull.

## 3. Sync Operations

### 3.1 PUSH (Local -> Cloud)
- **Automatic Sync**: Triggered immediately in the following scenarios:
    1.  After a successful scan (New record).
    2.  After editing a record's properties (e.g., updating a Name/Alias).
- **Batch Push**: Manual trigger in settings that identifies all records where `syncStatus !== 'synced'`.
- **Implementation**: The backend performs an "upsert" (Update or Insert) based on the `id`.

### 3.2 PULL (Cloud -> Local Audit & Merge)
The PULL operation follows a strict auditing sequence to maintain integrity:
1.  **Restore**: Cloud records missing locally are downloaded (supporting multi-device sync).
2.  **Update**: Matching IDs are updated with cloud content (names, corrected data).
3.  **Audit Reset**: If a local item is marked as `synced` but is no longer present on the Cloud (e.g., manually deleted from the Sheet), it is reset to `pending` so the user can decide to push it back or delete it.

## 4. Platform Constraints & Error Handling (200-Wrapping)

### 4.1 Google Apps Script Limitations
Google Apps Script (GAS) has two major architectural limitations regarding API development:
1.  **Redirects**: GAS endpoints automatically redirect (`302`) to a temporary Google user-content domain. 
2.  **CORS & Status Codes**: When returning non-200 status codes (like `401 Unauthorized`), the Google redirect service often drops CORS headers, causing the browser to block the response body and report a generic "CORS Error".

### 4.2 The "200-Wrapping" Workaround
To ensure the web app can reliably detect authentication failures and provide user feedback:
- **Strategy**: The backend **always** returns an HTTP `200 OK` status code.
- **Data Structure**: The actual success or failure state is encapsulated within the JSON response body using a `status` field.
  - **Success**: Returns the data directly (for GET) or `{"status": "success", ...}` (for POST).
  - **Error**: Returns `{"status": "error", "message": "Unauthorized"}` or similar.

## 5. Security
- Access to both `doGet` and `doPost` requires a `WEBHOOK_TOKEN` match. 
- Authentication fails if the provided token is missing or incorrect.

## 6. User Feedback
- **Token Validation**: The client parses every JSON response. If `res.status === "error"`, it triggers an immediate "Invalid Sync Token!" alert.
- **Visual Indicators**: Sync errors are displayed in the history list to notify users of pending uploads that failed due to authentication.