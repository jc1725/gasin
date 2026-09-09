CREATE TABLE `targetPriceAlertLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`productId` int NOT NULL,
	`favoriteId` int NOT NULL,
	`targetPriceVersion` int NOT NULL,
	`targetPrice` int NOT NULL,
	`currentPrice` int NOT NULL,
	`deliveryStatus` enum('reserved','sent','failed') NOT NULL DEFAULT 'reserved',
	`attemptedAt` timestamp NOT NULL DEFAULT (now()),
	`sentAt` timestamp,
	`failureReason` text,
	CONSTRAINT `targetPriceAlertLogs_id` PRIMARY KEY(`id`),
	CONSTRAINT `targetPriceAlertLogs_favorite_version_unique` UNIQUE(`favoriteId`,`targetPriceVersion`)
);
--> statement-breakpoint
ALTER TABLE `favorites` ADD `targetPrice` int;--> statement-breakpoint
ALTER TABLE `favorites` ADD `targetPriceVersion` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `targetPriceAlertLogs` ADD CONSTRAINT `targetPriceAlertLogs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `targetPriceAlertLogs` ADD CONSTRAINT `targetPriceAlertLogs_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `targetPriceAlertLogs_product_attempted_idx` ON `targetPriceAlertLogs` (`productId`,`attemptedAt`);--> statement-breakpoint
CREATE INDEX `targetPriceAlertLogs_user_attempted_idx` ON `targetPriceAlertLogs` (`userId`,`attemptedAt`);