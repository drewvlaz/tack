-- Add `updated_at` to the two tables that didn't have it, so every row inherits
-- baseColumns() {id, createdAt, updatedAt}. NOT NULL with DEFAULT 0 to satisfy
-- the constraint when SQLite adds the column; the UPDATE backfills to created_at
-- so existing rows have a sensible value before any code reads it.

ALTER TABLE `boards` ADD `updated_at` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `boards` SET `updated_at` = `created_at`;
--> statement-breakpoint
ALTER TABLE `item_images` ADD `updated_at` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `item_images` SET `updated_at` = `created_at`;
