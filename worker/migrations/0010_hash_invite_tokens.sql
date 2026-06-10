-- Hash invite tokens at rest. The raw token still lives in the URL the
-- inviter shares; the DB only stores SHA-256 hex of the raw token. A leak
-- of board_invites no longer exposes redeemable links.
--
-- Existing rows are dropped: there's no way to backfill `token_hash` from
-- the cleartext column without keeping the cleartext (which is the smell
-- we're removing). Invites are one-shot anyway — any in-flight link goes
-- stale at deploy time. Owners regenerate as needed.

DELETE FROM `board_invites`;
--> statement-breakpoint
DROP INDEX `board_invites_token_unique`;
--> statement-breakpoint
ALTER TABLE `board_invites` ADD `token_hash` text NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `board_invites_token_hash_unique` ON `board_invites` (`token_hash`);
--> statement-breakpoint
ALTER TABLE `board_invites` DROP COLUMN `token`;
