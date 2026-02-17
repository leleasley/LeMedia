-- Migration: 022_custom_list_cover_image
-- Description: Add custom cover image support for lists
-- Created: 2026-02-20

-- Add custom_cover_image_path column to store uploaded file path
ALTER TABLE custom_list ADD COLUMN IF NOT EXISTS custom_cover_image_path TEXT;
ALTER TABLE custom_list ADD COLUMN IF NOT EXISTS custom_cover_image_size INTEGER;
ALTER TABLE custom_list ADD COLUMN IF NOT EXISTS custom_cover_image_mime_type TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_custom_list_cover_image ON custom_list(custom_cover_image_path) WHERE custom_cover_image_path IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN custom_list.custom_cover_image_path IS 'Path to uploaded custom cover image, relative to upload directory';
COMMENT ON COLUMN custom_list.custom_cover_image_size IS 'Size of uploaded image in bytes';
COMMENT ON COLUMN custom_list.custom_cover_image_mime_type IS 'MIME type of uploaded image (image/jpeg, image/png, etc)';
