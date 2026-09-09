CREATE TABLE `favorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`productId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `favorites_id` PRIMARY KEY(`id`),
	CONSTRAINT `favorites_user_product_unique` UNIQUE(`userId`,`productId`)
);
--> statement-breakpoint
CREATE TABLE `priceHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`price` int NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `priceHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalProductId` varchar(40) NOT NULL,
	`name` text NOT NULL,
	`imageUrl` text NOT NULL,
	`affiliateUrl` text NOT NULL,
	`categoryName` varchar(255),
	`currentPrice` int NOT NULL,
	`lowestPrice` int NOT NULL,
	`source` enum('goldbox','search') NOT NULL,
	`isRocket` boolean NOT NULL DEFAULT false,
	`isFreeShipping` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`firstSeenAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_externalProductId_unique` UNIQUE(`externalProductId`)
);
--> statement-breakpoint
CREATE TABLE `scheduleSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobKey` enum('goldbox','price','retention') NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`lastCompletedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduleSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `scheduleSettings_jobKey_unique` UNIQUE(`jobKey`)
);
--> statement-breakpoint
CREATE TABLE `syncRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobType` enum('goldbox','price','retention','drive') NOT NULL,
	`status` enum('running','success','failed') NOT NULL DEFAULT 'running',
	`processedCount` int NOT NULL DEFAULT 0,
	`detail` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	CONSTRAINT `syncRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `priceHistory` ADD CONSTRAINT `priceHistory_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `favorites_user_created_idx` ON `favorites` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `priceHistory_product_recorded_idx` ON `priceHistory` (`productId`,`recordedAt`);--> statement-breakpoint
CREATE INDEX `products_source_lastSeenAt_idx` ON `products` (`source`,`lastSeenAt`);--> statement-breakpoint
CREATE INDEX `scheduleSettings_task_uid_idx` ON `scheduleSettings` (`scheduleCronTaskUid`);--> statement-breakpoint
CREATE INDEX `syncRuns_job_started_idx` ON `syncRuns` (`jobType`,`startedAt`);