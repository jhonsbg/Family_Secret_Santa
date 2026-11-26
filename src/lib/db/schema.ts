import { sql } from "drizzle-orm";
import {
  boolean, check, foreignKey, index, integer, pgEnum, pgTable, primaryKey,
  text, timestamp, unique, uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";

export const gameState = pgEnum("game_state", [
  "registrations_open", "registrations_closed", "drawn", "revealing", "finished",
]);
export const participantStatus = pgEnum("participant_status", ["pending", "confirmed", "rejected", "withdrawn"]);
export const registrationSource = pgEnum("registration_source", ["individual", "manual", "organizer"]);
export const invitePurpose = pgEnum("invite_purpose", ["registration", "activation", "recovery"]);
export const revealState = pgEnum("reveal_state", ["running", "paused", "finished"]);
export const turnStatus = pgEnum("turn_status", ["pending", "postponed", "revealed", "completed", "in_progress"]);

const time = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => time("created_at").defaultNow().notNull();
const updatedAt = () => time("updated_at").defaultNow().notNull();

export const identities = pgTable("identities", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: createdAt(),
});

export const games = pgTable("games", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  adminIdentityId: uuid("admin_identity_id").notNull().references(() => identities.id),
  eventAt: time("event_at").notNull(),
  timezone: varchar("timezone", { length: 80 }).default("America/Bogota").notNull(),
  budgetMin: integer("budget_min").notNull(),
  budgetMax: integer("budget_max").notNull(),
  state: gameState("state").default("registrations_open").notNull(),
  wishesEnabled: boolean("wishes_enabled").default(true).notNull(),
  guessingEnabled: boolean("guessing_enabled").default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  unique("games_admin_scope_key").on(t.id, t.adminIdentityId),
  index("games_admin_idx").on(t.adminIdentityId),
  check("games_name_nonblank", sql`length(btrim(${t.name})) > 0`),
  check("games_budget_range", sql`${t.budgetMin} >= 0 and ${t.budgetMax} >= ${t.budgetMin}`),
]);

export const participants = pgTable("participants", {
  id: uuid("id").defaultRandom().primaryKey(),
  gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
  identityId: uuid("identity_id").references(() => identities.id),
  displayName: varchar("display_name", { length: 60 }).notNull(),
  status: participantStatus("status").notNull(),
  source: registrationSource("source").notNull(),
  organizerGameId: uuid("organizer_game_id").generatedAlwaysAs(sql`case when source = 'organizer' then game_id end`),
  activatedAt: time("activated_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  unique("participants_game_id_key").on(t.gameId, t.id),
  unique("participants_game_identity_key").on(t.gameId, t.identityId),
  uniqueIndex("participants_one_organizer_idx").on(t.gameId).where(sql`${t.source} = 'organizer'`),
  check("participants_name_nonblank", sql`length(btrim(${t.displayName})) > 0`),
  foreignKey({ columns: [t.organizerGameId, t.identityId], foreignColumns: [games.id, games.adminIdentityId], name: "participants_organizer_identity_fk" }),
  check("participants_organizer_confirmed", sql`${t.source} <> 'organizer' or (${t.identityId} is not null and ${t.status} = 'confirmed')`),
  check("participants_activation_identity", sql`${t.activatedAt} is null or ${t.identityId} is not null`),
]);

export const invites = pgTable("invites", {
  id: uuid("id").defaultRandom().primaryKey(),
  gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
  participantId: uuid("participant_id"),
  tokenHash: text("token_hash").notNull().unique(),
  purpose: invitePurpose("purpose").notNull(),
  expiresAt: time("expires_at").notNull(),
  usedAt: time("used_at"),
  revokedAt: time("revoked_at"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("invites_one_pending_activation_idx").on(t.participantId).where(sql`${t.purpose} = 'activation' and ${t.usedAt} is null and ${t.revokedAt} is null`),
  index("invites_game_participant_idx").on(t.gameId, t.participantId),
  foreignKey({ columns: [t.gameId, t.participantId], foreignColumns: [participants.gameId, participants.id], name: "invites_participant_fk" }).onDelete("cascade"),
  check("invites_target", sql`(${t.purpose} = 'registration') = (${t.participantId} is null)`),
  check("invites_timing", sql`${t.expiresAt} > ${t.createdAt} and
    (${t.usedAt} is null or (${t.usedAt} >= ${t.createdAt} and ${t.usedAt} < ${t.expiresAt} and ${t.purpose} <> 'registration')) and
    (${t.revokedAt} is null or ${t.revokedAt} >= ${t.createdAt})`),
]);

export const pinCredentials = pgTable("pin_credentials", {
  identityId: uuid("identity_id").primaryKey().references(() => identities.id, { onDelete: "cascade" }),
  gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
  loginHash: text("login_hash").notNull().unique(),
  loginName: text("login_name"),
  pinHash: text("pin_hash").notNull(),
  recoveryHash: text("recovery_hash").unique(),
  version: integer("version").default(1).notNull(),
  updatedAt: updatedAt(),
}, (t) => [
  unique("pin_credentials_game_login_name_key").on(t.gameId, t.loginName),
  check("pin_credentials_version_positive", sql`${t.version} > 0`),
]);

export const authAttempts = pgTable("auth_attempts", {
  key: text("key").primaryKey(),
  windowExpiresAt: time("window_expires_at").notNull(),
  count: integer("count").notNull(),
}, (t) => [
  index("auth_attempts_expiry_idx").on(t.windowExpiresAt),
  check("auth_attempts_count_positive", sql`${t.count} > 0`),
]);

export const recoveryEventKind = pgEnum("recovery_event_kind", [
  "personal_redeemed", "assisted_issued", "assisted_redeemed", "code_replaced",
]);

export const recoveryEvents = pgTable("recovery_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
  targetIdentityId: uuid("target_identity_id").references(() => identities.id, { onDelete: "set null" }),
  actorIdentityId: uuid("actor_identity_id").references(() => identities.id, { onDelete: "set null" }),
  kind: recoveryEventKind("kind").notNull(),
  createdAt: createdAt(),
}, (t) => [
  index("recovery_events_retention_idx").on(t.createdAt),
  index("recovery_events_game_idx").on(t.gameId, t.createdAt),
]);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
  identityId: uuid("identity_id").notNull().references(() => identities.id),
  tokenHash: text("token_hash").notNull().unique(),
  temporary: boolean("temporary").default(false).notNull(),
  expiresAt: time("expires_at").notNull(),
  revokedAt: time("revoked_at"),
  idleExpiresAt: time("idle_expires_at"),
  createdAt: createdAt(),
}, (t) => [
  index("sessions_game_identity_idx").on(t.gameId, t.identityId),
  check("sessions_idle_timing", sql`${t.idleExpiresAt} is null or ${t.idleExpiresAt} between ${t.createdAt} and ${t.expiresAt}`),
  check("sessions_timing", sql`${t.expiresAt} > ${t.createdAt} and (${t.revokedAt} is null or ${t.revokedAt} >= ${t.createdAt})`),
]);

