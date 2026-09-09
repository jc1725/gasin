CREATE TABLE `webPushSubscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`endpointHash` varchar(64) NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` varchar(255) NOT NULL,
	`auth` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `webPushSubscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `webPushSubscriptions_endpointHash_unique` UNIQUE(`endpointHash`)
);
--> statement-breakpoint
ALTER TABLE `webPushSubscriptions` ADD CONSTRAINT `webPushSubscriptions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `webPushSubscriptions_user_updated_idx` ON `webPushSubscriptions` (`userId`,`updatedAt`);