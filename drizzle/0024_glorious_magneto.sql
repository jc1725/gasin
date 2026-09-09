CREATE TABLE `productRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyword` varchar(160) NOT NULL,
	`normalizedKeyword` varchar(160) NOT NULL,
	`requestCount` int NOT NULL DEFAULT 1,
	`status` enum('pending','reviewing','added','dismissed') NOT NULL DEFAULT 'pending',
	`firstRequestedAt` timestamp NOT NULL DEFAULT (now()),
	`lastRequestedAt` timestamp NOT NULL DEFAULT (now()),
	`reviewedAt` timestamp,
	CONSTRAINT `productRequests_id` PRIMARY KEY(`id`),
	CONSTRAINT `productRequests_keyword_unique` UNIQUE(`normalizedKeyword`)
);
--> statement-breakpoint
CREATE INDEX `productRequests_status_lastRequestedAt_idx` ON `productRequests` (`status`,`lastRequestedAt`);