CREATE TABLE `priceTrackingMetrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int,
	`runId` int,
	`source` varchar(32) NOT NULL,
	`outcome` enum('matched','unmatched','collector_resolved','api_error','rate_limited') NOT NULL,
	`apiCalls` int NOT NULL DEFAULT 0,
	`durationMs` int NOT NULL DEFAULT 0,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `priceTrackingMetrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `priceTrackingMetrics` ADD CONSTRAINT `priceTrackingMetrics_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `priceTrackingMetrics` ADD CONSTRAINT `priceTrackingMetrics_runId_syncRuns_id_fk` FOREIGN KEY (`runId`) REFERENCES `syncRuns`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `priceTrackingMetrics_occurred_idx` ON `priceTrackingMetrics` (`occurredAt`);--> statement-breakpoint
CREATE INDEX `priceTrackingMetrics_product_occurred_idx` ON `priceTrackingMetrics` (`productId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `priceTrackingMetrics_outcome_occurred_idx` ON `priceTrackingMetrics` (`outcome`,`occurredAt`);