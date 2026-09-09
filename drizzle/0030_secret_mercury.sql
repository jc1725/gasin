ALTER TABLE `products` ADD `lastRefreshAttemptAt` timestamp;--> statement-breakpoint
ALTER TABLE `products` ADD `lastRefreshAttemptAt` timestamp;--> statement-breakpoint
ALTER TABLE `products` ADD `nextRefreshAt` timestamp;--> statement-breakpoint
CREATE INDEX `products_search_refresh_queue_idx` ON `products` (`source`,`refreshState`,`nextRefreshAt`);
