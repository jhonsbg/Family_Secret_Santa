CREATE TABLE "auth_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"window_expires_at" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "auth_attempts_count_positive" CHECK ("auth_attempts"."count" > 0)
);
--> statement-breakpoint
CREATE TABLE "pin_credentials" (
	"identity_id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"login_hash" text NOT NULL,
	"pin_hash" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pin_credentials_login_hash_unique" UNIQUE("login_hash"),
	CONSTRAINT "pin_credentials_version_positive" CHECK ("pin_credentials"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "idle_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pin_credentials" ADD CONSTRAINT "pin_credentials_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pin_credentials" ADD CONSTRAINT "pin_credentials_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_attempts_expiry_idx" ON "auth_attempts" USING btree ("window_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_one_pending_activation_idx" ON "invites" USING btree ("participant_id") WHERE "invites"."purpose" = 'activation' and "invites"."used_at" is null and "invites"."revoked_at" is null;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_idle_timing" CHECK ("sessions"."idle_expires_at" is null or "sessions"."idle_expires_at" between "sessions"."created_at" and "sessions"."expires_at");