export const wishlist = pgTable("wishlist", {
  participantId: uuid("participant_id").primaryKey().references(() => participants.id, { onDelete: "cascade" }),
  gift: text("gift").default("").notNull(),
  likes: text("likes").default("").notNull(),
  avoid: text("avoid").default("").notNull(),
  updatedAt: updatedAt(),
});

export const exclusions = pgTable("exclusions", {
  gameId: uuid("game_id").notNull(),
  participantA: uuid("participant_a").notNull(),
  participantB: uuid("participant_b").notNull(),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.gameId, t.participantA, t.participantB] }),
  foreignKey({ columns: [t.gameId, t.participantA], foreignColumns: [participants.gameId, participants.id], name: "exclusions_person_a_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.gameId, t.participantB], foreignColumns: [participants.gameId, participants.id], name: "exclusions_person_b_fk" }).onDelete("cascade"),
  check("exclusions_canonical_order", sql`${t.participantA} < ${t.participantB}`),
]);

export const draws = pgTable("draws", {
  id: uuid("id").defaultRandom().primaryKey(),
  gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  invalidatedAt: time("invalidated_at"),
  createdAt: createdAt(),
}, (t) => [
  unique("draws_game_id_key").on(t.gameId, t.id),
  unique("draws_game_version_key").on(t.gameId, t.version),
  uniqueIndex("draws_one_current_idx").on(t.gameId).where(sql`${t.invalidatedAt} is null`),
  check("draws_positive_version", sql`${t.version} > 0`),
  check("draws_timing", sql`${t.invalidatedAt} is null or ${t.invalidatedAt} >= ${t.createdAt}`),
]);

export const assignments = pgTable("assignments", {
  drawId: uuid("draw_id").notNull(),
  gameId: uuid("game_id").notNull(),
  giverId: uuid("giver_id").notNull(),
  recipientId: uuid("recipient_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.drawId, t.giverId] }),
  unique("assignments_draw_recipient_key").on(t.drawId, t.recipientId),
  foreignKey({ columns: [t.gameId, t.drawId], foreignColumns: [draws.gameId, draws.id], name: "assignments_draw_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.gameId, t.giverId], foreignColumns: [participants.gameId, participants.id], name: "assignments_giver_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.gameId, t.recipientId], foreignColumns: [participants.gameId, participants.id], name: "assignments_recipient_fk" }).onDelete("cascade"),
  check("assignments_no_self", sql`${t.giverId} <> ${t.recipientId}`),
]);

