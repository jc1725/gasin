CREATE TABLE `userConfirmedPrices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`productId` int NOT NULL,
	`price` int NOT NULL,
	`checkedAt` timestamp NOT NULL,
	`sourceUrl` text NOT NULL,
	`note` text,
	`importKey` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `userConfirmedPrices_id` PRIMARY KEY(`id`),
	CONSTRAINT `userConfirmedPrices_user_importKey_unique` UNIQUE(`userId`,`importKey`)
);
--> statement-breakpoint
ALTER TABLE `googleDriveConnections` ADD `userPriceCsvFileId` varchar(255);--> statement-breakpoint
ALTER TABLE `userConfirmedPrices` ADD CONSTRAINT `userConfirmedPrices_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userConfirmedPrices` ADD CONSTRAINT `userConfirmedPrices_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `userConfirmedPrices_user_product_checked_idx` ON `userConfirmedPrices` (`userId`,`productId`,`checkedAt`);