CREATE TABLE `donationLedger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`earnMonth` varchar(7) NOT NULL,
	`status` enum('accruing','payout_pending','paid','donated') NOT NULL DEFAULT 'payout_pending',
	`expectedPayoutDate` varchar(10),
	`payoutNetKrw` int,
	`payoutReceivedDate` varchar(10),
	`donationRatePct` int NOT NULL DEFAULT 30,
	`donationKrw` int,
	`donatedDate` varchar(10),
	`recipientName` varchar(200),
	`proofUrl` varchar(2000),
	`note` varchar(1000),
	`showAmounts` boolean NOT NULL DEFAULT false,
	`isPublished` boolean NOT NULL DEFAULT false,
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `donationLedger_id` PRIMARY KEY(`id`),
	CONSTRAINT `donationLedger_earnMonth_unique` UNIQUE(`earnMonth`)
);
--> statement-breakpoint
ALTER TABLE `donationLedger` ADD CONSTRAINT `donationLedger_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;