export const envelopeViews = pgTable("envelope_views", {
  drawId: uuid("draw_id").notNull(),
  participantId: uuid("participant_id").notNull(),
  viewedAt: time("viewed_at").defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.drawId, t.participantId] }),
  foreignKey({ columns: [t.drawId, t.participantId], foreignColumns: [assignments.drawId, assignments.giverId], name: "envelope_views_assignment_fk" }).onDelete("cascade"),
]);

export const revealSessions = pgTable("reveal_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  gameId: uuid("game_id").notNull(),
  drawId: uuid("draw_id").notNull().unique(),
  state: revealState("state").default("running").notNull(),
  revision: integer("revision").default(1).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  unique("reveal_sessions_game_key").on(t.gameId),
  check("reveal_sessions_revision_positive", sql`${t.revision} > 0`),
  unique("reveal_sessions_scope_key").on(t.id, t.gameId, t.drawId),
  foreignKey({ columns: [t.gameId, t.drawId], foreignColumns: [draws.gameId, draws.id], name: "reveal_sessions_draw_fk" }).onDelete("cascade"),
]);

export const revealTurns = pgTable("reveal_turns", {
  id: uuid("id").defaultRandom().primaryKey(),
  revealSessionId: uuid("reveal_session_id").notNull(),
  gameId: uuid("game_id").notNull(),
  drawId: uuid("draw_id").notNull(),
  recipientId: uuid("recipient_id").notNull(),
  orderIndex: integer("order_index").notNull(),
  status: turnStatus("status").default("pending").notNull(),
  guessId: uuid("guess_id"),
  guessSkipped: boolean("guess_skipped").default(false).notNull(),
  guessCorrect: boolean("guess_correct"),
  revealedAt: time("revealed_at"),
  completedAt: time("completed_at"),
}, (t) => [
  uniqueIndex("reveal_turns_one_current_idx").on(t.revealSessionId)
    .where(sql`${t.status} not in ('pending', 'postponed', 'completed')`),
  check("reveal_turns_guess_skipped", sql`not ${t.guessSkipped} or ${t.guessId} is null`),
  check("reveal_turns_guess_correct", sql`${t.guessCorrect} is null or (${t.guessId} is not null and ${t.revealedAt} is not null)`),
  unique("reveal_turns_order_key").on(t.revealSessionId, t.orderIndex),
  unique("reveal_turns_recipient_key").on(t.revealSessionId, t.recipientId),
  foreignKey({ columns: [t.revealSessionId, t.gameId, t.drawId], foreignColumns: [revealSessions.id, revealSessions.gameId, revealSessions.drawId], name: "reveal_turns_session_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.drawId, t.recipientId], foreignColumns: [assignments.drawId, assignments.recipientId], name: "reveal_turns_recipient_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.gameId, t.guessId], foreignColumns: [participants.gameId, participants.id], name: "reveal_turns_guess_fk" }).onDelete("cascade"),
  check("reveal_turns_order_nonnegative", sql`${t.orderIndex} >= 0`),
  check("reveal_turns_timing", sql`(${t.status} in ('revealed', 'completed')) = (${t.revealedAt} is not null)
    and (${t.status} = 'completed') = (${t.completedAt} is not null)
    and (${t.completedAt} is null or ${t.completedAt} >= ${t.revealedAt})`),
]);

export const displayAccess = pgTable("display_access", {
  id: uuid("id").defaultRandom().primaryKey(),
  revealSessionId: uuid("reveal_session_id").references(() => revealSessions.id, { onDelete: "cascade" }),
  gameId: uuid("game_id").references(() => games.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: time("expires_at").notNull(),
  revokedAt: time("revoked_at"),
  createdAt: createdAt(),
}, (t) => [
  index("display_access_game_idx").on(t.gameId),
  uniqueIndex("display_access_one_unrevoked_idx").on(t.gameId).where(sql`${t.revokedAt} is null`),
  check("display_access_scope", sql`(${t.gameId} is null) <> (${t.revealSessionId} is null)`),
  index("display_access_session_idx").on(t.revealSessionId),
  check("display_access_timing", sql`${t.expiresAt} > ${t.createdAt} and (${t.revokedAt} is null or ${t.revokedAt} >= ${t.createdAt})`),
]);
