ALTER TABLE `manualLinkTracks` ADD `nextRetryAt` timestamp;--> statement-breakpoint
CREATE INDEX `manualLinkTracks_status_nextRetryAt_idx` ON `manualLinkTracks` (`status`,`nextRetryAt`);