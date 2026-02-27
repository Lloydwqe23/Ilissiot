import { pgTable, text, serial, timestamp, boolean, varchar, index, jsonb } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// --- AUTH TABLES ---
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  password: varchar("password").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  bio: text("bio"),
  status: varchar("status", { length: 20 }).default('offline'),
  lastSeen: timestamp("last_seen", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// --- APP TABLES ---

export const chats = pgTable("chats", {
  id: serial("id").primaryKey(),
  isGroup: boolean("is_group").default(false),
  name: text("name"), // Only for group chats
  avatarUrl: text("avatar_url"), // Only for group chats
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const chatMembers = pgTable("chat_members", {
  id: serial("id").primaryKey(),
  chatId: serial("chat_id").references(() => chats.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).default('member'), // admin, member
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  chatId: serial("chat_id").references(() => chats.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").references(() => users.id, { onDelete: "cascade" }),
  content: text("content"),
  attachments: jsonb("attachments").default(sql`'[]'::jsonb`), // Array of {name, url, type}
  isEdited: boolean("is_edited").default(false),
  isRead: boolean("is_read").default(false),
  deletedBy: jsonb("deleted_by").default(sql`'[]'::jsonb`), // Array of userIds who deleted this message
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// --- RELATIONS ---

// table to record one user blocking another
export const blocks = pgTable("blocks", {
  id: serial("id").primaryKey(),
  blockerId: varchar("blocker_id").references(() => users.id, { onDelete: "cascade" }),
  blockedId: varchar("blocked_id").references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("IDX_blocker_blocked").on(table.blockerId, table.blockedId),
]);

export type Block = typeof blocks.$inferSelect;

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(chatMembers),
  messages: many(messages),
  // blocksSent/blocksReceived simply reference the blocks table; Drizzle
  // can infer the foreign keys automatically from our column definitions.
  blocksSent: many(blocks),
  blocksReceived: many(blocks),
}));

export const chatsRelations = relations(chats, ({ many }) => ({
  members: many(chatMembers),
  messages: many(messages),
}));

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
  chat: one(chats, { fields: [chatMembers.chatId], references: [chats.id] }),
  user: one(users, { fields: [chatMembers.userId], references: [users.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, { fields: [messages.chatId], references: [chats.id] }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
}));

// --- SCHEMAS ---
export const insertChatSchema = createInsertSchema(chats).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMessageSchema = createInsertSchema(messages).pick({ chatId: true, content: true, attachments: true });

// --- API CONTRACT TYPES ---
export type Chat = typeof chats.$inferSelect;
export type ChatMember = typeof chatMembers.$inferSelect;
export type Message = typeof messages.$inferSelect;

export type InsertChat = z.infer<typeof insertChatSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type CreateMessageRequest = InsertMessage;

// Extended types for API responses
export type ChatWithMembers = Chat & {
  members: (ChatMember & { user: User })[];
  lastMessage?: MessageWithSender | null;
  unreadCount?: number;
};

export type MessageWithSender = Message & {
  sender: User;
};

// WebSocket Event Types
export const WS_EVENTS = {
  CONNECT: 'connect',
  MESSAGE_NEW: 'message:new',
  MESSAGE_EDIT: 'message:edit',
  MESSAGE_DELETE: 'message:delete',
  MESSAGE_READ: 'message:read',
  USER_STATUS: 'user:status',
  ONLINE_USERS: 'users:online',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
} as const;

export interface WsMessage<T = unknown> {
  type: keyof typeof WS_EVENTS;
  payload: T;
}
