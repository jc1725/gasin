CREATE TABLE `missingSearches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyword` varchar(160) NOT NULL,
	`normalizedKeyword` varchar(160) NOT NULL,
	`searchCount` int NOT NULL DEFAULT 1,
	`firstSearchedAt` timestamp NOT NULL DEFAULT (now()),
	`lastSearchedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `missingSearches_id` PRIMARY KEY(`id`),
	CONSTRAINT `missingSearches_keyword_unique` UNIQUE(`normalizedKeyword`)
);
--> statement-breakpoint
CREATE INDEX `missingSearches_lastSearchedAt_idx` ON `missingSearches` (`lastSearchedAt`);