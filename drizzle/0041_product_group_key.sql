ALTER TABLE `products` ADD `familyVariantKey` varchar(500);--> statement-breakpoint
CREATE INDEX `products_familyVariantKey_idx` ON `products` (`familyVariantKey`,`isActive`);
--> statement-breakpoint
ALTER TABLE `priceTrackingMetrics` MODIFY COLUMN `outcome` enum('matched','unmatched','collector_resolved','group_covered','api_error','rate_limited') NOT NULL;