ALTER TABLE `products` ADD `deactivatedAt` timestamp;--> statement-breakpoint
CREATE INDEX `products_isActive_deactivatedAt_idx` ON `products` (`isActive`,`deactivatedAt`);