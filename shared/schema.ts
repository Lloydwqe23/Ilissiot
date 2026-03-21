import { pgTable, text, serial, timestamp, boolean, varchar, index, jsonb, integer } from "drizzle-orm/pg-core";
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
  username: varchar("username", { length: 32 }).unique(),
  password: varchar("password").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  bio: text("bio"),
  birthday: varchar("birthday"), // Format: YYYY-MM-DD
  status: varchar("status", { length: 20 }).default('offline'),
  theme: varchar("theme", { length: 20 }).default('light'),
  language: varchar("language", { length: 10 }).default('en'),
  colorTheme: varchar("color_theme", { length: 20 }).default('blue'),
  fontType: varchar("font_type", { length: 20 }).default('inter'),
  textSize: varchar("text_size", { length: 20 }).default('normal'),
  sidebarPlacement: varchar("sidebar_placement", { length: 20 }).default('left'),
  lastSeenPrivacy: varchar("last_seen_privacy", { length: 20 }).default('everyone'),
  groupAddPrivacy: varchar("group_add_privacy", { length: 20 }).default('everyone'),
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
  isChannel: boolean("is_channel").default(false),
  commentsEnabled: boolean("comments_enabled").default(true), // Enable/disable comments on messages
  name: text("name"), // For group/channel chats
  avatarUrl: text("avatar_url"), // For group/channel chats
  creatorId: varchar("creator_id").references(() => users.id, { onDelete: "set null" }), // Original group/channel creator
  hiddenBy: jsonb("hidden_by").default(sql`'[]'::jsonb`), // Array of userIds who "deleted" this chat for themselves
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const chatMembers = pgTable("chat_members", {
  id: serial("id").primaryKey(),
  chatId: serial("chat_id").references(() => chats.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).default('member'), // admin, member
  title: varchar("title", { length: 100 }), // custom title/badge displayed next to name
  permissions: jsonb("permissions").default(sql`'{}'::jsonb`), // custom permissions object
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow(),
  pinnedAt: timestamp("pinned_at", { withTimezone: true }),
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

export const messageReactions = pgTable("message_reactions", {
  id: serial("id").primaryKey(),
  messageId: serial("message_id").references(() => messages.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  emoji: varchar("emoji").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("IDX_message_user_emoji").on(table.messageId, table.userId, table.emoji),
]);

export type MessageReaction = typeof messageReactions.$inferSelect;

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

// Pinned messages - track which messages are pinned in a chat
export const pinnedMessages = pgTable("pinned_messages", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id").references(() => chats.id, { onDelete: "cascade" }).notNull(),
  messageId: integer("message_id").references(() => messages.id, { onDelete: "cascade" }).notNull(),
  pinnedBy: varchar("pinned_by").references(() => users.id, { onDelete: "cascade" }).notNull(),
  pinnedAt: timestamp("pinned_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("IDX_chat_pinned").on(table.chatId),
]);

export type PinnedMessage = typeof pinnedMessages.$inferSelect;

// Group invite links - for joining groups via links
export const groupInviteLinks = pgTable("group_invite_links", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id").references(() => chats.id, { onDelete: "cascade" }).notNull(),
  token: varchar("token").unique().notNull(), // unique invite code
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "cascade" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // null = never expires
  maxUses: integer("max_uses"), // null = unlimited
  currentUses: integer("current_uses").notNull().default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("IDX_invite_token").on(table.token),
  index("IDX_invite_chat").on(table.chatId),
]);

export type GroupInviteLink = typeof groupInviteLinks.$inferSelect;

// Polls - for group chats only
export const polls = pgTable("polls", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id").references(() => chats.id, { onDelete: "cascade" }).notNull(),
  messageId: integer("message_id").references(() => messages.id, { onDelete: "cascade" }).notNull(), // poll is sent as a message
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "cascade" }).notNull(),
  question: text("question").notNull(),
  options: jsonb("options").notNull(), // Array of {id: number, text: string}
  allowMultipleAnswers: boolean("allow_multiple_answers").default(false),
  isAnonymous: boolean("is_anonymous").default(false),
  isClosed: boolean("is_closed").default(false),
  closesAt: timestamp("closes_at", { withTimezone: true }), // null = manual close
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("IDX_poll_chat").on(table.chatId),
  index("IDX_poll_message").on(table.messageId),
]);

export type Poll = typeof polls.$inferSelect;

// Poll votes
export const pollVotes = pgTable("poll_votes", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").references(() => polls.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  optionId: integer("option_id").notNull(), // references option id in poll.options
  votedAt: timestamp("voted_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("IDX_poll_user_option").on(table.pollId, table.userId, table.optionId),
]);

export type PollVote = typeof pollVotes.$inferSelect;

// Comments on messages
export const messageComments = pgTable("message_comments", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").references(() => messages.id, { onDelete: "cascade" }).notNull(),
  senderId: varchar("sender_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  isEdited: boolean("is_edited").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("IDX_comment_message").on(table.messageId),
]);

