CREATE TYPE "public"."game_state" AS ENUM('registrations_open', 'registrations_closed', 'drawn', 'revealing', 'finished');--> statement-breakpoint
CREATE TYPE "public"."invite_purpose" AS ENUM('registration', 'activation', 'recovery');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('pending', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."registration_source" AS ENUM('individual', 'manual', 'organizer');--> statement-breakpoint
CREATE TYPE "public"."reveal_state" AS ENUM('running', 'paused', 'finished');--> statement-breakpoint
CREATE TYPE "public"."turn_status" AS ENUM('pending', 'postponed', 'revealed', 'completed');--> statement-breakpoint
CREATE TABLE "assignments" (
	"draw_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"giver_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	CONSTRAINT "assignments_draw_id_giver_id_pk" PRIMARY KEY("draw_id","giver_id"),
	CONSTRAINT "assignments_draw_recipient_key" UNIQUE("draw_id","recipient_id"),
	CONSTRAINT "assignments_no_self" CHECK ("assignments"."giver_id" <> "assignments"."recipient_id")
);
--> statement-breakpoint
CREATE TABLE "display_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reveal_session_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "display_access_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "display_access_timing" CHECK ("display_access"."expires_at" > "display_access"."created_at" and ("display_access"."revoked_at" is null or "display_access"."revoked_at" >= "display_access"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "draws" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"invalidated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draws_game_id_key" UNIQUE("game_id","id"),
	CONSTRAINT "draws_game_version_key" UNIQUE("game_id","version"),
	CONSTRAINT "draws_positive_version" CHECK ("draws"."version" > 0),
	CONSTRAINT "draws_timing" CHECK ("draws"."invalidated_at" is null or "draws"."invalidated_at" >= "draws"."created_at")
);
--> statement-breakpoint
CREATE TABLE "envelope_views" (
	"draw_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "envelope_views_draw_id_participant_id_pk" PRIMARY KEY("draw_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "exclusions" (
	"game_id" uuid NOT NULL,
	"participant_a" uuid NOT NULL,
	"participant_b" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exclusions_game_id_participant_a_participant_b_pk" PRIMARY KEY("game_id","participant_a","participant_b"),
	CONSTRAINT "exclusions_canonical_order" CHECK ("exclusions"."participant_a" < "exclusions"."participant_b")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"admin_identity_id" uuid NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"timezone" varchar(80) DEFAULT 'America/Bogota' NOT NULL,
	"budget_min" integer NOT NULL,
	"budget_max" integer NOT NULL,
	"state" "game_state" DEFAULT 'registrations_open' NOT NULL,
	"wishes_enabled" boolean DEFAULT true NOT NULL,
	"guessing_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_name_nonblank" CHECK (length(btrim("games"."name")) > 0),
	CONSTRAINT "games_budget_range" CHECK ("games"."budget_min" >= 0 and "games"."budget_max" >= "games"."budget_min")
);
--> statement-breakpoint
CREATE TABLE "identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"participant_id" uuid,
	"token_hash" text NOT NULL,
	"purpose" "invite_purpose" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invites_target" CHECK (("invites"."purpose" = 'registration') = ("invites"."participant_id" is null)),
	CONSTRAINT "invites_timing" CHECK ("invites"."expires_at" > "invites"."created_at" and
    ("invites"."used_at" is null or ("invites"."used_at" >= "invites"."created_at" and "invites"."used_at" < "invites"."expires_at" and "invites"."purpose" <> 'registration')) and
    ("invites"."revoked_at" is null or "invites"."revoked_at" >= "invites"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"identity_id" uuid,
	"display_name" varchar(60) NOT NULL,
	"status" "participant_status" NOT NULL,
	"source" "registration_source" NOT NULL,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_game_id_key" UNIQUE("game_id","id"),
	CONSTRAINT "participants_game_identity_key" UNIQUE("game_id","identity_id"),
	CONSTRAINT "participants_name_nonblank" CHECK (length(btrim("participants"."display_name")) > 0),
	CONSTRAINT "participants_activation_identity" CHECK ("participants"."activated_at" is null or "participants"."identity_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "reveal_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"draw_id" uuid NOT NULL,
	"state" "reveal_state" DEFAULT 'running' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reveal_sessions_draw_id_unique" UNIQUE("draw_id"),
	CONSTRAINT "reveal_sessions_scope_key" UNIQUE("id","game_id","draw_id")
);
--> statement-breakpoint
CREATE TABLE "reveal_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reveal_session_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"draw_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"status" "turn_status" DEFAULT 'pending' NOT NULL,
	"guess_id" uuid,
	"revealed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "reveal_turns_order_key" UNIQUE("reveal_session_id","order_index"),
	CONSTRAINT "reveal_turns_recipient_key" UNIQUE("reveal_session_id","recipient_id"),
	CONSTRAINT "reveal_turns_order_nonnegative" CHECK ("reveal_turns"."order_index" >= 0),
	CONSTRAINT "reveal_turns_timing" CHECK (("reveal_turns"."status" in ('revealed', 'completed')) = ("reveal_turns"."revealed_at" is not null)
    and ("reveal_turns"."status" = 'completed') = ("reveal_turns"."completed_at" is not null)
    and ("reveal_turns"."completed_at" is null or "reveal_turns"."completed_at" >= "reveal_turns"."revealed_at"))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"temporary" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "sessions_timing" CHECK ("sessions"."expires_at" > "sessions"."created_at" and ("sessions"."revoked_at" is null or "sessions"."revoked_at" >= "sessions"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "wishlist" (
	"participant_id" uuid PRIMARY KEY NOT NULL,
	"gift" text DEFAULT '' NOT NULL,
	"likes" text DEFAULT '' NOT NULL,
	"avoid" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_draw_fk" FOREIGN KEY ("game_id","draw_id") REFERENCES "public"."draws"("game_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_giver_fk" FOREIGN KEY ("game_id","giver_id") REFERENCES "public"."participants"("game_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_recipient_fk" FOREIGN KEY ("game_id","recipient_id") REFERENCES "public"."participants"("game_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "display_access" ADD CONSTRAINT "display_access_reveal_session_id_reveal_sessions_id_fk" FOREIGN KEY ("reveal_session_id") REFERENCES "public"."reveal_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draws" ADD CONSTRAINT "draws_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envelope_views" ADD CONSTRAINT "envelope_views_assignment_fk" FOREIGN KEY ("draw_id","participant_id") REFERENCES "public"."assignments"("draw_id","giver_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusions" ADD CONSTRAINT "exclusions_person_a_fk" FOREIGN KEY ("game_id","participant_a") REFERENCES "public"."participants"("game_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusions" ADD CONSTRAINT "exclusions_person_b_fk" FOREIGN KEY ("game_id","participant_b") REFERENCES "public"."participants"("game_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_admin_identity_id_identities_id_fk" FOREIGN KEY ("admin_identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_participant_fk" FOREIGN KEY ("game_id","participant_id") REFERENCES "public"."participants"("game_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reveal_sessions" ADD CONSTRAINT "reveal_sessions_draw_fk" FOREIGN KEY ("game_id","draw_id") REFERENCES "public"."draws"("game_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reveal_turns" ADD CONSTRAINT "reveal_turns_session_fk" FOREIGN KEY ("reveal_session_id","game_id","draw_id") REFERENCES "public"."reveal_sessions"("id","game_id","draw_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reveal_turns" ADD CONSTRAINT "reveal_turns_recipient_fk" FOREIGN KEY ("draw_id","recipient_id") REFERENCES "public"."assignments"("draw_id","recipient_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reveal_turns" ADD CONSTRAINT "reveal_turns_guess_fk" FOREIGN KEY ("game_id","guess_id") REFERENCES "public"."participants"("game_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "display_access_session_idx" ON "display_access" USING btree ("reveal_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "draws_one_current_idx" ON "draws" USING btree ("game_id") WHERE "draws"."invalidated_at" is null;--> statement-breakpoint
CREATE INDEX "games_admin_idx" ON "games" USING btree ("admin_identity_id");--> statement-breakpoint
CREATE INDEX "invites_game_participant_idx" ON "invites" USING btree ("game_id","participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_one_organizer_idx" ON "participants" USING btree ("game_id") WHERE "participants"."source" = 'organizer';--> statement-breakpoint
CREATE INDEX "sessions_game_identity_idx" ON "sessions" USING btree ("game_id","identity_id");