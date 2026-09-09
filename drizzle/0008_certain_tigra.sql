ALTER TABLE `products` ADD `deepLinkUrl` text;--> statement-breakpoint
ALTER TABLE `products` ADD `deepLinkStatus` enum('pending','ready','failed') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `deepLinkUpdatedAt` timestamp;--> statement-breakpoint
CREATE INDEX `products_deepLinkStatus_lastSeenAt_idx` ON `products` (`deepLinkStatus`,`lastSeenAt`);