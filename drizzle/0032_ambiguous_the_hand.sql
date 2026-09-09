ALTER TABLE `users` ADD `isSuspended` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `suspendedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `suspensionReason` varchar(500);