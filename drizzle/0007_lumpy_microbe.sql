CREATE TABLE `manualLinkTracks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`linkKey` varchar(80) NOT NULL,
	`submittedUrl` text NOT NULL,
	`externalProductId` varchar(80) NOT NULL,
	`productId` int,
	`status` enum('waiting','active','rejected') NOT NULL DEFAULT 'waiting',
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `manualLinkTracks_id` PRIMARY KEY(`id`),
	CONSTRAINT `manualLinkTracks_user_linkKey_unique` UNIQUE(`userId`,`linkKey`)
);
--> statement-breakpoint
ALTER TABLE `manualLinkTracks` ADD CONSTRAINT `manualLinkTracks_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `manualLinkTracks` ADD CONSTRAINT `manualLinkTracks_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `manualLinkTracks_externalProductId_idx` ON `manualLinkTracks` (`externalProductId`);--> statement-breakpoint
CREATE INDEX `manualLinkTracks_status_createdAt_idx` ON `manualLinkTracks` (`status`,`createdAt`);