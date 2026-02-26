import { db } from "./db";
import {
  chats,
  chatMembers,
  messages,
  users,
  type User,
  type ChatWithMembers,
  type MessageWithSender,
  type InsertChat,
  type InsertMessage,
} from "@shared/schema";
import { eq, or, and, desc, asc, ilike, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // User operations
  searchUsers(query: string, currentUserId: string): Promise<User[]>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;

  // Chat operations
  getChatsForUser(userId: string): Promise<ChatWithMembers[]>;
  getChat(id: number): Promise<ChatWithMembers | undefined>;
  createDirectChat(userId1: string, userId2: string): Promise<ChatWithMembers>;
  deleteChat(chatId: number): Promise<void>;
  
  // Message operations
  getMessagesForChat(chatId: number, userId: string, limit?: number): Promise<MessageWithSender[]>;
  createMessage(message: InsertMessage & { senderId: string }): Promise<MessageWithSender>;
  markMessagesAsRead(chatId: number, userId: string): Promise<void>;
  clearMessagesForUser(chatId: number, userId: string): Promise<void>;
  clearMessagesForAll(chatId: number): Promise<void>;
  deleteMessage(messageId: number): Promise<void>;
  deleteMessages(messageIds: number[]): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async searchUsers(query: string, currentUserId: string): Promise<User[]> {
    return await db.select()
      .from(users)
      .where(
        and(
          or(
            ilike(users.firstName, `%${query}%`),
            ilike(users.lastName, `%${query}%`),
            ilike(users.email, `%${query}%`)
          ),
          // Don't return the current user
          sql`${users.id} != ${currentUserId}`
        )
      )
      .limit(20);
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
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
        .map(m => ({ ...m.member, user: m.user }));
        
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
        lastMessage: lastMessage ? { ...lastMessage.message, sender: lastMessage.sender } : null,
        unreadCount: Number(unreadCountResult[0]?.count || 0)
      });
    }

    // Sort by last message date
    const uniqueChats = new Map<number, ChatWithMembers>();
    result.forEach(chat => {
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
      members: members.map(m => ({ ...m.member, user: m.user }))
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
        const deletedBy = m.message.deletedBy as string[] | null;
        if (!deletedBy || !Array.isArray(deletedBy)) return true;
        return !deletedBy.includes(userId);
      })
      .map(m => {
        const msg = m.message;
        // Ensure createdAt is in ISO format with Z for UTC
        const messageWithISODate = {
          ...msg,
          createdAt: msg.createdAt instanceof Date 
            ? msg.createdAt.toISOString() 
            : typeof msg.createdAt === 'string' 
              ? msg.createdAt
              : new Date(msg.createdAt).toISOString(),
          sender: m.sender
        };
        return messageWithISODate;
      })
      .reverse();
  }

  async createMessage(messageData: InsertMessage & { senderId: string }): Promise<MessageWithSender> {
    const [message] = await db
      .insert(messages)
      .values(messageData)
      .returning();

    // Update the chat's updatedAt timestamp
    await db
      .update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.id, messageData.chatId));

    // Fetch the sender to return the full object
    const [sender] = await db.select().from(users).where(eq(users.id, messageData.senderId));

    // Ensure createdAt is in ISO format with Z for UTC
    return {
      ...message,
      createdAt: message.createdAt instanceof Date 
        ? message.createdAt.toISOString() 
        : typeof message.createdAt === 'string' 
          ? message.createdAt
          : new Date(message.createdAt).toISOString(),
      sender
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

  async clearMessagesForUser(chatId: number, userId: string): Promise<void> {
    // Mark all messages in this chat as deleted for this user by adding userId to deletedBy array
    const allMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId));

    for (const msg of allMessages) {
      const deletedBy = (msg.deletedBy as string[]) || [];
      if (!deletedBy.includes(userId)) {
        deletedBy.push(userId);
      }
      
      await db
        .update(messages)
        .set({ deletedBy: deletedBy })
        .where(eq(messages.id, msg.id));
    }
  }

  async deleteMessage(messageId: number): Promise<void> {
    // Hard-delete the message for both users
    await db
      .delete(messages)
      .where(eq(messages.id, messageId));
  }

  async deleteMessages(messageIds: number[]): Promise<void> {
    // Hard-delete multiple messages for both users
    if (messageIds.length === 0) return;
    await db
      .delete(messages)
      .where(inArray(messages.id, messageIds));
  }

  async clearMessagesForAll(chatId: number): Promise<void> {
    // Delete all messages in the chat for everyone
    await db
      .delete(messages)
      .where(eq(messages.chatId, chatId));
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
}

export const storage = new DatabaseStorage();