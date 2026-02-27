import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./auth/local";
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
  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    if (url.pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
    // Let other upgrade requests (e.g. Vite HMR) pass through
  });
  
  // Map of userId -> WebSocket connection
  const clients = new Map<string, WebSocket>();

  wss.on('connection', (ws, req) => {
    // We ideally want to authenticate the WS connection using the session cookie,
    // but for simplicity in this MVP, we might trust the client to send a 'connect' event with their ID.
    // In a real app, parse req.headers.cookie and validate the session.
    let currentUserId: string | null = null;

    ws.on('message', async (data) => {
      try {
        const message: WsMessage = JSON.parse(data.toString());
        
        if (message.type === WS_EVENTS.CONNECT) {
          const payload = message.payload as { userId: string };
          currentUserId = payload.userId;
          clients.set(currentUserId, ws);
          
          // Update status
          await storage.updateUser(currentUserId, { status: 'online' });
          
          // Broadcast status change to everyone else
          broadcast(currentUserId, {
            type: WS_EVENTS.USER_STATUS,
            payload: { userId: currentUserId, status: 'online' }
          });

          // Send the list of currently online users to this client
          const onlineUserIds = Array.from(clients.keys());
          ws.send(JSON.stringify({
            type: WS_EVENTS.ONLINE_USERS,
            payload: { userIds: onlineUserIds }
          }));
        }
        else if (message.type === WS_EVENTS.TYPING_START || message.type === WS_EVENTS.TYPING_STOP) {
          // Forward typing events to the chat members
          const payload = message.payload as { chatId: number };
          const chat = await storage.getChat(payload.chatId);
          if (chat && currentUserId) {
            chat.members.forEach(member => {
              if (member.userId !== currentUserId) {
                sendToUser(member.userId, {
                  type: message.type,
                  payload: { chatId: payload.chatId, userId: currentUserId }
                });
              }
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
      res.json(user);
    } catch (err) {
      console.error("Update profile error:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Search users
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
      const limit = Number(req.query.limit) || 50;
      
      // Verify membership
      const chat = await storage.getChat(chatId);
      if (!chat) return res.status(404).json({ message: "Chat not found" });
      
      const userId = req.user.claims.sub;
      if (!chat.members.some(m => m.userId === userId)) {
        return res.status(401).json({ message: "Unauthorized" });
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

      const message = await storage.createMessage({
        chatId,
        senderId: userId,
        content: input.content,
        attachments: input.attachments
      });

      // Broadcast to other chat members via WS
      chat.members.forEach(member => {
        if (member.userId !== userId) {
          sendToUser(member.userId, {
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
      const userId = req.user.claims.sub;
      
      // Verify membership
      const chat = await storage.getChat(chatId);
      if (!chat) return res.status(404).json({ message: "Chat not found" });
      
      if (!chat.members.some(m => m.userId === userId)) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      await storage.clearMessagesForUser(chatId, userId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Clear chat history for everyone
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

      await storage.clearMessagesForAll(chatId);
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

      await storage.deleteChat(chatId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete single message (hard-delete for both users)
  app.delete('/api/messages/:messageId', isAuthenticated, async (req: any, res) => {
    try {
      const messageId = Number(req.params.messageId);
      
      await storage.deleteMessage(messageId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Batch delete messages (hard-delete for both users)
  app.post('/api/messages/batch-delete', isAuthenticated, async (req: any, res) => {
    try {
      const { messageIds } = req.body;
      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({ message: "messageIds must be a non-empty array" });
      }
      
      await storage.deleteMessages(messageIds.map(Number));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}
