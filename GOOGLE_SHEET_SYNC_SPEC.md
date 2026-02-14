
# Function Specification: Smart Lens Sync to Google Sheets (GAS Deep Sync)

## 1. Overview
This specification defines the two-way synchronization logic between Smart Lens and Google Sheets. The system adopts a "lightweight local cache, full cloud storage" strategy, limiting local mobile records to 256 entries while using Google Sheets as the permanent database.

## 2. Technical Architecture
- **Protocol**: 
    - `POST`: For adding or updating data (Upsert).
    - `GET`: For pulling the full cloud list (Restore/Pull).
- **Identifier**: Each scan uses a unique `id` (random string) as the primary key.
- **Storage Limit**: Local `localStorage` only retains the latest 256 records.

## 3. Sync Scenarios and Logic

| Scenario | Status Description | Action |
| :--- | :--- | :--- |
| **A. New Sync** | Local has a new scan, Cloud does not have it yet. | **Push**: Send POST and mark as `Synced`. |
| **B. Local Pruning** | Local records exceed 256. | **Prune**: Automatically remove the oldest "synced" local records. |
| **C. Deep Retrieval** | User needs to view data beyond the 256 local records. | **Fetch All**: Call `GET` to retrieve full cloud data and display it temporarily in UI. |
| **D. Content Update** | Local record name is modified. | **Update**: POST with the same ID to update the corresponding row in the cloud. |
| **E. Cloud Deletion** | Cloud row was manually deleted. | **Re-sync**: During full sync, if ID is missing from cloud, reset local status to `Pending` to re-upload. |

## 4. Google Apps Script Code
The code is extracted to a separate file: `google-apps-script.js`. Please paste the content into the Google Apps Script editor for deployment.

## 5. Local Capacity Management Logic (LIFO + Sync Check)

When local record count $N > 256$, follow this flow:
1.  **Filter**: Identify all items where `syncStatus === 'synced'`.
2.  **Sort**: Sort by `timestamp`.
3.  **Remove**: Delete the oldest items until count reaches 256.
4.  **Protection**: Items not yet synced (`Pending` or `Error`) are **strictly prohibited from deletion** to prevent data loss.

## 6. UI/UX Deep History Access Design

### 6.1 Layered History Display
- **Regular View**: Load 256 local entries.
- **Bottom Button**: Show "🔍 Load More from Cloud" at the bottom of the list.

### 6.2 Cloud Sync Indicators
- **Synced (✅)**: Exists locally and confirmed in cloud.
- **Cloud-Only (🌐)**: Items fetched via "Load More" that do not exist in local storage.

## 7. Sync Operation Flow

### 7.1 "Full Sync" (Restore & Sync)
- When changing phones, click "Full Sync" in settings.
- The app uploads local changes, detects missing cloud entries, and downloads all cloud records (keeping only the latest 256 locally).

### 7.2 Automatic Pruning Mechanism
- Background pruning runs after every scan or app launch to maintain startup speed.

## 8. Edge Case Prevention
- **Storage Limit**: Monitors `localStorage` quota.
- **ID Consistency**: Relies strictly on IDs. If a user deletes a row in Google Sheets, the app will detect the missing ID during Full Sync and mark the local item as `Pending` for re-upload.

## 9. Sync Mode Detailed Behaviors

### 9.1 Push Only
- **Behavior**: Uploads only local records marked as "Pending" or "Error".
- **Best for**: Quickly backing up new scans while saving data.
- **Feedback**:
    - If changes exist: `📤 Push complete! Successfully uploaded X changes.`
    - If no changes: `✅ All local records are synced to the cloud.`

### 9.2 Full Sync
- **Behavior**: First pushes local changes, then downloads the full cloud dataset for audit and merge.
- **Merge Rules**:
    - New Cloud ID -> **Add** to local.
    - ID Collision -> **Overwrite local with cloud** (Cloud is the "Source of Truth").
    - Local "Synced" but missing on Cloud -> **Reset to `Pending`** (To re-push missing items).
- **Best for**: Device migration, manual data auditing, or fixing desynchronization.
- **Feedback**: Detailed report popup.
    - `📤 Successfully Pushed`: Number of items uploaded.
    - `📥 Added from Cloud`: New records pulled down.
    - `🔄 Updated from Cloud`: Existing records refreshed.
    - `🛠️ Fixed Cloud Missing`: Items found missing on cloud and reset to pending.
