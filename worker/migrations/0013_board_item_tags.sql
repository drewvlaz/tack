CREATE TABLE `board_item_tags` (
	`board_item_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`board_item_id`, `name`),
	FOREIGN KEY (`board_item_id`) REFERENCES `board_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `board_item_tags_name_idx` ON `board_item_tags` (`name`);