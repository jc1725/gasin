CREATE TABLE `searchEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`keyword` varchar(160) NOT NULL,
	`resultSource` varchar(32) NOT NULL,
	`resultCount` int NOT NULL,
	`searchedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `searchEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `searchEvents` ADD CONSTRAINT `searchEvents_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `searchEvents_searchedAt_idx` ON `searchEvents` (`searchedAt`);--> statement-breakpoint
CREATE INDEX `searchEvents_user_searchedAt_idx` ON `searchEvents` (`userId`,`searchedAt`);