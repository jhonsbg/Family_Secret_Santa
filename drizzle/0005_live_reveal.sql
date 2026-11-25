ALTER TYPE "public"."turn_status" ADD VALUE 'in_progress';--> statement-breakpoint
ALTER TABLE "display_access" ALTER COLUMN "reveal_session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "display_access" ADD COLUMN "game_id" uuid;--> statement-breakpoint
ALTER TABLE "reveal_sessions" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "reveal_turns" ADD COLUMN "guess_skipped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reveal_turns" ADD COLUMN "guess_correct" boolean;--> statement-breakpoint
ALTER TABLE "display_access" ADD CONSTRAINT "display_access_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "display_access_game_idx" ON "display_access" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "display_access_one_unrevoked_idx" ON "display_access" USING btree ("game_id") WHERE "display_access"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "reveal_turns_one_current_idx" ON "reveal_turns" USING btree ("reveal_session_id") WHERE "reveal_turns"."status" not in ('pending', 'postponed', 'completed');--> statement-breakpoint
ALTER TABLE "reveal_sessions" ADD CONSTRAINT "reveal_sessions_game_key" UNIQUE("game_id");--> statement-breakpoint
ALTER TABLE "display_access" ADD CONSTRAINT "display_access_scope" CHECK (("display_access"."game_id" is null) <> ("display_access"."reveal_session_id" is null));--> statement-breakpoint
ALTER TABLE "reveal_sessions" ADD CONSTRAINT "reveal_sessions_revision_positive" CHECK ("reveal_sessions"."revision" > 0);--> statement-breakpoint
ALTER TABLE "reveal_turns" ADD CONSTRAINT "reveal_turns_guess_skipped" CHECK (not "reveal_turns"."guess_skipped" or "reveal_turns"."guess_id" is null);--> statement-breakpoint
ALTER TABLE "reveal_turns" ADD CONSTRAINT "reveal_turns_guess_correct" CHECK ("reveal_turns"."guess_correct" is null or ("reveal_turns"."guess_id" is not null and "reveal_turns"."revealed_at" is not null));