ALTER TABLE "push_devices" ADD COLUMN "app_id" text;--> statement-breakpoint
ALTER TABLE "push_devices" ADD COLUMN "apns_sandbox" boolean DEFAULT false NOT NULL;