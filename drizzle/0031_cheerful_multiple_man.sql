CREATE TABLE `smartstoreHotDeals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(500) NOT NULL,
	`storeName` varchar(160) NOT NULL DEFAULT '스마트스토어',
	`description` text,
	`imageUrl` text,
	`purchaseUrl` varchar(2000) NOT NULL,
	`regularPrice` int,
	`salePrice` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`startsAt` timestamp,
	`endsAt` timestamp,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `smartstoreHotDeals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `smartstoreHotDeals` ADD CONSTRAINT `smartstoreHotDeals_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `smartstoreHotDeals_public_idx` ON `smartstoreHotDeals` (`isActive`,`startsAt`,`endsAt`);--> statement-breakpoint
CREATE INDEX `smartstoreHotDeals_sort_created_idx` ON `smartstoreHotDeals` (`sortOrder`,`createdAt`);