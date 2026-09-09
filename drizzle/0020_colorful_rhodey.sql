CREATE TABLE `priceAlertLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`productId` int NOT NULL,
	`favoriteId` int NOT NULL,
	`favoriteCreatedAt` timestamp NOT NULL,
	`currentPrice` int NOT NULL,
	`lowestPrice24h` int NOT NULL,
	`deliveryStatus` enum('reserved','sent','failed') NOT NULL DEFAULT 'reserved',
	`attemptedAt` timestamp NOT NULL DEFAULT (now()),
	`sentAt` timestamp,
	`failureReason` text,
	CONSTRAINT `priceAlertLogs_id` PRIMARY KEY(`id`),
	CONSTRAINT `priceAlertLogs_favorite_period_unique` UNIQUE(`favoriteId`)
);
--> statement-breakpoint
ALTER TABLE `priceAlertLogs` ADD CONSTRAINT `priceAlertLogs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `priceAlertLogs` ADD CONSTRAINT `priceAlertLogs_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `priceAlertLogs_product_attempted_idx` ON `priceAlertLogs` (`productId`,`attemptedAt`);--> statement-breakpoint
CREATE INDEX `priceAlertLogs_user_attempted_idx` ON `priceAlertLogs` (`userId`,`attemptedAt`);