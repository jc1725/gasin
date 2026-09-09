ALTER TABLE `products` ADD `familyKey` varchar(500);--> statement-breakpoint
CREATE INDEX `products_familyKey_idx` ON `products` (`familyKey`);