CREATE TABLE `categoryBestProducts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryId` int NOT NULL,
	`productId` int NOT NULL,
	`position` int NOT NULL,
	`collectedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `categoryBestProducts_id` PRIMARY KEY(`id`),
	CONSTRAINT `categoryBestProducts_category_product_unique` UNIQUE(`categoryId`,`productId`)
);
--> statement-breakpoint
ALTER TABLE `products` MODIFY COLUMN `source` enum('goldbox','search','bestcategory') NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduleSettings` MODIFY COLUMN `jobKey` enum('goldbox','bestcategory','price','retention') NOT NULL;--> statement-breakpoint
ALTER TABLE `syncRuns` MODIFY COLUMN `jobType` enum('goldbox','bestcategory','price','retention','drive','search','deeplink') NOT NULL;--> statement-breakpoint
ALTER TABLE `categoryBestProducts` ADD CONSTRAINT `categoryBestProducts_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `categoryBestProducts_category_position_idx` ON `categoryBestProducts` (`categoryId`,`position`);--> statement-breakpoint
CREATE INDEX `categoryBestProducts_product_idx` ON `categoryBestProducts` (`productId`);