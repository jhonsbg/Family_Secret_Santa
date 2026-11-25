CREATE TYPE "public"."recovery_event_kind" AS ENUM('personal_redeemed', 'assisted_issued', 'assisted_redeemed', 'code_replaced');--> statement-breakpoint
CREATE TABLE "recovery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"target_identity_id" uuid,
	"actor_identity_id" uuid,
	"kind" "recovery_event_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pin_credentials" ADD COLUMN "recovery_hash" text;--> statement-breakpoint
ALTER TABLE "recovery_events" ADD CONSTRAINT "recovery_events_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_events" ADD CONSTRAINT "recovery_events_target_identity_id_identities_id_fk" FOREIGN KEY ("target_identity_id") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_events" ADD CONSTRAINT "recovery_events_actor_identity_id_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recovery_events_retention_idx" ON "recovery_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "recovery_events_game_idx" ON "recovery_events" USING btree ("game_id","created_at");--> statement-breakpoint
ALTER TABLE "pin_credentials" ADD CONSTRAINT "pin_credentials_recovery_hash_unique" UNIQUE("recovery_hash");