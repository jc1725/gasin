CREATE TABLE `goodViaEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`productId` int,
	`source` enum('product','url') NOT NULL DEFAULT 'product',
	`dayKey` varchar(10) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `goodViaEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `goodViaEvents_user_product_day_unique` UNIQUE(`userId`,`productId`,`dayKey`)
);
--> statement-breakpoint
ALTER TABLE `goodViaEvents` ADD CONSTRAINT `goodViaEvents_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `goodViaEvents` ADD CONSTRAINT `goodViaEvents_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `goodViaEvents_createdAt_idx` ON `goodViaEvents` (`createdAt`);--> statement-breakpoint
CREATE INDEX `goodViaEvents_user_createdAt_idx` ON `goodViaEvents` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `goodViaEvents_product_createdAt_idx` ON `goodViaEvents` (`productId`,`createdAt`);