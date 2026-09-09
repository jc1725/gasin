CREATE TABLE `searchApiQuotas` (
	`scope` varchar(32) NOT NULL,
	`windowStartedAt` timestamp NOT NULL,
	`callCount` int NOT NULL DEFAULT 0,
	`lastCallAt` timestamp,
	`blockedUntil` timestamp,
	`lastError` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `searchApiQuotas_scope` PRIMARY KEY(`scope`)
);
--> statement-breakpoint
CREATE TABLE `searchCaches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`normalizedKeyword` varchar(160) NOT NULL,
	`productIdsJson` text NOT NULL,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`lastServedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `searchCaches_id` PRIMARY KEY(`id`),
	CONSTRAINT `searchCaches_keyword_unique` UNIQUE(`normalizedKeyword`)
);
--> statement-breakpoint
CREATE INDEX `searchCaches_expiresAt_idx` ON `searchCaches` (`expiresAt`);