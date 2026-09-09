ALTER TABLE `products` ADD `lastViewedAt` timestamp;--> statement-breakpoint
CREATE INDEX `products_trackingPriority_lastViewedAt_idx` ON `products` (`trackingPriority`,`lastViewedAt`);