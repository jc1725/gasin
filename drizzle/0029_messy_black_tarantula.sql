ALTER TABLE `collectedPriceHistory` MODIFY COLUMN `price` int NULL;--> statement-breakpoint
ALTER TABLE `collectedPriceHistory` ADD `imageUrl` text;--> statement-breakpoint
ALTER TABLE `collectedPriceHistory` ADD `optionName` varchar(500);--> statement-breakpoint
ALTER TABLE `collectedPriceHistory` ADD `capacityText` varchar(80);--> statement-breakpoint
ALTER TABLE `collectedPriceHistory` ADD `quantity` int;--> statement-breakpoint
ALTER TABLE `collectedPriceHistory` ADD `inStock` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `quantity` int;--> statement-breakpoint
ALTER TABLE `products` ADD `optionMetadataSource` enum('manual','collection') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `inStock` boolean DEFAULT true NOT NULL;
