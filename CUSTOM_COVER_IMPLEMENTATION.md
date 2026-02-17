# Custom Cover Image Upload Implementation

## Overview
Implemented secure server-side custom cover image uploads for lists with automatic cleanup and lifecycle management.

## Files Created/Modified

### 1. Database Migration
**File**: `/opt/LeMedia/apps/web/migrations/022_custom_list_cover_image.sql`

Adds three new columns to the `custom_list` table:
- `custom_cover_image_path TEXT` - Relative path to uploaded image
- `custom_cover_image_size INTEGER` - Size in bytes for validation tracking
- `custom_cover_image_mime_type TEXT` - MIME type for serving correct content headers

Creates index for performance on image path column.

### 2. File Upload Utilities
**File**: `/opt/LeMedia/apps/web/src/lib/file-upload.ts`

Provides secure image upload functionality:
- **Validation**: File type, size, and magic byte verification
- **Supported formats**: JPEG, PNG, WebP, GIF (max 10MB)
- **Magic byte checking**: Prevents spoofed file extensions
- **Storage**: Saves to `/uploads/list-covers/` with user-scoped filenames
- **Cleanup**: Safe deletion with path validation

Key functions:
- `validateImageFile()` - Validates file before upload
- `saveUploadedImage()` - Persists file to disk
- `deleteUploadedImage()` - Safely removes uploaded files
- `getImagePublicUrl()` - Generates public URLs for API serving

### 3. Database Functions
**File**: `/opt/LeMedia/apps/web/src/db.ts` - Updated

New functions:
- `setCustomListCoverImage()` - Sets custom image and clears TMDB cover
- `removeCustomListCoverImage()` - Removes custom image and returns path for cleanup
- `deleteCustomList()` - Updated to return image path for cleanup
- `getCustomListById()`, `createCustomList()`, `updateCustomList()`, `listUserCustomLists()`, `getCustomListByShareId()` - All updated to include new custom image columns

Updated interface:
- `CustomList` interface now includes:
  - `customCoverImagePath: string | null`
  - `customCoverImageSize: number | null`
  - `customCoverImageMimeType: string | null`

### 4. API Endpoints

#### Upload/Delete Endpoint
**File**: `/opt/LeMedia/apps/web/app/api/v1/lists/[listId]/cover/route.ts`

- **POST** `/api/v1/lists/{listId}/cover` - Upload custom cover image
  - Accepts multipart form data with `image` field
  - Validates MIME type, file size, and signature
  - Automatically deletes old custom image if exists
  - Clears TMDB cover when setting custom image
  - Returns updated list object

- **DELETE** `/api/v1/lists/{listId}/cover` - Remove custom cover image
  - Removes custom image from database
  - Deletes uploaded file from disk
  - Returns updated list object

#### Image Serving Endpoint
**File**: `/opt/LeMedia/apps/web/app/api/v1/lists/[listId]/cover/image/route.ts`

- **GET** `/api/v1/lists/{listId}/cover/image?path=...` - Serve uploaded image
  - Validates path for security (prevents directory traversal)
  - Returns image with appropriate MIME type header
  - Sets cache headers for performance

### 5. Delete Endpoint Update
**File**: `/opt/LeMedia/apps/web/app/api/v1/lists/[listId]/route.ts` - Updated

- DELETE endpoint now handles cleanup of uploaded images when list is deleted
- Imports `deleteUploadedImage` utility
- Calls cleanup function for any custom image before deleting list

### 6. Frontend UI
**File**: `/opt/LeMedia/apps/web/src/components/Lists/ListDetailPageClient.tsx` - Updated

Added custom image upload section in Settings modal:
- File input for image selection (supports drag-drop in browser)
- Live preview of current custom image
- Easy removal button for existing images
- Upload status indicator
- Clear feedback messages
- Integrates with existing TMDB cover selection

New state:
- `uploading: boolean` - Upload progress flag

New handlers:
- `handleUploadCoverImage()` - Processes file upload and updates UI
- `handleRemoveCoverImage()` - Deletes custom image and updates UI
- Updated `handleSetCover()` - Clears custom image when TMDB cover is selected

Updated interface:
- `CustomList` interface includes custom image fields

## Security Features

1. **File Validation**
   - MIME type whitelist (JPEG, PNG, WebP, GIF only)
   - File size limits (1KB - 10MB)
   - Magic byte verification (prevents fake file extensions)

2. **Path Security**
   - Relative paths only in database
   - Full path validation in image serving endpoint
   - Directory traversal prevention

3. **Automatic Cleanup**
   - Old images deleted when new one uploaded
   - Files deleted when list is deleted
   - Safe error handling for missing files

4. **CSRF Protection**
   - All mutating endpoints require CSRF tokens
   - Uses existing `requireCsrf()` middleware

## Image Storage

**Location**: `/app/uploads/list-covers/`
**Format**: `list-{listId}-{uniqueId}.{ext}`
**Management**: Automatic cleanup via database functions

## Environment Variables

- `UPLOAD_BASE_DIR` - Base directory for uploads (default: `/app/uploads`)
- Ensure directory is writable by application process

## Usage Flow

1. **Upload Image**
   - Open list Settings modal
   - Click "Upload custom image" section
   - Select image file (JPEG, PNG, WebP, or GIF)
   - System downloads, validates, saves to disk
   - UI updates with preview and cached version

2. **View Image**
   - Custom image shows in list cover/header
   - Image served via `/api/v1/lists/{listId}/cover/image` endpoint
   - Cached with long-term expiration headers

3. **Remove Image**
   - Click "Remove custom image" button in Settings
   - File deleted from disk
   - Database updated
   - UI refreshed

4. **Cleanup on Delete**
   - When list is deleted, custom image automatically removed from disk
   - No orphaned files left behind

## Existing Features Preserved

- TMDB-based covers still work independently
- Setting TMDB cover automatically clears custom image
- Smooth UI transitions and feedback
- No breaking changes to existing functionality

## Next Steps (Optional Enhancements)

- Image compression/resizing for optimization
- Image cropping/aspect ratio adjustment in UI
- Batch upload for multiple lists
- Image gallery/thumbnail preview
- Share custom images with other users
