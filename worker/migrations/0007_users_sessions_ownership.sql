CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`email` text NOT NULL,
	`password_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
-- Add `owner_id` as nullable to preserve existing rows (see worker/CLAUDE.md
-- "Migrations must preserve existing data"). A follow-up migration tightens it
-- to NOT NULL once existing rows are backfilled with a real owner. Until then,
-- services treat NULL owner_id as "unscoped, invisible to every user" — safe
-- default that won't leak legacy data across the new auth boundary.
ALTER TABLE `boards` ADD `owner_id` text REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `boards_owner_id_idx` ON `boards` (`owner_id`);--> statement-breakpoint
ALTER TABLE `items` ADD `owner_id` text REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `items_owner_id_idx` ON `items` (`owner_id`);
