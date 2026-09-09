ALTER TABLE `collectedPriceHistory` ADD `itemId` varchar(80);--> statement-breakpoint
ALTER TABLE `collectedPriceHistory` ADD `itemId` varchar(80);--> statement-breakpoint
ALTER TABLE `collectedPriceHistory` ADD `vendorItemId` varchar(80);--> statement-breakpoint
CREATE INDEX `collectedPriceHistory_vendor_collected_idx` ON `collectedPriceHistory` (`vendorItemId`,`collectedAt`);
