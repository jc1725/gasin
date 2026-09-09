CREATE TABLE `collectedPriceHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalProductId` varchar(80) NOT NULL,
	`name` text NOT NULL,
	`brand` varchar(255) NOT NULL,
	`price` int NOT NULL,
	`url` text NOT NULL,
	`pageType` varchar(100) NOT NULL,
	`source` varchar(64) NOT NULL,
	`collectedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `collectedPriceHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `collectedPriceHistory_product_collected_idx` ON `collectedPriceHistory` (`externalProductId`,`collectedAt`);