CREATE TABLE `googleDriveConnections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`refreshTokenCiphertext` text NOT NULL,
	`folderId` varchar(255) NOT NULL,
	`snapshotFileId` varchar(255),
	`connectedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `googleDriveConnections_id` PRIMARY KEY(`id`),
	CONSTRAINT `googleDriveConnections_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `googleDriveConnections` ADD CONSTRAINT `googleDriveConnections_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `googleDriveConnections_updatedAt_idx` ON `googleDriveConnections` (`updatedAt`);