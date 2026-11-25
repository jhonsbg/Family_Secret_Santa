ALTER TABLE "participants" ADD COLUMN "organizer_game_id" uuid GENERATED ALWAYS AS (case when source = 'organizer' then game_id end) STORED;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_admin_scope_key" UNIQUE("id","admin_identity_id");--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_organizer_identity_fk" FOREIGN KEY ("organizer_game_id","identity_id") REFERENCES "public"."games"("id","admin_identity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_organizer_confirmed" CHECK ("participants"."source" <> 'organizer' or ("participants"."identity_id" is not null and "participants"."status" = 'confirmed'));
