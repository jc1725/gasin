CREATE TABLE `productCandidates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`source` enum('csv_upload','drive_csv') NOT NULL,
	`sourceKey` varchar(64) NOT NULL,
	`name` varchar(500) NOT NULL,
	`optionLabel` varchar(500),
	`sourceUrl` text,
	`notes` text,
	`status` enum('pending','sent_to_tracking','dismissed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `productCandidates_id` PRIMARY KEY(`id`),
	CONSTRAINT `productCandidates_user_sourceKey_unique` UNIQUE(`userId`,`sourceKey`)
);
--> statement-breakpoint
ALTER TABLE `googleDriveConnections` ADD `candidateCsvFileId` varchar(255);--> statement-breakpoint
ALTER TABLE `productCandidates` ADD CONSTRAINT `productCandidates_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `productCandidates_user_status_updated_idx` ON `productCandidates` (`userId`,`status`,`updatedAt`);