import { z } from 'zod';
import { insertChatSchema, insertMessageSchema, chats, messages, WS_EVENTS, type WsMessage } from './schema';
import type { User } from './models/auth';

// Re-export WS types for convenience
export { WS_EVENTS, type WsMessage };

// User schema based on auth models
export const userSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  profileImageUrl: z.string().nullable(),
  bio: z.string().nullable(),
  status: z.string().nullable(),
  theme: z.enum(['light','dark']).default('light'),
  lastSeen: z.string().or(z.date()).nullable(),
  createdAt: z.string().or(z.date()).nullable(),
  updatedAt: z.string().or(z.date()).nullable(),
});

// Response schemas
export const chatMemberResponseSchema = z.object({
  id: z.number(),
  chatId: z.number(),
  userId: z.string(),
  role: z.string().nullable(),
  joinedAt: z.string().or(z.date()).nullable(),
  user: userSchema,
});

export const messageResponseSchema = z.object({
  id: z.number(),
  chatId: z.number(),
  senderId: z.string(),
  content: z.string().nullable().optional(),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string(),
    type: z.string(),
  })).optional(),
  isEdited: z.boolean().nullable(),
  isRead: z.boolean().nullable(),
  createdAt: z.string().or(z.date()).nullable(),
  updatedAt: z.string().or(z.date()).nullable(),
  sender: userSchema,
});

export const chatResponseSchema = z.object({
  id: z.number(),
  isGroup: z.boolean().nullable(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: z.string().or(z.date()).nullable(),
  updatedAt: z.string().or(z.date()).nullable(),
  members: z.array(chatMemberResponseSchema),
  lastMessage: messageResponseSchema.nullable().optional(),
  unreadCount: z.number().optional(),
});


export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  users: {
    search: {
      method: 'GET' as const,
      path: '/api/users/search' as const,
      input: z.object({
        q: z.string().min(1),
      }).optional(),
      responses: {
        200: z.array(userSchema),
        401: errorSchemas.unauthorized,
      },
    },
    updateProfile: {
      method: 'PATCH' as const,
      path: '/api/users/profile' as const,
      input: z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        bio: z.string().nullable().optional(),
        profileImageUrl: z.string().nullable().optional(),
        theme: z.enum(['light','dark']).optional(),
      }),
      responses: {
        200: userSchema,
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    block: {
      method: 'POST' as const,
      path: '/api/users/:userId/block' as const,
      responses: {
        200: z.object({ success: z.boolean() }),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    unblock: {
      method: 'POST' as const,
      path: '/api/users/:userId/unblock' as const,
      responses: {
        200: z.object({ success: z.boolean() }),
        401: errorSchemas.unauthorized,
      },
    },
    blockStatus: {
      method: 'GET' as const,
      path: '/api/users/:userId/block-status' as const,
      responses: {
        200: z.object({ blocked: z.boolean(), blockedBy: z.boolean() }),
        401: errorSchemas.unauthorized,
      },
    },
    blockedList: {
      method: 'GET' as const,
      path: '/api/users/blocked' as const,
      responses: {
        200: z.array(userSchema),
        401: errorSchemas.unauthorized,
      },
    }
  },
  chats: {
    list: {
      method: 'GET' as const,
      path: '/api/chats' as const,
      responses: {
        200: z.array(chatResponseSchema),
        401: errorSchemas.unauthorized,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/chats/:id' as const,
      responses: {
        200: chatResponseSchema,
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
    createDirect: {
      method: 'POST' as const,
      path: '/api/chats/direct' as const,
      input: z.object({
        userId: z.string(),
      }),
      responses: {
        201: chatResponseSchema,
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
  },
  messages: {
    list: {
      method: 'GET' as const,
      path: '/api/chats/:chatId/messages' as const,
      input: z.object({
        cursor: z.string().optional(),
        limit: z.coerce.number().optional(),
      }).optional(),
      responses: {
        200: z.array(messageResponseSchema),
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
    send: {
      method: 'POST' as const,
      path: '/api/chats/:chatId/messages' as const,
      input: z.object({
        content: z.string().optional(),
        attachments: z.array(z.object({
          name: z.string(),
          url: z.string(),
          type: z.string(),
        })).optional(),
      }).refine(
        (data) => (data.content && data.content.trim().length > 0) || (data.attachments && data.attachments.length > 0),
        "Message must have either text content or attachments"
      ),
      responses: {
        201: messageResponseSchema,
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
    markRead: {
      method: 'POST' as const,
      path: '/api/chats/:chatId/read' as const,
      responses: {
        200: z.object({ success: z.boolean() }),
        401: errorSchemas.unauthorized,
      },
    },
    // message deletion endpoints
    delete: {
      method: 'POST' as const,
      path: '/api/messages/:messageId/delete' as const,
      input: z.object({
        forAll: z.boolean().optional(),
      }).optional(),
      responses: {
        200: z.object({ success: z.boolean() }),
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
    batchDelete: {
      method: 'POST' as const,
      path: '/api/messages/batch-delete' as const,
      input: z.object({
        items: z.array(z.object({
          id: z.number(),
          forAll: z.boolean(),
        })),
      }),
      responses: {
        200: z.object({ success: z.boolean() }),
        401: errorSchemas.unauthorized,
        400: errorSchemas.validation,
      },
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type MessageResponse = z.infer<typeof messageResponseSchema>;
export type UserResponse = z.infer<typeof userSchema>;