export type MessageComment = typeof messageComments.$inferSelect;

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
  pinnedMessages: many(pinnedMessages),
  inviteLinks: many(groupInviteLinks),
  polls: many(polls),
}));

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
  chat: one(chats, { fields: [chatMembers.chatId], references: [chats.id] }),
  user: one(users, { fields: [chatMembers.userId], references: [users.id] }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  chat: one(chats, { fields: [messages.chatId], references: [chats.id] }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
  reactions: many(messageReactions),
  pinnedMessages: many(pinnedMessages),
  poll: one(polls, { fields: [messages.id], references: [polls.messageId] }),
  comments: many(messageComments),
}));

export const messageReactionsRelations = relations(messageReactions, ({ one }) => ({
  message: one(messages, { fields: [messageReactions.messageId], references: [messages.id] }),
  user: one(users, { fields: [messageReactions.userId], references: [users.id] }),
}));

export const messageCommentsRelations = relations(messageComments, ({ one }) => ({
  message: one(messages, { fields: [messageComments.messageId], references: [messages.id] }),
  sender: one(users, { fields: [messageComments.senderId], references: [users.id] }),
}));

export const pinnedMessagesRelations = relations(pinnedMessages, ({ one }) => ({
  chat: one(chats, { fields: [pinnedMessages.chatId], references: [chats.id] }),
  message: one(messages, { fields: [pinnedMessages.messageId], references: [messages.id] }),
  pinnedByUser: one(users, { fields: [pinnedMessages.pinnedBy], references: [users.id] }),
}));

export const groupInviteLinksRelations = relations(groupInviteLinks, ({ one }) => ({
  chat: one(chats, { fields: [groupInviteLinks.chatId], references: [chats.id] }),
  creator: one(users, { fields: [groupInviteLinks.createdBy], references: [users.id] }),
}));

export const pollsRelations = relations(polls, ({ one, many }) => ({
  chat: one(chats, { fields: [polls.chatId], references: [chats.id] }),
  message: one(messages, { fields: [polls.messageId], references: [messages.id] }),
  creator: one(users, { fields: [polls.createdBy], references: [users.id] }),
  votes: many(pollVotes),
}));

export const pollVotesRelations = relations(pollVotes, ({ one }) => ({
  poll: one(polls, { fields: [pollVotes.pollId], references: [polls.id] }),
  user: one(users, { fields: [pollVotes.userId], references: [users.id] }),
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
  poll?: PollWithResults | null;
};

export type ReactionWithUser = MessageReaction & {
  user: User;
};

export type MessageWithReactions = MessageWithSender & {
  reactions?: ReactionWithUser[];
};

// Grouped reactions for display: { emoji: string, count: number, userReacted: boolean }
export type ReactionGroup = {
  emoji: string;
  count: number;
  userReacted: boolean;
};

// Poll option structure
export type PollOption = {
  id: number;
  text: string;
};

// Poll with vote counts and user's vote (if any)
export type PollWithResults = Poll & {
  options: PollOption[];
  results: {
    optionId: number;
    count: number;
    voters?: User[]; // Only if not anonymous
  }[];
  userVotes?: number[]; // option IDs the current user voted for
  totalVotes: number;
};

// Pinned message with full message data
export type PinnedMessageWithDetails = PinnedMessage & {
  message: MessageWithSender;
  pinnedByUser: User;
};

// Invite link with optional chat info
export type InviteLinkWithChat = GroupInviteLink & {
  chat?: ChatWithMembers;
  creator?: User;
};

// WebSocket Event Types
export const WS_EVENTS = {
  CONNECT: 'connect',
  MESSAGE_NEW: 'message:new',
  MESSAGE_EDIT: 'message:edit',
  MESSAGE_DELETE: 'message:delete',
  MESSAGE_READ: 'message:read',
  MESSAGE_REACTION_ADD: 'message:reaction:add',
  MESSAGE_REACTION_REMOVE: 'message:reaction:remove',
  MESSAGE_PIN: 'message:pin',
  MESSAGE_UNPIN: 'message:unpin',
  USER_STATUS: 'user:status',
  ONLINE_USERS: 'users:online',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  // Polls
  POLL_NEW: 'poll:new',
  POLL_VOTE: 'poll:vote',
  POLL_CLOSE: 'poll:close',
  // WebRTC Call Signaling
  CALL_OFFER: 'call:offer',
  CALL_ANSWER: 'call:answer',
  CALL_ICE_CANDIDATE: 'call:ice-candidate',
  CALL_HANGUP: 'call:hangup',
  CALL_REJECT: 'call:reject',
  CALL_BUSY: 'call:busy',
  // Chat lifecycle
  CHAT_DELETED: 'chat:deleted',
} as const;

export interface WsMessage<T = unknown> {
  // the actual string value sent over the wire (e.g. 'connect', 'message:new',
  // 'call:offer', etc.)
  type: (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
  payload: T;
}
