-- Migration: Add domain field to users table
-- Date: 2025-10-30
-- Description: Add domain column to track which environment (test/prod) user registered from

-- Add domain column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'domain'
    ) THEN
        ALTER TABLE users ADD COLUMN domain VARCHAR(50) DEFAULT 'prod';
        
        -- Update existing users to 'prod' (default)
        UPDATE users SET domain = 'prod' WHERE domain IS NULL;
        
        RAISE NOTICE 'Column domain added to users table';
    ELSE
        RAISE NOTICE 'Column domain already exists in users table';
    END IF;
END $$;
