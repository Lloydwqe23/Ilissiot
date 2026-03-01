import type { Express } from "express";
import { type Server, type IncomingMessage, ServerResponse } from "http";
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from "./storage";
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
            chat.members.forEach(member => {
              if (member.userId !== currentUserId) {
                // userId should always be set for chat members
                sendToUser(member.userId!, {
                  type: message.type,
                  payload: { chatId: payload.chatId, userId: currentUserId }
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
      res.json(messages);
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

  // Delete chat
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

      await storage.leaveChatForUser(chatId, userId);
      res.json({ success: true });
    } catch (err) {
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

      await storage.deleteMessage(messageId, userId, Boolean(forAll));
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
      await storage.deleteMessages(items.map(i => ({ id: Number(i.id), forAll: Boolean(i.forAll) })), userId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}
