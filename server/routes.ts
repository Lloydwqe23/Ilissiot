import type { Express } from "express";
import { type Server, type IncomingMessage, ServerResponse } from "http";
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from "./storage";
import { db } from "./db";
import { messages } from "@shared/schema";
import { eq } from "drizzle-orm";
import { setupAuth, registerAuthRoutes, isAuthenticated, sessionMiddleware } from "./auth/local";
import { registerUploadRoutes } from "./upload";
import { api, WS_EVENTS, type WsMessage } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Set up authentication FIRST
  await setupAuth(app);
  registerAuthRoutes(app);
  registerUploadRoutes(app);

  // Set up WebSocket server (noServer mode to avoid conflict with Vite HMR)
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests for /ws path
  // A01: Authenticate WebSocket connections via session cookie
  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    if (url.pathname === '/ws') {
      // Parse the session from the cookie before upgrading
      const res = new ServerResponse(request);
      sessionMiddleware(request as any, res as any, () => {
        const userId = (request as any).session?.userId;
        if (!userId) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        // Attach the authenticated userId to the request
        (request as any).authenticatedUserId = userId;
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      });
    }
    // Let other upgrade requests (e.g. Vite HMR) pass through
  });
  
  // Map of userId -> WebSocket connection
  const clients = new Map<string, WebSocket>();

  wss.on('connection', (ws, req) => {
    // A01: userId is now authenticated from the session, NOT from the client payload
    const currentUserId: string = (req as any).authenticatedUserId;
    clients.set(currentUserId, ws);

    // Mark user as online
    (async () => {
      try {
        await storage.updateUser(currentUserId, { status: 'online' });
        broadcast(currentUserId, {
          type: WS_EVENTS.USER_STATUS,
          payload: { userId: currentUserId, status: 'online' }
        });
        const onlineUserIds = Array.from(clients.keys());
        ws.send(JSON.stringify({
          type: WS_EVENTS.ONLINE_USERS,
          payload: { userIds: onlineUserIds }
        }));
      } catch (e) {
        console.error('WS connect error:', e);
      }
    })();

    ws.on('message', async (data) => {
      try {
        const message: WsMessage = JSON.parse(data.toString());
        
        // Ignore connect events – auth is handled on upgrade
        if (message.type === WS_EVENTS.CONNECT) {
          return;
        }
        else if (message.type === WS_EVENTS.TYPING_START || message.type === WS_EVENTS.TYPING_STOP) {
          // Forward typing events to the chat members
          const payload = message.payload as { chatId: number };
          const chat = await storage.getChat(payload.chatId);
          if (chat && currentUserId) {
            const typingMember = chat.members.find(m => m.userId === currentUserId);
            const userName = typingMember?.user?.firstName || 'Someone';
            chat.members.forEach(member => {
              if (member.userId !== currentUserId) {
                // userId should always be set for chat members
                sendToUser(member.userId!, {
                  type: message.type,
                  payload: { chatId: payload.chatId, userId: currentUserId, userName }
                });
              }
            });
          }
        }
        // ── WebRTC Call Signaling ──────────────────────────────────
        else if (
          message.type === WS_EVENTS.CALL_OFFER ||
          message.type === WS_EVENTS.CALL_ANSWER ||
          message.type === WS_EVENTS.CALL_ICE_CANDIDATE ||
          message.type === WS_EVENTS.CALL_HANGUP ||
          message.type === WS_EVENTS.CALL_REJECT ||
          message.type === WS_EVENTS.CALL_BUSY
        ) {
          // Forward the signaling message to the target user
          const payload = message.payload as { targetUserId: string; [key: string]: any };
          if (payload.targetUserId && currentUserId) {
            // Block check for call offers – reject if either user blocked the other
            if (message.type === WS_EVENTS.CALL_OFFER) {
              const blockStatus = await storage.getBlockStatus(currentUserId, payload.targetUserId);
              if (blockStatus.blocked || blockStatus.blockedBy) {
                // Send a reject back to the caller
                sendToUser(currentUserId, {
                  type: WS_EVENTS.CALL_REJECT,
                  payload: { fromUserId: payload.targetUserId }
                });
                return;
              }
            }
            sendToUser(payload.targetUserId, {
              type: message.type,
              payload: { ...payload, fromUserId: currentUserId }
            });
          }
        }
      } catch (e) {
        console.error('WS message error:', e);
      }
    });

    ws.on('close', async () => {
      if (currentUserId) {
        clients.delete(currentUserId);
        
        // Update status
        await storage.updateUser(currentUserId, { 
          status: 'offline', 
          lastSeen: new Date() 
        });
        
        // Broadcast status change
        broadcast(currentUserId, {
          type: WS_EVENTS.USER_STATUS,
          payload: { userId: currentUserId, status: 'offline', lastSeen: new Date() }
        });
      }
    });
  });

  // Helper to send message to a specific user
  function sendToUser(userId: string, message: WsMessage) {
    const ws = clients.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  // Helper to broadcast to everyone EXCEPT the sender
  function broadcast(senderId: string, message: WsMessage) {
    clients.forEach((ws, userId) => {
      if (userId !== senderId && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
  }

  // API Routes

  // User Profile Updates
  app.patch(api.users.updateProfile.path, isAuthenticated, async (req: any, res) => {
    try {
      const input = api.users.updateProfile.input.parse(req.body);
      const userId = req.user.claims.sub;
      const user = await storage.updateUser(userId, input);
      // Return own profile with all fields except password
      const { password, ...safeUser } = user as any;
      res.json(safeUser);
    } catch (err) {
      console.error("Update profile error:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Search users (automatically filters out blocked relationships)
  app.get('/api/users/search', isAuthenticated, async (req: any, res) => {
    try {
      const query = req.query.q as string;
      const userId = req.user.claims.sub;
      if (!query) {
        return res.json([]);
      }
      const users = await storage.searchUsers(query, userId);
      res.json(users);
    } catch (err) {
      console.error("Search users error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Block another user
  app.post('/api/users/:userId/block', isAuthenticated, async (req: any, res) => {
    try {
      const targetId = req.params.userId as string;
      const currentUserId = req.user.claims.sub;
      if (targetId === currentUserId) {
        return res.status(400).json({ message: "Cannot block yourself" });
      }
      await storage.blockUser(currentUserId, targetId);
      res.json({ success: true });
    } catch (err) {
      console.error("Block user error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get current user's blocked users list
  app.get('/api/users/blocked', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const users = await storage.getBlockedUsers(currentUserId);
      res.json(users);
    } catch (err) {
      console.error("Get blocked users error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Unblock user
  app.post('/api/users/:userId/unblock', isAuthenticated, async (req: any, res) => {
    try {
      const targetId = req.params.userId as string;
      const currentUserId = req.user.claims.sub;
      await storage.unblockUser(currentUserId, targetId);
      res.json({ success: true });
    } catch (err) {
      console.error("Unblock user error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get block status for a user pair
  app.get('/api/users/:userId/block-status', isAuthenticated, async (req: any, res) => {
    try {
      const otherId = req.params.userId as string;
      const currentUserId = req.user.claims.sub;
      const status = await storage.getBlockStatus(currentUserId, otherId);
      res.json(status);
    } catch (err) {
      console.error("Block status error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // List chats
  app.get(api.chats.list.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const chats = await storage.getChatsForUser(userId);
      res.json(chats);
    } catch (err) {
      console.error("Get chats error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get single chat
  app.get(api.chats.get.path, isAuthenticated, async (req: any, res) => {
    try {
      const chat = await storage.getChat(Number(req.params.id));
      if (!chat) {
        return res.status(404).json({ message: "Chat not found" });
      }
      
      const userId = req.user.claims.sub;
      const isMember = chat.members.some(m => m.userId === userId);
      if (!isMember) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      res.json(chat);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create direct chat
  app.post(api.chats.createDirect.path, isAuthenticated, async (req: any, res) => {
    try {
      const input = api.chats.createDirect.input.parse(req.body);
      const currentUserId = req.user.claims.sub;
      
      if (input.userId === currentUserId) {
        return res.status(400).json({ message: "Cannot create chat with yourself" });
      }

      const chat = await storage.createDirectChat(currentUserId, input.userId);
      res.status(201).json(chat);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Pin a chat
  app.post('/api/chats/:chatId/pin', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const userId = req.user.claims.sub;
      await storage.pinChat(chatId, userId);
      res.json({ success: true });
    } catch (err) {
      console.error("Pin chat error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Unpin a chat
  app.post('/api/chats/:chatId/unpin', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const userId = req.user.claims.sub;
      await storage.unpinChat(chatId, userId);
      res.json({ success: true });
    } catch (err) {
      console.error("Unpin chat error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create group chat
  app.post(api.chats.createGroup.path, isAuthenticated, async (req: any, res) => {
    try {
      const input = api.chats.createGroup.input.parse(req.body);
      const currentUserId = req.user.claims.sub;
      const chat = await storage.createGroupChat(input.name, currentUserId, input.memberIds);
      res.status(201).json(chat);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Create group chat error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update group chat (name, avatar)
  app.patch('/api/chats/:chatId', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const userId = req.user.claims.sub;
      const input = api.chats.updateGroup.input.parse(req.body);

      const chat = await storage.getChat(chatId);
      if (!chat) return res.status(404).json({ message: "Chat not found" });
      if (!chat.isGroup) return res.status(400).json({ message: "Not a group chat" });
      const member = chat.members.find(m => m.userId === userId);
      if (!member) return res.status(401).json({ message: "Unauthorized" });

      // Only admins or members with canEditInfo permission can edit group info
      const perms = (member.permissions || {}) as Record<string, boolean>;
      if (member.role !== 'admin' && !perms.canEditInfo) {
        return res.status(403).json({ message: "You don't have permission to edit group info" });
      }

      const updated = await storage.updateGroupChat(chatId, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Update group chat error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Add members to group chat
  app.post('/api/chats/:chatId/members', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const userId = req.user.claims.sub;
      const { userIds } = req.body as { userIds: string[] };

      const chat = await storage.getChat(chatId);
      if (!chat) return res.status(404).json({ message: "Chat not found" });
      if (!chat.isGroup) return res.status(400).json({ message: "Not a group chat" });
      if (!chat.members.some(m => m.userId === userId)) return res.status(401).json({ message: "Unauthorized" });

      const updated = await storage.addGroupMembers(chatId, userIds);
      res.json(updated);
    } catch (err) {
      console.error("Add group members error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Helper: resolve the effective creator of a group chat
  // Falls back to the earliest-joined admin if creatorId is not set (legacy groups)
  function getEffectiveCreatorId(chat: any): string | null {
    if (chat.creatorId) return chat.creatorId;
    const admins = chat.members
      .filter((m: any) => m.role === 'admin')
      .sort((a: any, b: any) => new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime());
    return admins.length > 0 ? admins[0].userId : null;
  }

  // Remove member from group chat
  app.delete('/api/chats/:chatId/members/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const currentUserId = req.user.claims.sub;
      const targetUserId = req.params.userId;

      const chat = await storage.getChat(chatId);
      if (!chat) return res.status(404).json({ message: "Chat not found" });
      if (!chat.isGroup) return res.status(400).json({ message: "Not a group chat" });

      // Only admin can remove others
      const currentMember = chat.members.find(m => m.userId === currentUserId);
      if (!currentMember) return res.status(401).json({ message: "Unauthorized" });
      if (targetUserId !== currentUserId && currentMember.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can remove members" });
      }
      // Protect the original creator from being removed by other admins
      const effectiveCreator = getEffectiveCreatorId(chat);
      if (targetUserId !== currentUserId && effectiveCreator && targetUserId === effectiveCreator) {
        return res.status(403).json({ message: "Cannot remove the group creator" });
      }

      await storage.removeGroupMember(chatId, targetUserId);
      res.json({ success: true });
    } catch (err) {
      console.error("Remove group member error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Leave group chat
  app.post('/api/chats/:chatId/leave', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const userId = req.user.claims.sub;

      const chat = await storage.getChat(chatId);
      if (!chat) return res.status(404).json({ message: "Chat not found" });
      if (!chat.isGroup) return res.status(400).json({ message: "Not a group chat" });
      if (!chat.members.some(m => m.userId === userId)) return res.status(401).json({ message: "Unauthorized" });

      const leavingMember = chat.members.find(m => m.userId === userId);
      const wasAdmin = leavingMember?.role === 'admin';
      const wasCreator = getEffectiveCreatorId(chat) === userId;

      await storage.removeGroupMember(chatId, userId);

      // After removal, check remaining members and handle admin succession
      const remainingMembers = chat.members.filter(m => m.userId !== userId);
      if (remainingMembers.length === 0) {
        // No members left — delete the group entirely
        await storage.deleteChat(chatId);
      } else if (wasAdmin) {
        const remainingAdmins = remainingMembers.filter(m => m.role === 'admin');
        if (remainingAdmins.length === 0) {
          // No admins left — promote the earliest-joined member
          const sorted = [...remainingMembers].sort(
            (a, b) => new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime()
          );
          const newAdmin = sorted[0];
          await storage.updateMemberRole(chatId, newAdmin.userId, 'admin');
          // Transfer creatorId to the new admin
          await storage.updateChatCreator(chatId, newAdmin.userId);
        } else if (wasCreator) {
          // Creator is leaving but other admins exist — transfer creatorId to earliest admin
          const sortedAdmins = [...remainingAdmins].sort(
            (a, b) => new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime()
          );
          await storage.updateChatCreator(chatId, sortedAdmins[0].userId);
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Leave group error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update member role (promote/demote admin)
  app.patch('/api/chats/:chatId/members/:userId/role', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const currentUserId = req.user.claims.sub;
      const targetUserId = req.params.userId;
      const { role } = req.body as { role: string };

      if (!role || !['admin', 'member'].includes(role)) {
        return res.status(400).json({ message: "Role must be 'admin' or 'member'" });
      }

      const chat = await storage.getChat(chatId);
      if (!chat) return res.status(404).json({ message: "Chat not found" });
      if (!chat.isGroup) return res.status(400).json({ message: "Not a group chat" });

      const currentMember = chat.members.find(m => m.userId === currentUserId);
      if (!currentMember || currentMember.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can change roles" });
      }
      if (!chat.members.some(m => m.userId === targetUserId)) {
        return res.status(404).json({ message: "Member not found" });
      }
      // Protect creator's role
      const effectiveCreatorRole = getEffectiveCreatorId(chat);
      if (effectiveCreatorRole && targetUserId === effectiveCreatorRole && role !== 'admin') {
        return res.status(403).json({ message: "Cannot demote the group creator" });
      }

      const updated = await storage.updateMemberRole(chatId, targetUserId, role);
      res.json(updated);
    } catch (err) {
      console.error("Update member role error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update member title
  app.patch('/api/chats/:chatId/members/:userId/title', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const currentUserId = req.user.claims.sub;
      const targetUserId = req.params.userId;
      const { title } = req.body as { title: string | null };

      const chat = await storage.getChat(chatId);
      if (!chat) return res.status(404).json({ message: "Chat not found" });
      if (!chat.isGroup) return res.status(400).json({ message: "Not a group chat" });

      const currentMember = chat.members.find(m => m.userId === currentUserId);
      if (!currentMember || currentMember.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can set titles" });
      }
      if (!chat.members.some(m => m.userId === targetUserId)) {
        return res.status(404).json({ message: "Member not found" });
      }
      // Protect creator's title from other admins
      const effectiveCreatorTitle = getEffectiveCreatorId(chat);
      if (effectiveCreatorTitle && targetUserId === effectiveCreatorTitle && currentUserId !== effectiveCreatorTitle) {
        return res.status(403).json({ message: "Cannot change the group creator's title" });
      }

      const trimmed = title?.trim() || null;
      const updated = await storage.updateMemberTitle(chatId, targetUserId, trimmed);
      res.json(updated);
    } catch (err) {
      console.error("Update member title error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update member permissions
  app.patch('/api/chats/:chatId/members/:userId/permissions', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const currentUserId = req.user.claims.sub;
      const targetUserId = req.params.userId;
      const { permissions } = req.body as { permissions: Record<string, boolean> };

      const chat = await storage.getChat(chatId);
      if (!chat) return res.status(404).json({ message: "Chat not found" });
      if (!chat.isGroup) return res.status(400).json({ message: "Not a group chat" });

      const currentMember = chat.members.find(m => m.userId === currentUserId);
      if (!currentMember || currentMember.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can change permissions" });
      }
      if (!chat.members.some(m => m.userId === targetUserId)) {
        return res.status(404).json({ message: "Member not found" });
      }
      // Protect creator's permissions
      const effectiveCreatorPerm = getEffectiveCreatorId(chat);
      if (effectiveCreatorPerm && targetUserId === effectiveCreatorPerm && currentUserId !== effectiveCreatorPerm) {
        return res.status(403).json({ message: "Cannot change the group creator's permissions" });
      }

      const updated = await storage.updateMemberPermissions(chatId, targetUserId, permissions);
      res.json(updated);
    } catch (err) {
      console.error("Update member permissions error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get messages for chat
  app.get('/api/chats/:chatId/messages', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      // A01: Clamp limit to prevent excessive data retrieval
      const rawLimit = Number(req.query.limit) || 50;
      const limit = Math.min(Math.max(rawLimit, 1), 200);
      
      // Verify membership
      const chat = await storage.getChat(chatId);
      if (!chat) return res.status(404).json({ message: "Chat not found" });
      
      const userId = req.user.claims.sub;
      if (!chat.members.some(m => m.userId === userId)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const messages = await storage.getMessagesForChat(chatId, userId, limit);
      
      // Fetch reactions for all messages
      const messagesWithReactions = await Promise.all(
        messages.map(async (msg) => {
          const reactions = await storage.getReactions(msg.id);
          return { ...msg, reactions };
        })
      );
      
      res.json(messagesWithReactions);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Search messages in chat
  app.get('/api/chats/:chatId/messages/search', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const query = String(req.query.q || '').trim();
      if (!query) {
        return res.status(400).json({ message: "Search query required" });
      }
      
      const rawLimit = Number(req.query.limit) || 50;
      const limit = Math.min(Math.max(rawLimit, 1), 200);
      
      // Verify membership
      const chat = await storage.getChat(chatId);
      if (!chat) return res.status(404).json({ message: "Chat not found" });
      
      const userId = req.user.claims.sub;
      if (!chat.members.some(m => m.userId === userId)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const messages = await storage.searchMessagesInChat(chatId, query, userId, limit);
      
      // Fetch reactions for all messages
      const messagesWithReactions = await Promise.all(
        messages.map(async (msg) => {
          const reactions = await storage.getReactions(msg.id);
          return { ...msg, reactions };
        })
      );
      
      res.json(messagesWithReactions);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Send message
  app.post('/api/chats/:chatId/messages', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const input = api.messages.send.input.parse(req.body);
      const userId = req.user.claims.sub;
      
      // Verify membership
      const chat = await storage.getChat(chatId);
      if (!chat) return res.status(404).json({ message: "Chat not found" });
      if (!chat.members.some(m => m.userId === userId)) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Block check: in 1-on-1 chats, prevent messaging if either user blocked the other
      if (!chat.isGroup) {
        const otherMember = chat.members.find(m => m.userId !== userId);
        if (otherMember?.userId) {
          const status = await storage.getBlockStatus(userId, otherMember.userId);
          if (status.blocked) {
            return res.status(403).json({ message: "You have blocked this user. Unblock them to send messages." });
          }
          if (status.blockedBy) {
            return res.status(403).json({ message: "You have been blocked by this user." });
          }
        }
      }

      const message = await storage.createMessage({
        chatId,
        senderId: userId,
        content: input.content,
        attachments: input.attachments
      });

      // Broadcast to other chat members via WS
      chat.members.forEach(member => {
        if (member.userId !== userId) {
          sendToUser(member.userId!, {
            type: WS_EVENTS.MESSAGE_NEW,
            payload: message
          });
        }
      });

      res.status(201).json(message);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Mark messages as read
  app.post('/api/chats/:chatId/read', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const userId = req.user.claims.sub;

      // A01: Verify the user is actually a member of this chat
      const chat = await storage.getChat(chatId);
      if (!chat) return res.status(404).json({ message: "Chat not found" });
      if (!chat.members.some(m => m.userId === userId)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      await storage.markMessagesAsRead(chatId, userId);

      // Broadcast read receipt to other chat members so their UI updates in real-time
      chat.members.forEach(member => {
        if (member.userId !== userId) {
          sendToUser(member.userId!, {
            type: WS_EVENTS.MESSAGE_READ,
            payload: { chatId, readByUserId: userId }
          });
        }
      });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Clear chat history for current user only
  app.post('/api/chats/:chatId/clear-for-me', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const userId = req.user.claims.sub as string;
      console.log('clear-for-me called', { chatId, userId });

      // Verify membership
      const chat = await storage.getChat(chatId);
      if (!chat) return res.status(404).json({ message: "Chat not found" });
      if (!chat.members.some(m => m.userId === userId)) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const cleared = await storage.clearMessagesForUser(chatId, userId);
      console.log(`marked ${cleared} messages deleted for user ${userId}`);
      res.json({ success: true, cleared });
    } catch (err) {
      console.error('error in clear-for-me', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Clear chat history for everyone – removes all messages from your view and
  // deletes your sent messages from the conversation so only the other person's
  // text remains on their side.
  app.post('/api/chats/:chatId/clear-for-all', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const userId = req.user.claims.sub;
      
      // Verify membership
      const chat = await storage.getChat(chatId);
      if (!chat) return res.status(404).json({ message: "Chat not found" });
      
      if (!chat.members.some(m => m.userId === userId)) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // First mark all messages as deleted for the current user
      await storage.clearMessagesForUser(chatId, userId);
      // Then remove any messages they sent so other member only sees their own
      await storage.clearMyMessagesForAll(chatId, userId);

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Clear chat history for everyone (only your own sent messages)
  app.post('/api/chats/:chatId/clear-for-all', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const userId = req.user.claims.sub;
      
      // Verify membership
      const chat = await storage.getChat(chatId);
      if (!chat) return res.status(404).json({ message: "Chat not found" });
      
      if (!chat.members.some(m => m.userId === userId)) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // only delete messages where senderId === current user
      await storage.clearMyMessagesForAll(chatId, userId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete chat (for DMs: hide for user; for groups: only effective creator can delete entirely)
  app.delete('/api/chats/:chatId', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const userId = req.user.claims.sub;
      
      // Verify membership
      const chat = await storage.getChat(chatId);
      if (!chat) return res.status(404).json({ message: "Chat not found" });
      
      if (!chat.members.some(m => m.userId === userId)) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (chat.isGroup) {
        // Only the effective creator can delete a group
        const effectiveCreator = getEffectiveCreatorId(chat);
        if (effectiveCreator !== userId) {
          return res.status(403).json({ message: "Only the group creator can delete the group" });
        }
        // Collect member IDs before deletion to broadcast
        const memberIds = chat.members.map(m => m.userId).filter(id => id !== userId);
        console.log(`[DELETE GROUP] User ${userId} deleting group chat ${chatId}`);
        await storage.deleteChat(chatId);
        console.log(`[DELETE GROUP] Group chat ${chatId} deleted successfully`);
        // Notify all other members via WS so their UI updates immediately
        for (const memberId of memberIds) {
          sendToUser(memberId, { type: WS_EVENTS.CHAT_DELETED, payload: { chatId } });
        }
      } else {
        await storage.leaveChatForUser(chatId, userId);
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Delete chat error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete single message.  `forAll` tells us whether the user wishes to remove it for
  // everyone; if they are not the sender we silently downgrade to a personal delete.
  app.post('/api/messages/:messageId/delete', isAuthenticated, async (req: any, res) => {
    try {
      const messageId = Number(req.params.messageId);
      if (isNaN(messageId)) return res.status(400).json({ message: "Invalid message ID" });
      const { forAll } = req.body as { forAll?: boolean };
      const userId = req.user.claims.sub as string;

      // A01: Verify user has access to the message's chat
      const msgAccess = await storage.verifyMessageAccess(messageId, userId);
      if (!msgAccess) return res.status(403).json({ message: "Forbidden" });

      // Get chat info BEFORE deletion (message may be hard-deleted)
      const msgChat = forAll ? await storage.getChatByMessageId(messageId) : null;

      await storage.deleteMessage(messageId, userId, Boolean(forAll));

      // If forAll, broadcast deletion to other chat members
      if (forAll && msgChat) {
        msgChat.members.forEach(member => {
          if (member.userId !== userId) {
            sendToUser(member.userId!, {
              type: WS_EVENTS.MESSAGE_DELETE,
              payload: { messageIds: [messageId], chatId: msgChat.id }
            });
          }
        });
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Batch delete, accepts an array with per-message flags
  app.post('/api/messages/batch-delete', isAuthenticated, async (req: any, res) => {
    try {
      const { items } = req.body as { items?: Array<{ id: number; forAll: boolean }> };
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "items must be a non-empty array" });
      }
      // A01: Limit batch size to prevent abuse
      if (items.length > 100) {
        return res.status(400).json({ message: "Maximum 100 messages per batch" });
      }
      const userId = req.user.claims.sub as string;

      // Get chat info BEFORE deletion for broadcasting
      const forAllIds = items.filter(i => Boolean(i.forAll)).map(i => Number(i.id));
      const chatForBroadcast = forAllIds.length > 0 ? await storage.getChatByMessageId(forAllIds[0]) : null;

      await storage.deleteMessages(items.map(i => ({ id: Number(i.id), forAll: Boolean(i.forAll) })), userId);

      // Broadcast forAll deletions to other chat members
      if (forAllIds.length > 0 && chatForBroadcast) {
        chatForBroadcast.members.forEach(member => {
          if (member.userId !== userId) {
            sendToUser(member.userId!, {
              type: WS_EVENTS.MESSAGE_DELETE,
              payload: { messageIds: forAllIds, chatId: chatForBroadcast.id }
            });
          }
        });
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Edit message
  app.put('/api/messages/:messageId', isAuthenticated, async (req: any, res) => {
    try {
      const messageId = Number(req.params.messageId);
      const userId = req.user.claims.sub as string;
      const { content } = req.body as { content?: string };

      if (!content || !content.trim()) {
        return res.status(400).json({ message: "Message content cannot be empty" });
      }

      const updatedMessage = await storage.editMessage(messageId, userId, content);
      res.json(updatedMessage);
    } catch (err: any) {
      if (err.message === 'Message not found') {
        return res.status(404).json({ message: "Message not found" });
      }
      if (err.message === 'You can only edit your own messages') {
        return res.status(403).json({ message: "You can only edit your own messages" });
      }
      console.error('Error editing message:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Add reaction to a message
  app.post('/api/messages/:messageId/reactions', isAuthenticated, async (req: any, res) => {
    try {
      const messageId = Number(req.params.messageId);
      const userId = req.user.claims.sub as string;
      const { emoji } = req.body as { emoji?: string };

      if (!emoji) {
        return res.status(400).json({ message: "Emoji is required" });
      }

      // Fetch message to check ownership
      const [message] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }

      const reaction = await storage.addReaction(messageId, userId, emoji);
      
      // Broadcast to WebSocket clients in the same chat
      const chat = await storage.getChat(message.chatId);
      if (chat) {
        chat.members.forEach(member => {
          if (member.userId !== userId) {
            sendToUser(member.userId!, {
              type: WS_EVENTS.MESSAGE_REACTION_ADD,
              payload: reaction,
            });
          }
        });
      }

      res.status(201).json(reaction);
    } catch (err: any) {
      if (err.message === 'Message not found') {
        return res.status(404).json({ message: "Message not found" });
      }
      console.error('Error adding reaction:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Remove reaction from a message
  app.delete('/api/messages/:messageId/reactions/:emoji', isAuthenticated, async (req: any, res) => {
    try {
      const messageId = Number(req.params.messageId);
      const userId = req.user.claims.sub as string;
      const { emoji } = req.params;

      if (!emoji) {
        return res.status(400).json({ message: "Emoji is required" });
      }

      // Fetch message to get chat context for broadcasting
      const [message] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

      await storage.removeReaction(messageId, userId, emoji);
      
      // Broadcast to WebSocket clients in the same chat
      if (message) {
        const chat = await storage.getChat(message.chatId);
        if (chat) {
          chat.members.forEach(member => {
            if (member.userId !== userId) {
              sendToUser(member.userId!, {
                type: WS_EVENTS.MESSAGE_REACTION_REMOVE,
                payload: { messageId, userId, emoji },
              });
            }
          });
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      if (err.message === 'Message not found') {
        return res.status(404).json({ message: "Message not found" });
      }
      console.error('Error removing reaction:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // PINNED MESSAGES ROUTES
  // ═══════════════════════════════════════════════════════════════

  // Pin a message in a chat
  app.post('/api/chats/:chatId/messages/:messageId/pin', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const messageId = Number(req.params.messageId);
      const userId = req.user.claims.sub as string;

      const pinnedMessage = await storage.pinMessage(chatId, messageId, userId);
      
      // Broadcast to chat members
      const chat = await storage.getChat(chatId);
      if (chat) {
        chat.members.forEach(member => {
          sendToUser(member.userId!, {
            type: WS_EVENTS.MESSAGE_PIN,
            payload: pinnedMessage,
          });
        });
      }

      res.status(201).json(pinnedMessage);
    } catch (err: any) {
      if (err.message === 'Not a chat member' || err.message === 'Only admins can pin messages in groups') {
        return res.status(403).json({ message: err.message });
      }
      if (err.message === 'Message not found' || err.message === 'Chat not found') {
        return res.status(404).json({ message: err.message });
      }
      console.error('Error pinning message:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Unpin a message
  app.delete('/api/chats/:chatId/messages/:messageId/pin', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const messageId = Number(req.params.messageId);
      const userId = req.user.claims.sub as string;

      await storage.unpinMessage(chatId, messageId, userId);
      
      // Broadcast to chat members
      const chat = await storage.getChat(chatId);
      if (chat) {
        chat.members.forEach(member => {
          sendToUser(member.userId!, {
            type: WS_EVENTS.MESSAGE_UNPIN,
            payload: { chatId, messageId },
          });
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      if (err.message === 'Not a chat member' || err.message === 'Only admins can unpin messages in groups') {
        return res.status(403).json({ message: err.message });
      }
      if (err.message === 'Pinned message not found') {
        return res.status(404).json({ message: err.message });
      }
      console.error('Error unpinning message:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get pinned messages for a chat
  app.get('/api/chats/:chatId/pinned-messages', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const userId = req.user.claims.sub as string;

      const pinnedMessages = await storage.getPinnedMessages(chatId, userId);
      res.json(pinnedMessages);
    } catch (err: any) {
      if (err.message === 'Not a chat member') {
        return res.status(403).json({ message: err.message });
      }
      console.error('Error getting pinned messages:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // GROUP INVITE LINKS ROUTES
  // ═══════════════════════════════════════════════════════════════

  // Create invite link for a group
  app.post('/api/chats/:chatId/invite-links', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const userId = req.user.claims.sub as string;
      const { expiresAt, maxUses } = req.body as { expiresAt?: string; maxUses?: number };

      const inviteLink = await storage.createInviteLink(
        chatId, 
        userId, 
        expiresAt ? new Date(expiresAt) : undefined,
        maxUses
      );
      
      res.status(201).json(inviteLink);
    } catch (err: any) {
      if (err.message === 'Not a group chat' || err.message === 'Only admins can create invite links') {
        return res.status(403).json({ message: err.message });
      }
      if (err.message === 'Chat not found') {
        return res.status(404).json({ message: err.message });
      }
      console.error('Error creating invite link:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get invite links for a group
  app.get('/api/chats/:chatId/invite-links', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const userId = req.user.claims.sub as string;

      const inviteLinks = await storage.getInviteLinks(chatId, userId);
      res.json(inviteLinks);
    } catch (err: any) {
      if (err.message === 'Not a chat member') {
        return res.status(403).json({ message: err.message });
      }
      console.error('Error getting invite links:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Revoke/deactivate an invite link
  app.delete('/api/invite-links/:token', isAuthenticated, async (req: any, res) => {
    try {
      const { token } = req.params;
      const userId = req.user.claims.sub as string;

      await storage.revokeInviteLink(token, userId);
      res.json({ success: true });
    } catch (err: any) {
      if (err.message === 'Only admins can revoke invite links') {
        return res.status(403).json({ message: err.message });
      }
      if (err.message === 'Invite link not found') {
        return res.status(404).json({ message: err.message });
      }
      console.error('Error revoking invite link:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Join group via invite link
  app.post('/api/invite-links/:token/join', isAuthenticated, async (req: any, res) => {
    try {
      const { token } = req.params;
      const userId = req.user.claims.sub as string;

      const chat = await storage.joinViaInviteLink(token, userId);
      res.json(chat);
    } catch (err: any) {
      if (err.message === 'Invite link expired' || err.message === 'Invite link has reached maximum uses' || err.message === 'Invite link is not active' || err.message === 'Already a member of this group') {
        return res.status(400).json({ message: err.message });
      }
      if (err.message === 'Invite link not found') {
        return res.status(404).json({ message: err.message });
      }
      console.error('Error joining via invite link:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get invite link info (public - doesn't require authentication)
  app.get('/api/invite-links/:token/info', async (req: any, res) => {
    try {
      const { token } = req.params;

      const inviteLinkInfo = await storage.getInviteLinkInfo(token);
      res.json(inviteLinkInfo);
    } catch (err: any) {
      if (err.message === 'Invite link not found' || err.message === 'Invite link expired' || err.message === 'Invite link is not active') {
        return res.status(404).json({ message: err.message });
      }
      console.error('Error getting invite link info:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // POLLS ROUTES
  // ═══════════════════════════════════════════════════════════════

  // Create a poll (only in group chats)
  app.post('/api/chats/:chatId/polls', isAuthenticated, async (req: any, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const userId = req.user.claims.sub as string;
      const { question, options, allowMultipleAnswers, isAnonymous, closesAt } = req.body as {
        question: string;
        options: string[];
        allowMultipleAnswers?: boolean;
        isAnonymous?: boolean;
        closesAt?: string;
      };

      if (!question || !options || options.length < 2) {
        return res.status(400).json({ message: "Poll must have a question and at least 2 options" });
      }

      const poll = await storage.createPoll(
        chatId,
        userId,
        question,
        options,
        allowMultipleAnswers,
        isAnonymous,
        closesAt ? new Date(closesAt) : undefined
      );

      // Broadcast to chat members
      const chat = await storage.getChat(chatId);
      if (chat) {
        chat.members.forEach(member => {
          sendToUser(member.userId!, {
            type: WS_EVENTS.POLL_NEW,
            payload: poll,
          });
        });
      }

      res.status(201).json(poll);
    } catch (err: any) {
      if (err.message === 'Not a group chat' || err.message === 'Not a chat member') {
        return res.status(403).json({ message: err.message });
      }
      if (err.message === 'Chat not found') {
        return res.status(404).json({ message: err.message });
      }
      console.error('Error creating poll:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Vote on a poll
  app.post('/api/polls/:pollId/vote', isAuthenticated, async (req: any, res) => {
    try {
      const pollId = Number(req.params.pollId);
      const userId = req.user.claims.sub as string;
      const { optionIds } = req.body as { optionIds: number[] };

      if (!optionIds || optionIds.length === 0) {
        return res.status(400).json({ message: "Must select at least one option" });
      }

      const poll = await storage.votePoll(pollId, userId, optionIds);

      // Broadcast to chat members
      const chat = await storage.getChat(poll.chatId);
      if (chat) {
        chat.members.forEach(member => {
          sendToUser(member.userId!, {
            type: WS_EVENTS.POLL_VOTE,
            payload: { pollId, chatId: poll.chatId, userId: poll.isAnonymous ? undefined : userId, optionIds },
          });
        });
      }

      res.json(poll);
    } catch (err: any) {
      if (err.message === 'Poll is closed' || err.message === 'Not a chat member' || err.message === 'Poll does not allow multiple answers' || err.message === 'Invalid option IDs') {
        return res.status(400).json({ message: err.message });
      }
      if (err.message === 'Poll not found') {
        return res.status(404).json({ message: err.message });
      }
      console.error('Error voting on poll:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Close a poll
  app.post('/api/polls/:pollId/close', isAuthenticated, async (req: any, res) => {
    try {
      const pollId = Number(req.params.pollId);
      const userId = req.user.claims.sub as string;

      const poll = await storage.closePoll(pollId, userId);

      // Broadcast to chat members
      const chat = await storage.getChat(poll.chatId);
      if (chat) {
        chat.members.forEach(member => {
          sendToUser(member.userId!, {
            type: WS_EVENTS.POLL_CLOSE,
            payload: { pollId, chatId: poll.chatId },
          });
        });
      }

      res.json(poll);
    } catch (err: any) {
      if (err.message === 'Only poll creator or group admins can close the poll') {
        return res.status(403).json({ message: err.message });
      }
      if (err.message === 'Poll not found') {
        return res.status(404).json({ message: err.message });
      }
      console.error('Error closing poll:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get poll results
  app.get('/api/polls/:pollId', isAuthenticated, async (req: any, res) => {
    try {
      const pollId = Number(req.params.pollId);
      const userId = req.user.claims.sub as string;

      const poll = await storage.getPollResults(pollId, userId);
      res.json(poll);
    } catch (err: any) {
      if (err.message === 'Not a chat member') {
        return res.status(403).json({ message: err.message });
      }
      if (err.message === 'Poll not found') {
        return res.status(404).json({ message: err.message });
      }
      console.error('Error getting poll results:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}
