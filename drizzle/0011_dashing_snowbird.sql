ALTER TABLE `products` ADD `refreshState` enum('fresh','deferred','not_in_goldbox') DEFAULT 'fresh' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `lastRefreshReason` text;