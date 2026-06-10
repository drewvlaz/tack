-- Folds `items` and `item_images` into `board_items` + `board_item_images`.
-- After this migration:
--   - every placement carries its own metadata + image set (no shared item)
--   - access is purely board-scoped (owner OR member); no uploader axis
--   - `added_by` is informational attribution, SET NULL on user delete
--
-- Data is preserved: backfill from the old tables BEFORE dropping them.
-- The invariant we rely on is that `addBoardItem` historically created
-- exactly one (items, board_items) pair per paste (1:1), so the join in
-- step 3 produces one row per existing placement.

-- 1. New board_item_images table, FK to board_items (board_items still
-- holds the OLD shape at this point; that's fine — FK targets table id).
CREATE TABLE `board_item_images` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`board_item_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`source_url` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`board_item_id`) REFERENCES `board_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `board_item_images_board_item_id_idx` ON `board_item_images` (`board_item_id`);
--> statement-breakpoint

-- 2. New shape for board_items, parallel to the old. We can't ALTER TABLE
-- DROP COLUMN on `item_id` (it's a FK target), so we recreate via the
-- standard SQLite table-replacement dance.
CREATE TABLE `__new_board_items` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`board_id` text NOT NULL,
	`added_by` text,
	`source_url` text NOT NULL,
	`title` text,
	`brand` text,
	`description` text,
	`price` real,
	`currency` text DEFAULT 'USD' NOT NULL,
	`details` text,
	`primary_image_id` text,
	`x` real DEFAULT 0 NOT NULL,
	`y` real DEFAULT 0 NOT NULL,
	`width` real DEFAULT 220 NOT NULL,
	`height` real DEFAULT 400 NOT NULL,
	`z_index` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint

-- 3. Backfill placement metadata by joining board_items × items.
-- items.ownerId becomes board_items.added_by (attribution only — security
-- is now board-scoped). currency falls back to 'USD' to satisfy NOT NULL.
INSERT INTO `__new_board_items` (
	id, created_at, updated_at, deleted_at, board_id, added_by,
	source_url, title, brand, description, price, currency, details,
	primary_image_id, x, y, width, height, z_index
)
SELECT
	bi.id,
	bi.created_at,
	bi.updated_at,
	bi.deleted_at,
	bi.board_id,
	i.owner_id,
	i.source_url,
	i.title,
	i.brand,
	i.description,
	i.price,
	COALESCE(i.currency, 'USD'),
	i.details,
	i.primary_image_id,
	bi.x,
	bi.y,
	bi.width,
	bi.height,
	bi.z_index
FROM `board_items` bi
INNER JOIN `items` i ON i.id = bi.item_id;
--> statement-breakpoint

-- 4. Backfill images. Re-use item_images.id as the new board_item_images.id
-- so the primary_image_id pointer we just copied still resolves. The join
-- to board_items maps the old item_id pointer to the placement id.
INSERT INTO `board_item_images` (
	id, created_at, updated_at, deleted_at, board_item_id, r2_key, source_url, display_order
)
SELECT
	ii.id,
	ii.created_at,
	ii.updated_at,
	ii.deleted_at,
	bi.id,
	ii.r2_key,
	ii.source_url,
	ii.display_order
FROM `item_images` ii
INNER JOIN `board_items` bi ON bi.item_id = ii.item_id;
--> statement-breakpoint

-- 5. Drop old tables. FK pragma off so the table swap doesn't trip the
-- board_items FK held by other tables (board_item_images was just created
-- pointing at the old board_items name, which we're about to rename).
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
DROP TABLE `item_images`;
--> statement-breakpoint
DROP TABLE `items`;
--> statement-breakpoint
DROP TABLE `board_items`;
--> statement-breakpoint
ALTER TABLE `__new_board_items` RENAME TO `board_items`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint

-- 6. Indexes on the renamed table.
CREATE INDEX `board_items_board_id_idx` ON `board_items` (`board_id`);
--> statement-breakpoint
CREATE INDEX `board_items_added_by_idx` ON `board_items` (`added_by`);
