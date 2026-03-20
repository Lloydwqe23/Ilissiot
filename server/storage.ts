import { db } from "./db";
import {
  chats,
  chatMembers,
  messages,
  messageReactions,
    messageComments,
  users,
  blocks,
  pinnedMessages,
  groupInviteLinks,
  polls,
  pollVotes,
  type User,
  type ChatWithMembers,
  type MessageWithSender,
  type ReactionWithUser,
    type MessageComment,
  type InsertChat,
  type InsertMessage,
  type PinnedMessageWithDetails,
  type PollWithResults,
  type PollOption,
  type GroupInviteLink,
} from "@shared/schema";
import { eq, or, and, desc, asc, ilike, sql, inArray, gte } from "drizzle-orm";
import { randomBytes } from "crypto";

/** Strip ALL private fields from a user object so other users never see them.
 * Returns `any` intentionally – the type system's `User` includes these fields
 * but they must NOT reach the client. */
function sanitizeUser(user: Record<string, any>): any {
  const { password, email, theme, language, colorTheme, fontType, textSize, createdAt, updatedAt, ...safe } = user;
  return safe;
}

interface IStorage {
  // User operations
  searchUsers(query: string, currentUserId: string): Promise<User[]>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  blockUser(blockerId: string, blockedId: string): Promise<void>;
  unblockUser(blockerId: string, blockedId: string): Promise<void>;
  getBlockStatus(currentUserId: string, otherUserId: string): Promise<{ blocked: boolean; blockedBy: boolean }>;
  getBlockedUsers(userId: string): Promise<User[]>;

  // Chat operations
  getChatsForUser(userId: string): Promise<ChatWithMembers[]>;
  getChat(id: number): Promise<ChatWithMembers | undefined>;
  createDirectChat(userId1: string, userId2: string): Promise<ChatWithMembers>;
  createGroupChat(name: string, creatorId: string, memberIds: string[]): Promise<ChatWithMembers>;
  createChannel(name: string, creatorId: string): Promise<ChatWithMembers>;
  searchChannels(query: string, userId: string): Promise<Array<{ id: number; name: string | null; avatarUrl: string | null; memberCount: number; isJoined: boolean }>>;
  joinChannel(chatId: number, userId: string): Promise<ChatWithMembers>;
  updateGroupChat(chatId: number, updates: { name?: string; avatarUrl?: string | null }): Promise<ChatWithMembers>;
  addGroupMembers(chatId: number, userIds: string[]): Promise<ChatWithMembers>;
  removeGroupMember(chatId: number, userId: string): Promise<void>;
  deleteChat(chatId: number): Promise<void>;
  leaveChatForUser(chatId: number, userId: string): Promise<void>;
  updateChatCreator(chatId: number, userId: string): Promise<void>;
  
  // Message operations
  getMessagesForChat(chatId: number, userId: string, limit?: number): Promise<MessageWithSender[]>;
  searchMessagesInChat(chatId: number, query: string, userId: string, limit?: number): Promise<MessageWithSender[]>;
  createMessage(message: InsertMessage & { senderId: string }): Promise<MessageWithSender>;
  markMessagesAsRead(chatId: number, userId: string): Promise<void>;
  clearMessagesForUser(chatId: number, userId: string): Promise<void>;
  clearMessagesForAll(chatId: number): Promise<void>;
  clearMyMessagesForAll(chatId: number, userId: string): Promise<void>;
  // deletion helpers – scoped so users can remove their own messages for themselves or for everyone
  deleteMessage(messageId: number, userId: string, forAll?: boolean): Promise<void>;
  deleteMessages(items: { id: number; forAll: boolean }[], userId: string): Promise<void>;
  // message editing
  editMessage(messageId: number, userId: string, newContent: string): Promise<MessageWithSender>;
  // message reactions
  addReaction(messageId: number, userId: string, emoji: string): Promise<ReactionWithUser>;
  removeReaction(messageId: number, userId: string, emoji: string): Promise<void>;
  getReactions(messageId: number): Promise<ReactionWithUser[]>;
  // A01: verify the user is a member of the chat that owns a given message
  verifyMessageAccess(messageId: number, userId: string): Promise<boolean>;
  // Get the chat (with members) that a message belongs to
  getChatByMessageId(messageId: number): Promise<ChatWithMembers | null>;
 // Comment operations
 listComments(messageId: number, userId: string): Promise<(MessageComment & { sender: User })[]>;
 addComment(messageId: number, userId: string, content: string): Promise<MessageComment & { sender: User }>;
 editComment(messageId: number, commentId: number, userId: string, content: string): Promise<MessageComment & { sender: User }>;
 deleteComment(messageId: number, commentId: number, userId: string): Promise<void>;
 // Channel comments settings
 setChannelCommentsEnabled(chatId: number, userId: string, enabled: boolean): Promise<ChatWithMembers>;
}

