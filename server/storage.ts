import { db } from "./db";
import {
  chats,
  chatMembers,
  messages,
  users,
  blocks,
  type User,
  type ChatWithMembers,
  type MessageWithSender,
  type InsertChat,
  type InsertMessage,
} from "@shared/schema";
import { eq, or, and, desc, asc, ilike, sql, inArray } from "drizzle-orm";

/** Strip ALL private fields from a user object so other users never see them.
 * Returns `any` intentionally – the type system's `User` includes these fields
 * but they must NOT reach the client. */
function sanitizeUser(user: Record<string, any>): any {
  const { password, email, theme, createdAt, updatedAt, ...safe } = user;
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
  deleteChat(chatId: number): Promise<void>;
  leaveChatForUser(chatId: number, userId: string): Promise<void>;
  
  // Message operations
  getMessagesForChat(chatId: number, userId: string, limit?: number): Promise<MessageWithSender[]>;
  createMessage(message: InsertMessage & { senderId: string }): Promise<MessageWithSender>;
  markMessagesAsRead(chatId: number, userId: string): Promise<void>;
  clearMessagesForUser(chatId: number, userId: string): Promise<void>;
  clearMessagesForAll(chatId: number): Promise<void>;
  clearMyMessagesForAll(chatId: number, userId: string): Promise<void>;
  // deletion helpers – scoped so users can remove their own messages for themselves or for everyone
  deleteMessage(messageId: number, userId: string, forAll?: boolean): Promise<void>;
  deleteMessages(items: { id: number; forAll: boolean }[], userId: string): Promise<void>;
  // A01: verify the user is a member of the chat that owns a given message
  verifyMessageAccess(messageId: number, userId: string): Promise<boolean>;
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
    // Exclude yourself and any users you've blocked or who have blocked you
    const rows = await db.select()
      .from(users)
      .where(
        and(
          or(
            ilike(users.firstName, `%${query}%`),
            ilike(users.lastName, `%${query}%`),
            ilike(users.email, `%${query}%`)
          ),
          sql`${users.id} != ${currentUserId}`,
          sql`NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ${currentUserId} AND b.blocked_id = ${users.id}) OR (b.blocker_id = ${users.id} AND b.blocked_id = ${currentUserId}))`
        )
      )
      .limit(20);
    return rows.map(sanitizeUser) as User[];
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return sanitizeUser(user) as User;
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

  async getMessagesForChat(chatId: number, userId: string, limit = 50): Promise<MessageWithSender[]> {
    const msgs = await db
      .select({
        message: messages,
        sender: users
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    // Reverse to get chronological order (oldest first) for UI
    // Filter out messages deleted for this user
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
        // normalize createdAt to Date
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

  async deleteChat(chatId: number): Promise<void> {
    // Delete all messages first (cascade might do this, but explicit is better)
    await db
      .delete(messages)
      .where(eq(messages.chatId, chatId));
    
    // Delete all chat members
    await db
      .delete(chatMembers)
      .where(eq(chatMembers.chatId, chatId));
    
    // Delete the chat
    await db
      .delete(chats)
      .where(eq(chats.id, chatId));
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
}

export const storage = new DatabaseStorage();