export class DatabaseStorage implements IStorage {
  // blocking helpers
  async blockUser(blockerId: string, blockedId: string): Promise<void> {
    // avoid duplicate entries
    await db.insert(blocks).values({ blockerId, blockedId }).onConflictDoNothing().execute();
  }

  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    await db
      .delete(blocks)
      .where(
        and(
          eq(blocks.blockerId, blockerId),
          eq(blocks.blockedId, blockedId)
        )
      );
  }

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(blocks)
      .where(
        and(
          eq(blocks.blockerId, blockerId),
          eq(blocks.blockedId, blockedId)
        )
      );
    return Number(row.count) > 0;
  }

  async getBlockStatus(currentUserId: string, otherUserId: string): Promise<{ blocked: boolean; blockedBy: boolean }> {
    const blocked = await this.isBlocked(currentUserId, otherUserId);
    const blockedBy = await this.isBlocked(otherUserId, currentUserId);
    return { blocked, blockedBy };
  }

  async getBlockedUsers(userId: string): Promise<User[]> {
    const rows = await db
      .select()
      .from(users)
      .innerJoin(blocks, eq(blocks.blockedId, users.id))
      .where(eq(blocks.blockerId, userId));
    // join returns {users, blocks} objects; map to user and strip sensitive data
    return rows.map(r => sanitizeUser(r.users)) as User[];
  }
  async searchUsers(query: string, currentUserId: string): Promise<User[]> {
    const normalizedQuery = query.trim().replace(/^@/, '').toLowerCase();
    if (!normalizedQuery) return [];

    // Exclude yourself and any users you've blocked or who have blocked you
    const rows = await db.select()
      .from(users)
      .where(
        and(
          ilike(users.username, `%${normalizedQuery}%`),
          sql`${users.id} != ${currentUserId}`,
          sql`NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ${currentUserId} AND b.blocked_id = ${users.id}) OR (b.blocker_id = ${users.id} AND b.blocked_id = ${currentUserId}))`
        )
      )
      .limit(20);
    return rows.map(sanitizeUser) as User[];
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const nextUpdates = { ...updates } as Partial<User>;

    if (typeof nextUpdates.username === 'string') {
      nextUpdates.username = nextUpdates.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') as any;
      if (!/^[a-z0-9_]{3,32}$/.test(nextUpdates.username as string)) {
        throw new Error('Invalid username format');
      }

      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, nextUpdates.username as string))
        .limit(1);

      if (existing && existing.id !== id) {
        throw new Error('Username already taken');
      }
    }

    const [user] = await db
      .update(users)
      .set({ ...nextUpdates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    // Return full self user record; API routes strip private fields before sending.
    return user as User;
  }

  async getChatsForUser(userId: string): Promise<ChatWithMembers[]> {
    // 1. Find all chat IDs the user is a member of
    const userChats = await db
      .select({ chatId: chatMembers.chatId })
      .from(chatMembers)
      .where(eq(chatMembers.userId, userId));

    const chatIds = userChats.map(uc => uc.chatId);
    if (chatIds.length === 0) return [];

    // 2. Fetch those chats
    const allChats = await db
      .select()
      .from(chats)
      .where(inArray(chats.id, chatIds));

    // 3. Fetch members for those chats
    const allMembers = await db
      .select({
        member: chatMembers,
        user: users
      })
      .from(chatMembers)
      .innerJoin(users, eq(chatMembers.userId, users.id))
      .where(inArray(chatMembers.chatId, chatIds));
    // 4. Fetch the last message for each chat
    // (A bit simplified here, ideally use a window function or subquery)
    const result: ChatWithMembers[] = [];
    
    for (const chat of allChats) {
      const membersForChat = allMembers
        .filter(m => m.member.chatId === chat.id)
        .map(m => ({ ...m.member, user: sanitizeUser(m.user) }));
        
      const [lastMessage] = await db
        .select({
          message: messages,
          sender: users
        })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.chatId, chat.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      // Simple unread count (messages where isRead is false and not sent by me)
      const unreadCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(
          and(
            eq(messages.chatId, chat.id),
            eq(messages.isRead, false),
            sql`${messages.senderId} != ${userId}`
          )
        );

      result.push({
        ...chat,
        members: membersForChat,
        lastMessage: lastMessage ? { ...lastMessage.message, sender: sanitizeUser(lastMessage.sender) } : null,
        unreadCount: Number(unreadCountResult[0]?.count || 0)
      });
    }

    // No longer filter out blocked chats – they should stay visible
    // but the input area will show a "blocked" notice instead

    // Filter out chats hidden by the current user
    const visible = result.filter(chat => {
      const hidden: string[] = (chat.hiddenBy as string[]) || [];
      return !hidden.includes(userId);
    });

    // Sort by last message date
    const uniqueChats = new Map<number, ChatWithMembers>();
    visible.forEach(chat => {
      if (!uniqueChats.has(chat.id)) {
        uniqueChats.set(chat.id, chat);
      }
    });

    return Array.from(uniqueChats.values()).sort((a, b) => {
      // Pinned chats go first, sorted by pinnedAt desc
      const aPinned = a.members.find(m => m.userId === userId)?.pinnedAt;
      const bPinned = b.members.find(m => m.userId === userId)?.pinnedAt;
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      if (aPinned && bPinned) {
        return new Date(bPinned).getTime() - new Date(aPinned).getTime();
      }
      // Then sort by last message date
      const dateA = a.lastMessage?.createdAt || a.createdAt;
      const dateB = b.lastMessage?.createdAt || b.createdAt;
      return new Date(dateB!).getTime() - new Date(dateA!).getTime();
    });
  }

  async getChat(id: number): Promise<ChatWithMembers | undefined> {
    const [chat] = await db.select().from(chats).where(eq(chats.id, id));
    if (!chat) return undefined;

    const members = await db
      .select({
        member: chatMembers,
        user: users
      })
      .from(chatMembers)
      .innerJoin(users, eq(chatMembers.userId, users.id))
      .where(eq(chatMembers.chatId, id));

    return {
      ...chat,
      members: members.map(m => ({ ...m.member, user: sanitizeUser(m.user) }))
    };
  }

  async createDirectChat(userId1: string, userId2: string): Promise<ChatWithMembers> {
    // 1. Check if a direct chat already exists between these two users
    const existingChats = await db
      .select({ chatId: chatMembers.chatId })
      .from(chatMembers)
      .where(eq(chatMembers.userId, userId1));

    // Check if any of these chats have both users as members
    for (const { chatId } of existingChats) {
      const chat = await db
        .select()
        .from(chats)
        .where(eq(chats.id, chatId));

      if (chat.length === 0 || !chat[0].isGroup) {
        // Check if userId2 is also a member of this chat
        const otherMember = await db
          .select()
          .from(chatMembers)
          .where(
            and(
              eq(chatMembers.chatId, chatId),
              eq(chatMembers.userId, userId2)
            )
          );

        if (otherMember.length > 0) {
          // Chat already exists, return it
          return this.getChat(chatId) as Promise<ChatWithMembers>;
        }
      }
    }

    // 2. Create new direct chat if it doesn't exist
    const [chat] = await db
      .insert(chats)
      .values({ isGroup: false })
      .returning();

    // Add both members
    await db.insert(chatMembers).values([
      { chatId: chat.id, userId: userId1, role: 'admin' },
      { chatId: chat.id, userId: userId2, role: 'admin' }
    ]);

    // Return the full chat object
    return this.getChat(chat.id) as Promise<ChatWithMembers>;
  }

  async createGroupChat(name: string, creatorId: string, memberIds: string[]): Promise<ChatWithMembers> {
    // Create the group chat
    const [chat] = await db
      .insert(chats)
      .values({ isGroup: true, isChannel: false, name, creatorId })
      .returning();

    // Add creator as admin + all other members
    const defaultPerms = { canPin: true, canInvite: true, canCreatePolls: true };
    const allMemberIds = [creatorId, ...memberIds.filter(id => id !== creatorId)];
    await db.insert(chatMembers).values(
      allMemberIds.map((userId, i) => ({
        chatId: chat.id,
        userId,
        role: i === 0 ? 'admin' : 'member',
        permissions: i === 0 ? {} : defaultPerms,
      }))
    );

    return this.getChat(chat.id) as Promise<ChatWithMembers>;
  }

  async createChannel(name: string, creatorId: string): Promise<ChatWithMembers> {
    const [chat] = await db
      .insert(chats)
      .values({ isGroup: true, isChannel: true, name, creatorId })
      .returning();

    await db.insert(chatMembers).values({
      chatId: chat.id,
      userId: creatorId,
      role: 'admin',
      permissions: {},
    });

    return this.getChat(chat.id) as Promise<ChatWithMembers>;
  }

  async searchChannels(query: string, userId: string): Promise<Array<{ id: number; name: string | null; avatarUrl: string | null; memberCount: number; isJoined: boolean }>> {
    const normalized = query.trim();
    if (!normalized) return [];

    const found = await db
      .select({
        id: chats.id,
        name: chats.name,
        avatarUrl: chats.avatarUrl,
      })
      .from(chats)
      .where(and(eq(chats.isChannel, true), ilike(chats.name, `%${normalized}%`)))
      .orderBy(desc(chats.updatedAt))
      .limit(50);

    if (found.length === 0) return [];

    const channelIds = found.map((c) => c.id);

    const memberCounts = await db
      .select({
        chatId: chatMembers.chatId,
        count: sql<number>`count(*)`,
      })
      .from(chatMembers)
      .where(inArray(chatMembers.chatId, channelIds))
      .groupBy(chatMembers.chatId);

    const joinedRows = await db
      .select({ chatId: chatMembers.chatId })
      .from(chatMembers)
      .where(and(inArray(chatMembers.chatId, channelIds), eq(chatMembers.userId, userId)));

    const countMap = new Map<number, number>(memberCounts.map((r) => [r.chatId, Number(r.count)]));
    const joinedSet = new Set<number>(joinedRows.map((r) => r.chatId));

    return found.map((c) => ({
      id: c.id,
      name: c.name,
      avatarUrl: c.avatarUrl,
      memberCount: countMap.get(c.id) || 0,
      isJoined: joinedSet.has(c.id),
    }));
  }

  async joinChannel(chatId: number, userId: string): Promise<ChatWithMembers> {
    const chat = await this.getChat(chatId);
    if (!chat) throw new Error('Chat not found');
    if (!chat.isChannel) throw new Error('Not a channel');

    const alreadyMember = chat.members.some((m) => m.userId === userId);
    if (!alreadyMember) {
      await db.insert(chatMembers).values({
        chatId,
        userId,
        role: 'member',
        permissions: { canPin: false, canInvite: false, canCreatePolls: false },
      });
    }

    return this.getChat(chatId) as Promise<ChatWithMembers>;
  }

  async updateGroupChat(chatId: number, updates: { name?: string; avatarUrl?: string | null }): Promise<ChatWithMembers> {
    await db
      .update(chats)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(chats.id, chatId));

    return this.getChat(chatId) as Promise<ChatWithMembers>;
  }

  async setChannelCommentsEnabled(chatId: number, userId: string, enabled: boolean): Promise<ChatWithMembers> {
    const chat = await this.getChat(chatId);
    if (!chat) throw new Error('Chat not found');
    if (!chat.isChannel) throw new Error('Not a channel');

    const member = chat.members.find(m => m.userId === userId);
    if (!member || member.role !== 'admin') {
      throw new Error('Only channel admins can update comments settings');
    }

    await db
      .update(chats)
      .set({ commentsEnabled: enabled, updatedAt: new Date() })
      .where(eq(chats.id, chatId));

    return this.getChat(chatId) as Promise<ChatWithMembers>;
  }

  async addGroupMembers(chatId: number, userIds: string[]): Promise<ChatWithMembers> {
    // Get existing member IDs to avoid duplicates
    const existing = await db
      .select({ userId: chatMembers.userId })
      .from(chatMembers)
      .where(eq(chatMembers.chatId, chatId));
    const existingIds = new Set(existing.map(e => e.userId));

    const newMembers = userIds.filter(id => !existingIds.has(id));
    if (newMembers.length > 0) {
      const defaultPerms = { canPin: true, canInvite: true, canCreatePolls: true };
      await db.insert(chatMembers).values(
        newMembers.map(userId => ({
          chatId,
          userId,
          role: 'member',
          permissions: defaultPerms,
        }))
      );
    }

    return this.getChat(chatId) as Promise<ChatWithMembers>;
  }

  async removeGroupMember(chatId: number, userId: string): Promise<void> {
    await db
      .delete(chatMembers)
      .where(
        and(
          eq(chatMembers.chatId, chatId),
          eq(chatMembers.userId, userId)
        )
      );
  }

  async updateMemberRole(chatId: number, userId: string, role: string): Promise<ChatWithMembers> {
    await db
      .update(chatMembers)
      .set({ role })
      .where(
        and(
          eq(chatMembers.chatId, chatId),
          eq(chatMembers.userId, userId)
        )
      );
    return this.getChat(chatId) as Promise<ChatWithMembers>;
  }

  async updateMemberTitle(chatId: number, userId: string, title: string | null): Promise<ChatWithMembers> {
    await db
      .update(chatMembers)
      .set({ title })
      .where(
        and(
          eq(chatMembers.chatId, chatId),
          eq(chatMembers.userId, userId)
        )
      );
    return this.getChat(chatId) as Promise<ChatWithMembers>;
  }

  async updateMemberPermissions(chatId: number, userId: string, permissions: Record<string, boolean>): Promise<ChatWithMembers> {
    await db
      .update(chatMembers)
      .set({ permissions })
      .where(
        and(
          eq(chatMembers.chatId, chatId),
          eq(chatMembers.userId, userId)
        )
      );
    return this.getChat(chatId) as Promise<ChatWithMembers>;
  }

  async pinChat(chatId: number, userId: string): Promise<void> {
    await db
      .update(chatMembers)
      .set({ pinnedAt: new Date() })
      .where(
        and(
          eq(chatMembers.chatId, chatId),
          eq(chatMembers.userId, userId)
        )
      );
  }

  async unpinChat(chatId: number, userId: string): Promise<void> {
    await db
      .update(chatMembers)
      .set({ pinnedAt: null })
      .where(
        and(
          eq(chatMembers.chatId, chatId),
          eq(chatMembers.userId, userId)
        )
      );
  }

  async getMessagesForChat(chatId: number, userId: string, limit = 50): Promise<MessageWithSender[]> {
    const msgs = await db
      .select({
        message: messages,
        sender: users,
        poll: polls,
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .leftJoin(polls, eq(polls.messageId, messages.id))
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    // Reverse to get chronological order (oldest first) for UI
    // Filter out messages deleted for this user
    const filteredMessages = msgs
      .filter(m => {
        let deletedBy = m.message.deletedBy as any;
        if (deletedBy && typeof deletedBy === 'string') {
          try {
            deletedBy = JSON.parse(deletedBy);
          } catch {
            deletedBy = [];
          }
        }
        if (!deletedBy || !Array.isArray(deletedBy)) return true;
        return !deletedBy.includes(userId);
      })
      .reverse();

    // For messages with polls, fetch the poll results
    const messagesWithPolls = await Promise.all(
      filteredMessages.map(async (m) => {
        const msg = m.message;
        // normalize createdAt to Date
        const created: Date | null = msg.createdAt
          ? msg.createdAt instanceof Date
            ? msg.createdAt
            : new Date(msg.createdAt as any)
          : null;

        let pollData = null;
        const pollId = m.poll?.id ?? null;
        if (pollId !== null && pollId !== undefined) {
          try {
            pollData = await this.getPollResults(pollId, userId);
          } catch (err) {
            console.error('Error fetching poll results:', err);
          }
        }

        return {
          ...msg,
          createdAt: created,
          sender: sanitizeUser(m.sender),
          poll: pollData,
        };
      })
    );

    return messagesWithPolls;
  }

  async searchMessagesInChat(chatId: number, query: string, userId: string, limit = 50): Promise<MessageWithSender[]> {
    const msgs = await db
      .select({
        message: messages,
        sender: users,
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(and(eq(messages.chatId, chatId), ilike(messages.content, `%${query}%`)))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    // Filter out messages deleted for this user and format
    return msgs
      .filter(m => {
        let deletedBy = m.message.deletedBy as any;
        if (deletedBy && typeof deletedBy === 'string') {
          try {
            deletedBy = JSON.parse(deletedBy);
          } catch {
            deletedBy = [];
          }
        }
        if (!deletedBy || !Array.isArray(deletedBy)) return true;
        return !deletedBy.includes(userId);
      })
      .map(m => {
        const msg = m.message;
        const created: Date | null = msg.createdAt
          ? msg.createdAt instanceof Date
            ? msg.createdAt
            : new Date(msg.createdAt as any)
          : null;
        return {
          ...msg,
          createdAt: created,
          sender: sanitizeUser(m.sender),
        };
      })
      .reverse();
  }

  async createMessage(messageData: InsertMessage & { senderId: string }): Promise<MessageWithSender> {
    const [message] = await db
      .insert(messages)
      .values(messageData)
      .returning();

    // Update the chat's updatedAt timestamp and unhide for all users
    // (a new message means the chat should reappear for everyone)
    await db
      .update(chats)
      .set({ updatedAt: new Date(), hiddenBy: [] })
      .where(eq(chats.id, messageData.chatId as number));

    // Fetch the sender to return the full object
    const [sender] = await db.select().from(users).where(eq(users.id, messageData.senderId));

    // normalise createdAt to Date
    const created: Date | null = message.createdAt
      ? message.createdAt instanceof Date
        ? message.createdAt
        : new Date(message.createdAt as any)
      : null;

    return {
      ...message,
      createdAt: created,
      sender: sanitizeUser(sender)
    };
  }

  async markMessagesAsRead(chatId: number, userId: string): Promise<void> {
    await db
      .update(messages)
      .set({ isRead: true })
      .where(
        and(
          eq(messages.chatId, chatId),
          sql`${messages.senderId} != ${userId}`, // Mark others' messages as read
          eq(messages.isRead, false)
        )
      );
  }

  // return nothing (previously returned count)
  async clearMessagesForUser(chatId: number, userId: string): Promise<void> {
    // retrieve ids first so we know what to update
    const allMessages = await db
      .select({ id: messages.id, deletedBy: messages.deletedBy })
      .from(messages)
      .where(eq(messages.chatId, chatId));

    let count = 0;
    for (const msg of allMessages) {
      let deletedBy: string[] = [];
      if (msg.deletedBy) {
        deletedBy = typeof msg.deletedBy === 'string'
          ? JSON.parse(msg.deletedBy as any)
          : (msg.deletedBy as string[]);
      }
      if (!deletedBy.includes(userId)) {
        deletedBy.push(userId);
        await db
          .update(messages)
          .set({ deletedBy: deletedBy })
          .where(eq(messages.id, msg.id));
        count++;
      }
    }
    // ignore count
    void count;
  }

  // Helper that will either hard-delete or mark as deleted for a specific user depending on
  // whether "forAll" was requested and whether the user is the sender of the message.
  async deleteMessage(messageId: number, userId: string, forAll?: boolean): Promise<void> {
    // fetch the message so we know sender and current deletedBy array
    const [msg] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId));
    if (!msg) return;

    const isSender = msg.senderId === userId;
    const shouldHardDelete = forAll && isSender;

    if (shouldHardDelete) {
      // remove the row entirely
      await db
        .delete(messages)
        .where(eq(messages.id, messageId));
    } else {
      // mark as deleted for this user only
      const deletedBy: string[] = (msg.deletedBy as string[]) || [];
      if (!deletedBy.includes(userId)) {
        deletedBy.push(userId);
        await db
          .update(messages)
          .set({ deletedBy })
          .where(eq(messages.id, messageId));
      }
    }
  }

  // Batch version of the above; items include the id and whether the user asked for a
  // deletion-for-everyone.  The implementation simply loops and reuses deleteMessage.
  async deleteMessages(items: { id: number; forAll: boolean }[], userId: string): Promise<void> {
    if (items.length === 0) return;
    for (const { id, forAll } of items) {
      await this.deleteMessage(id, userId, forAll);
    }
  }

  async clearMessagesForAll(chatId: number): Promise<void> {
    // Delete all messages in the chat for everyone
    await db
      .delete(messages)
      .where(eq(messages.chatId, chatId));
  }

  async clearMyMessagesForAll(chatId: number, userId: string): Promise<void> {
    // remove only messages sent by the given user
    await db
      .delete(messages)
      .where(
        and(
          eq(messages.chatId, chatId),
          eq(messages.senderId, userId)
        )
      );
  }

  async editMessage(messageId: number, userId: string, newContent: string): Promise<MessageWithSender> {
    // First verify the message exists and belongs to the user
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!message) {
      throw new Error('Message not found');
    }

    if (message.senderId !== userId) {
      throw new Error('You can only edit your own messages');
    }

    // Update the message
    await db
      .update(messages)
      .set({
        content: newContent,
        isEdited: true,
      })
      .where(eq(messages.id, messageId));

    // Return the updated message with sender info
    const [updated] = await db
      .select()
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.id, messageId))
      .limit(1);

    return {
      ...updated.messages,
      sender: sanitizeUser(updated.users),
    };
  }

  async addReaction(messageId: number, userId: string, emoji: string): Promise<ReactionWithUser> {
    // Verify message exists
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!message) {
      throw new Error('Message not found');
    }

    // Check if this is the same emoji (user toggling)
    const [existing] = await db
      .select()
      .from(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, userId),
          eq(messageReactions.emoji, emoji)
        )
      )
      .limit(1);

    if (existing) {
      // Already reacted with this emoji, return the existing reaction
      const [reaction] = await db
        .select()
        .from(messageReactions)
        .innerJoin(users, eq(messageReactions.userId, users.id))
        .where(eq(messageReactions.id, existing.id))
        .limit(1);

      return {
        ...reaction.message_reactions,
        user: sanitizeUser(reaction.users),
      };
    }

    // Remove any previous reactions from this user on this message (one reaction per user)
    await db
      .delete(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, userId)
        )
      );

    // Add new reaction
    const [newReaction] = await db
      .insert(messageReactions)
      .values({
        messageId,
        userId,
        emoji,
      })
      .returning();

    // Get the reaction with user info
    const [reaction] = await db
      .select()
      .from(messageReactions)
      .innerJoin(users, eq(messageReactions.userId, users.id))
      .where(eq(messageReactions.id, newReaction.id))
      .limit(1);

    return {
      ...reaction.message_reactions,
      user: sanitizeUser(reaction.users),
    };
  }

  async removeReaction(messageId: number, userId: string, emoji: string): Promise<void> {
    // Delete the reaction
    await db
      .delete(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, userId),
          eq(messageReactions.emoji, emoji)
        )
      );
  }

  async getReactions(messageId: number): Promise<ReactionWithUser[]> {
    const reactions = await db
      .select()
      .from(messageReactions)
      .innerJoin(users, eq(messageReactions.userId, users.id))
      .where(eq(messageReactions.messageId, messageId))
      .orderBy(asc(messageReactions.createdAt));

    return reactions.map(r => ({
      ...r.message_reactions,
      user: sanitizeUser(r.users),
    }));
  }

  async updateChatCreator(chatId: number, userId: string): Promise<void> {
    await db
      .update(chats)
      .set({ creatorId: userId })
      .where(eq(chats.id, chatId));
  }

  async deleteChat(chatId: number): Promise<void> {
    // Delete all related data explicitly in correct order
    // 1. Poll votes (reference polls)
    const chatPolls = await db
      .select({ id: polls.id })
      .from(polls)
      .where(eq(polls.chatId, chatId));
    const pollIds = chatPolls.map(p => p.id);
    if (pollIds.length > 0) {
      await db.delete(pollVotes).where(inArray(pollVotes.pollId, pollIds));
      await db.delete(polls).where(inArray(polls.id, pollIds));
    }

    // 2. Pinned messages
    await db.delete(pinnedMessages).where(eq(pinnedMessages.chatId, chatId));

    // 3. Group invite links
    await db.delete(groupInviteLinks).where(eq(groupInviteLinks.chatId, chatId));

    // 4. Message reactions (reference messages)
    const chatMessages = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.chatId, chatId));
    const messageIds = chatMessages.map(m => m.id);
    if (messageIds.length > 0) {
      await db.delete(messageReactions).where(inArray(messageReactions.messageId, messageIds));
      await db.delete(messageComments).where(inArray(messageComments.messageId, messageIds));
    }

    // 5. Messages
    await db.delete(messages).where(eq(messages.chatId, chatId));

    // 6. Chat members
    await db.delete(chatMembers).where(eq(chatMembers.chatId, chatId));

    // 7. Finally delete the chat itself
    await db.delete(chats).where(eq(chats.id, chatId));
  }

  // A01: Verify that a user is a member of the chat that owns a message
  async verifyMessageAccess(messageId: number, userId: string): Promise<boolean> {
    const [msg] = await db
      .select({ chatId: messages.chatId })
      .from(messages)
      .where(eq(messages.id, messageId));
    if (!msg) return false;
    const membership = await db
      .select({ id: chatMembers.id })
      .from(chatMembers)
      .where(
        and(
          eq(chatMembers.chatId, msg.chatId),
          eq(chatMembers.userId, userId)
        )
      );
    return membership.length > 0;
  }

  async getChatByMessageId(messageId: number): Promise<ChatWithMembers | null> {
    const [msg] = await db
      .select({ chatId: messages.chatId })
      .from(messages)
      .where(eq(messages.id, messageId));
    if (!msg) return null;
    return (await this.getChat(msg.chatId)) ?? null;
  }

  async listComments(messageId: number, userId: string): Promise<(MessageComment & { sender: User })[]> {
    const hasAccess = await this.verifyMessageAccess(messageId, userId);
    if (!hasAccess) throw new Error('Forbidden');

    const rows = await db
      .select({ comment: messageComments, sender: users })
      .from(messageComments)
      .innerJoin(users, eq(messageComments.senderId, users.id))
      .where(eq(messageComments.messageId, messageId))
      .orderBy(asc(messageComments.createdAt));

    return rows.map(r => ({
      ...r.comment,
      sender: sanitizeUser(r.sender),
    })) as any;
  }

  async addComment(messageId: number, userId: string, content: string): Promise<MessageComment & { sender: User }> {
    const hasAccess = await this.verifyMessageAccess(messageId, userId);
    if (!hasAccess) throw new Error('Forbidden');

    const [msg] = await db
      .select({ chatId: messages.chatId })
      .from(messages)
      .where(eq(messages.id, messageId));
    if (!msg) throw new Error('Message not found');

    const chat = await this.getChat(msg.chatId);
    if (!chat) throw new Error('Chat not found');

    if (chat.isChannel && chat.commentsEnabled === false) {
      throw new Error('Comments are disabled for this channel');
    }

    const [comment] = await db
      .insert(messageComments)
      .values({ messageId, senderId: userId, content, isEdited: false })
      .returning();

    const [sender] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return { ...comment, sender: sanitizeUser(sender) } as any;
  }

  async editComment(messageId: number, commentId: number, userId: string, content: string): Promise<MessageComment & { sender: User }> {
    const hasAccess = await this.verifyMessageAccess(messageId, userId);
    if (!hasAccess) throw new Error('Forbidden');

    const [existing] = await db
      .select()
      .from(messageComments)
      .where(and(eq(messageComments.id, commentId), eq(messageComments.messageId, messageId)));
    if (!existing) throw new Error('Comment not found');
    if (existing.senderId !== userId) throw new Error('You can only edit your own comments');

    const [updated] = await db
      .update(messageComments)
      .set({ content, isEdited: true, updatedAt: new Date() })
      .where(eq(messageComments.id, commentId))
      .returning();

    const [sender] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return { ...updated, sender: sanitizeUser(sender) } as any;
  }

  async deleteComment(messageId: number, commentId: number, userId: string): Promise<void> {
    const hasAccess = await this.verifyMessageAccess(messageId, userId);
    if (!hasAccess) throw new Error('Forbidden');

    const [existing] = await db
      .select()
      .from(messageComments)
      .where(and(eq(messageComments.id, commentId), eq(messageComments.messageId, messageId)));
    if (!existing) throw new Error('Comment not found');

    const [msg] = await db
      .select({ chatId: messages.chatId })
      .from(messages)
      .where(eq(messages.id, messageId));
    if (!msg) throw new Error('Message not found');

    const chat = await this.getChat(msg.chatId);
    const me = chat?.members.find(m => m.userId === userId);
    const canModerate = !!me && me.role === 'admin';

    if (existing.senderId !== userId && !canModerate) {
      throw new Error('You can only delete your own comments');
    }

    await db.delete(messageComments).where(eq(messageComments.id, commentId));
  }

  async leaveChatForUser(chatId: number, userId: string): Promise<void> {
    // Add userId to the chat's hiddenBy array so it disappears only for this user
    const chat = await this.getChat(chatId);
    if (!chat) return;
    const hiddenBy: string[] = (chat.hiddenBy as string[]) || [];
    if (!hiddenBy.includes(userId)) {
      hiddenBy.push(userId);
    }
    await db
      .update(chats)
      .set({ hiddenBy })
      .where(eq(chats.id, chatId));
  }

  // ═══════════════════════════════════════════════════════════════
  // PINNED MESSAGES
  // ═══════════════════════════════════════════════════════════════

  async pinMessage(chatId: number, messageId: number, userId: string): Promise<PinnedMessageWithDetails> {
    // Verify chat exists and user is a member
    const chat = await this.getChat(chatId);
    if (!chat) throw new Error('Chat not found');
    
    const member = chat.members.find(m => m.userId === userId);
    if (!member) throw new Error('Not a chat member');
    
    // Verify message exists and belongs to this chat
    const [message] = await db
      .select()
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.id, messageId))
      .limit(1);
    
    if (!message || message.messages.chatId !== chatId) {
      throw new Error('Message not found');
    }
    
    // Check if already pinned
    const existing = await db
      .select()
      .from(pinnedMessages)
      .where(
        and(
          eq(pinnedMessages.chatId, chatId),
          eq(pinnedMessages.messageId, messageId)
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      // Already pinned, just return it with details
      const [pinnedUser] = await db.select().from(users).where(eq(users.id, existing[0].pinnedBy)).limit(1);
      return {
        ...existing[0],
        message: {
          ...message.messages,
          sender: sanitizeUser(message.users),
        },
        pinnedByUser: sanitizeUser(pinnedUser),
      };
    }
    
    // Pin the message
    const [pinned] = await db
      .insert(pinnedMessages)
      .values({
        chatId,
        messageId,
        pinnedBy: userId,
      })
      .returning();
    
    const [pinnedUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    
    return {
      ...pinned,
      message: {
        ...message.messages,
        sender: sanitizeUser(message.users),
      },
      pinnedByUser: sanitizeUser(pinnedUser),
    };
  }

  async unpinMessage(chatId: number, messageId: number, userId: string): Promise<void> {
    // Verify chat exists and user is a member
    const chat = await this.getChat(chatId);
    if (!chat) throw new Error('Chat not found');
    
    const member = chat.members.find(m => m.userId === userId);
    if (!member) throw new Error('Not a chat member');
    
    // Delete the pinned message
    const result = await db
      .delete(pinnedMessages)
      .where(
        and(
          eq(pinnedMessages.chatId, chatId),
          eq(pinnedMessages.messageId, messageId)
        )
      )
      .returning();
    
    if (result.length === 0) {
      throw new Error('Pinned message not found');
    }
  }

  async getPinnedMessages(chatId: number, userId: string): Promise<PinnedMessageWithDetails[]> {
    // Verify user is a member
    const chat = await this.getChat(chatId);
    if (!chat) throw new Error('Chat not found');
    
    const member = chat.members.find(m => m.userId === userId);
    if (!member) throw new Error('Not a chat member');
    
    // Get pinned messages with full details
    const pinned = await db
      .select()
      .from(pinnedMessages)
      .innerJoin(messages, eq(pinnedMessages.messageId, messages.id))
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(pinnedMessages.chatId, chatId))
      .orderBy(desc(pinnedMessages.pinnedAt));
    
    const results: PinnedMessageWithDetails[] = [];
    for (const p of pinned) {
      const [pinnedByUser] = await db.select().from(users).where(eq(users.id, p.pinned_messages.pinnedBy)).limit(1);
      results.push({
        ...p.pinned_messages,
        message: {
          ...p.messages,
          sender: sanitizeUser(p.users),
        },
        pinnedByUser: sanitizeUser(pinnedByUser),
      });
    }
    
    return results;
  }

  // ═══════════════════════════════════════════════════════════════
  // GROUP INVITE LINKS
  // ═══════════════════════════════════════════════════════════════

  async createInviteLink(
    chatId: number,
    userId: string,
    expiresAt?: Date,
    maxUses?: number
  ): Promise<GroupInviteLink> {
    // Verify chat exists and is a group
    const chat = await this.getChat(chatId);
    if (!chat) throw new Error('Chat not found');
    if (!chat.isGroup) throw new Error('Not a group chat');
    
    // Verify user is an admin
    const member = chat.members.find(m => m.userId === userId);
    if (!member || member.role !== 'admin') {
      throw new Error('Only admins can create invite links');
    }
    
    // Generate unique token
    const token = randomBytes(16).toString('hex');
    
    const [inviteLink] = await db
      .insert(groupInviteLinks)
      .values({
        chatId,
        token,
        createdBy: userId,
        expiresAt,
        maxUses: maxUses ?? null,
        currentUses: 0,
        isActive: true,
      })
      .returning();
    
    return inviteLink;
  }

  async getInviteLinks(chatId: number, userId: string): Promise<GroupInviteLink[]> {
    // Verify user is a member
    const chat = await this.getChat(chatId);
    if (!chat) throw new Error('Chat not found');
    
    const member = chat.members.find(m => m.userId === userId);
    if (!member) throw new Error('Not a chat member');
    
    const links = await db
      .select()
      .from(groupInviteLinks)
      .where(eq(groupInviteLinks.chatId, chatId))
      .orderBy(desc(groupInviteLinks.createdAt));
    
    return links;
  }

  async revokeInviteLink(token: string, userId: string): Promise<void> {
    const [link] = await db
      .select()
      .from(groupInviteLinks)
      .where(eq(groupInviteLinks.token, token))
      .limit(1);
    
    if (!link) throw new Error('Invite link not found');
    
    // Verify user is an admin of the chat
    const chat = await this.getChat(link.chatId);
    if (!chat) throw new Error('Chat not found');
    
    const member = chat.members.find(m => m.userId === userId);
    if (!member || member.role !== 'admin') {
      throw new Error('Only admins can revoke invite links');
    }
    
    // Deactivate the link
    await db
      .update(groupInviteLinks)
      .set({ isActive: false })
      .where(eq(groupInviteLinks.token, token));
  }

  async joinViaInviteLink(token: string, userId: string): Promise<ChatWithMembers> {
    const [link] = await db
      .select()
      .from(groupInviteLinks)
      .where(eq(groupInviteLinks.token, token))
      .limit(1);
    
    if (!link) throw new Error('Invite link not found');
    if (!link.isActive) throw new Error('Invite link is not active');
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      throw new Error('Invite link expired');
    }
    if (link.maxUses && link.currentUses >= link.maxUses) {
      throw new Error('Invite link has reached maximum uses');
    }
    
    const chat = await this.getChat(link.chatId);
    if (!chat) throw new Error('Chat not found');
    
    // Check if already a member
    const existingMember = chat.members.find(m => m.userId === userId);
    if (existingMember) {
      throw new Error('Already a member of this group');
    }
    
    // Add user to the group
    await db.insert(chatMembers).values({
      chatId: link.chatId,
      userId,
      role: 'member',
    });
    
    // Increment uses count
    await db
      .update(groupInviteLinks)
      .set({ currentUses: link.currentUses + 1 })
      .where(eq(groupInviteLinks.token, token));
    
    // Return updated chat
    return (await this.getChat(link.chatId))!;
  }

  async getInviteLinkInfo(token: string): Promise<{ chatName: string; chatAvatar: string | null; memberCount: number }> {
    const [link] = await db
      .select()
      .from(groupInviteLinks)
      .where(eq(groupInviteLinks.token, token))
      .limit(1);
    
    if (!link) throw new Error('Invite link not found');
    if (!link.isActive) throw new Error('Invite link is not active');
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      throw new Error('Invite link expired');
    }
    
    const chat = await this.getChat(link.chatId);
    if (!chat) throw new Error('Chat not found');
    
    return {
      chatName: chat.name || 'Group',
      chatAvatar: chat.avatarUrl,
      memberCount: chat.members.length,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // POLLS
  // ═══════════════════════════════════════════════════════════════

  private normalizePollOptions(rawOptions: unknown): PollOption[] {
    let parsed: unknown = rawOptions;

    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        return [];
      }
    }

    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item, index) => {
        if (typeof item === 'string') {
          return {
            id: index,
            text: item,
          };
        }

        if (item && typeof item === 'object') {
          const option = item as { id?: unknown; text?: unknown };
          const normalizedText = typeof option.text === 'string' ? option.text : '';
          const normalizedId = typeof option.id === 'number' ? option.id : index;

          if (!normalizedText) return null;

          return {
            id: normalizedId,
            text: normalizedText,
          };
        }

        return null;
      })
      .filter((option): option is PollOption => option !== null);
  }

  async createPoll(
    chatId: number,
    userId: string,
    question: string,
    options: string[],
    allowMultipleAnswers?: boolean,
    isAnonymous?: boolean,
    closesAt?: Date
  ): Promise<PollWithResults> {
    // Verify chat exists and is a group
    const chat = await this.getChat(chatId);
    if (!chat) throw new Error('Chat not found');
    if (!chat.isGroup) throw new Error('Not a group chat');
    
    // Verify user is a member
    const member = chat.members.find(m => m.userId === userId);
    if (!member) throw new Error('Not a chat member');
    
    // Create poll options
    const pollOptions: PollOption[] = options.map((text, index) => ({
      id: index,
      text,
    }));
    
    // Create a message for the poll
    const pollMessage = await this.createMessage({
      chatId,
      senderId: userId,
      content: `📊 Poll: ${question}`,
      attachments: [],
    });
    
    // Create the poll
    const [poll] = await db
      .insert(polls)
      .values({
        chatId,
        messageId: pollMessage.id,
        createdBy: userId,
        question,
        options: pollOptions as any,
        allowMultipleAnswers: allowMultipleAnswers ?? false,
        isAnonymous: isAnonymous ?? false,
        isClosed: false,
        closesAt,
      })
      .returning();
    
    return {
      ...poll,
      options: pollOptions,
      results: pollOptions.map(opt => ({ optionId: opt.id, count: 0, voters: [] })),
      userVotes: [],
      totalVotes: 0,
    };
  }

  async votePoll(pollId: number, userId: string, optionIds: number[]): Promise<PollWithResults> {
    // Get the poll
    const [poll] = await db
      .select()
      .from(polls)
      .where(eq(polls.id, pollId))
      .limit(1);
    
    if (!poll) throw new Error('Poll not found');
    if (poll.isClosed) throw new Error('Poll is closed');
    if (poll.closesAt && new Date(poll.closesAt) < new Date()) {
      throw new Error('Poll is closed');
    }
    
    // Verify user is a chat member
    const chat = await this.getChat(poll.chatId);
    if (!chat) throw new Error('Chat not found');
    
    const member = chat.members.find(m => m.userId === userId);
    if (!member) throw new Error('Not a chat member');
    
    // Validate option IDs
    const pollOptions = this.normalizePollOptions(poll.options);
    const validOptionIds = pollOptions.map(o => o.id);
    if (!optionIds.every(id => validOptionIds.includes(id))) {
      throw new Error('Invalid option IDs');
    }
    
    // If single answer, check that only one option is selected
    if (!poll.allowMultipleAnswers && optionIds.length > 1) {
      throw new Error('Poll does not allow multiple answers');
    }
    
    // Remove existing votes
    await db
      .delete(pollVotes)
      .where(
        and(
          eq(pollVotes.pollId, pollId),
          eq(pollVotes.userId, userId)
        )
      );
    
    // Add new votes
    for (const optionId of optionIds) {
      await db.insert(pollVotes).values({
        pollId,
        userId,
        optionId,
      });
    }
    
    return this.getPollResults(pollId, userId);
  }

  async closePoll(pollId: number, userId: string): Promise<PollWithResults> {
    // Get the poll
    const [poll] = await db
      .select()
      .from(polls)
      .where(eq(polls.id, pollId))
      .limit(1);
    
    if (!poll) throw new Error('Poll not found');
    
    // Verify user is creator or admin
    const chat = await this.getChat(poll.chatId);
    if (!chat) throw new Error('Chat not found');
    
    const member = chat.members.find(m => m.userId === userId);
    if (!member) throw new Error('Not a chat member');
    
    if (poll.createdBy !== userId && member.role !== 'admin') {
      throw new Error('Only poll creator or group admins can close the poll');
    }
    
    // Close the poll
    await db
      .update(polls)
      .set({ isClosed: true })
      .where(eq(polls.id, pollId));
    
    return this.getPollResults(pollId, userId);
  }

  async getPollResults(pollId: number, userId: string): Promise<PollWithResults> {
    // Get the poll
    const [poll] = await db
      .select()
      .from(polls)
      .where(eq(polls.id, pollId))
      .limit(1);
    
    if (!poll) throw new Error('Poll not found');
    
    // Verify user is a chat member
    const chat = await this.getChat(poll.chatId);
    if (!chat) throw new Error('Chat not found');
    
    const member = chat.members.find(m => m.userId === userId);
    if (!member) throw new Error('Not a chat member');
    
    // Get all votes
    const votes = await db
      .select()
      .from(pollVotes)
      .where(eq(pollVotes.pollId, pollId));
    
    // Get user votes
    const userVotes = votes
      .filter(v => v.userId === userId)
      .map(v => v.optionId);
    
    // Calculate results
    const pollOptions = this.normalizePollOptions(poll.options);
    const results = await Promise.all(
      pollOptions.map(async (opt) => {
        const optionVotes = votes.filter(v => v.optionId === opt.id);
        const count = optionVotes.length;
        
        let voters: User[] = [];
        if (!poll.isAnonymous) {
          const voterIds = optionVotes.map(v => v.userId);
          if (voterIds.length > 0) {
            const voterUsers = await db
              .select()
              .from(users)
              .where(inArray(users.id, voterIds));
            voters = voterUsers.map(sanitizeUser);
          }
        }
        
        return {
          optionId: opt.id,
          count,
          voters: poll.isAnonymous ? undefined : voters,
        };
      })
    );
    
    return {
      ...poll,
      options: pollOptions,
      results,
      userVotes,
      totalVotes: votes.length,
    };
  }
}

export const storage = new DatabaseStorage();