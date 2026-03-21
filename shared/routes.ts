import { z } from 'zod';
import { WS_EVENTS, type WsMessage } from './schema';

// Re-export WS types for convenience
export { WS_EVENTS, type WsMessage };

// User schema based on auth models
// Note: email, theme, createdAt, updatedAt are stripped by sanitizeUser for other
// users' data, so they must be optional here.
export const userSchema = z.object({
  id: z.string(),
  email: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  profileImageUrl: z.string().nullable(),
  bio: z.string().nullable(),
  birthday: z.string().nullable().optional(),
  status: z.string().nullable(),
  theme: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  colorTheme: z.string().nullable().optional(),
  fontType: z.string().nullable().optional(),
  textSize: z.string().nullable().optional(),
  sidebarPlacement: z.string().nullable().optional(),
  lastSeenPrivacy: z.string().nullable().optional(),
  groupAddPrivacy: z.string().nullable().optional(),
  lastSeen: z.string().or(z.date()).nullable(),
  createdAt: z.string().or(z.date()).nullable().optional(),
  updatedAt: z.string().or(z.date()).nullable().optional(),
});

// Response schemas
export const chatMemberResponseSchema = z.object({
  id: z.number(),
  chatId: z.number(),
  userId: z.string(),
  role: z.string().nullable(),
  title: z.string().nullable().optional(),
  permissions: z.record(z.boolean()).nullable().optional(),
  joinedAt: z.string().or(z.date()).nullable(),
  pinnedAt: z.string().or(z.date()).nullable().optional(),
  user: userSchema,
});

export const reactionResponseSchema = z.object({
  id: z.number(),
  messageId: z.number(),
  userId: z.string(),
  emoji: z.string(),
  createdAt: z.string().or(z.date()).nullable(),
  user: userSchema,
});

export const commentResponseSchema = z.object({
  id: z.number(),
  messageId: z.number(),
  senderId: z.string(),
  content: z.string(),
  isEdited: z.boolean(),
  createdAt: z.string().or(z.date()).nullable(),
  updatedAt: z.string().or(z.date()).nullable(),
  sender: userSchema,
});

export const pollOptionResponseSchema = z.object({
  id: z.number(),
  text: z.string(),
});

export const pollResultResponseSchema = z.object({
  optionId: z.number(),
  count: z.number(),
  voters: z.array(userSchema).optional(),
});

export const pollResponseSchema = z.object({
  id: z.number(),
  chatId: z.number(),
  messageId: z.number(),
  createdBy: z.string(),
  question: z.string(),
  options: z.array(pollOptionResponseSchema),
  allowMultipleAnswers: z.boolean().nullable(),
  isAnonymous: z.boolean().nullable(),
  isClosed: z.boolean().nullable(),
  closesAt: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()).nullable(),
  results: z.array(pollResultResponseSchema),
  userVotes: z.array(z.number()).optional(),
  totalVotes: z.number(),
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
  poll: pollResponseSchema.nullable().optional(),
  reactions: z.array(reactionResponseSchema).optional(),
});

export const chatResponseSchema = z.object({
  id: z.number(),
  isGroup: z.boolean().nullable(),
  isChannel: z.boolean().nullable().optional(),
  commentsEnabled: z.boolean().nullable().optional(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  creatorId: z.string().nullable().optional(),
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
        username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,32}$/).optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        bio: z.string().nullable().optional(),
        birthday: z.string().nullable().optional(),
        profileImageUrl: z.string().nullable().optional(),
        theme: z.string().optional(),
        language: z.enum(['en', 'uk', 'es', 'de', 'fr', 'it', 'pl', 'pt', 'tr']).optional(),
        colorTheme: z.string().optional(),
        fontType: z.string().optional(),
        textSize: z.string().optional(),
        sidebarPlacement: z.enum(['left', 'right', 'top', 'bottom']).optional(),
        lastSeenPrivacy: z.enum(['everyone', 'nobody']).optional(),
        groupAddPrivacy: z.enum(['everyone', 'nobody']).optional(),
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
    createGroup: {
      method: 'POST' as const,
      path: '/api/chats/group' as const,
      input: z.object({
        name: z.string().min(1).max(100),
        memberIds: z.array(z.string()).min(1),
      }),
      responses: {
        201: chatResponseSchema,
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    createChannel: {
      method: 'POST' as const,
      path: '/api/chats/channel' as const,
      input: z.object({
        name: z.string().min(1).max(100),
      }),
      responses: {
        201: chatResponseSchema,
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    updateGroup: {
      method: 'PATCH' as const,
      path: '/api/chats/:chatId' as const,
      input: z.object({
        name: z.string().min(1).max(100).optional(),
        avatarUrl: z.string().nullable().optional(),
      }),
      responses: {
        200: chatResponseSchema,
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
    addMembers: {
      method: 'POST' as const,
      path: '/api/chats/:chatId/members' as const,
      input: z.object({
        userIds: z.array(z.string()).min(1),
      }),
      responses: {
        200: chatResponseSchema,
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
    removeMember: {
      method: 'DELETE' as const,
      path: '/api/chats/:chatId/members/:userId' as const,
      responses: {
        200: z.object({ success: z.boolean() }),
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
    leaveGroup: {
      method: 'POST' as const,
      path: '/api/chats/:chatId/leave' as const,
      responses: {
        200: z.object({ success: z.boolean() }),
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
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
    search: {
      method: 'GET' as const,
      path: '/api/chats/:chatId/messages/search' as const,
      input: z.object({
        q: z.string().min(1),
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
    },
    edit: {
      method: 'PUT' as const,
      path: '/api/messages/:messageId' as const,
      input: z.object({
        content: z.string().min(1),
      }),
      responses: {
        200: messageResponseSchema,
        401: errorSchemas.unauthorized,
        403: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    addReaction: {
      method: 'POST' as const,
      path: '/api/messages/:messageId/reactions' as const,
      input: z.object({
        emoji: z.string().min(1).max(10),
      }),
      responses: {
        201: reactionResponseSchema,
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
    removeReaction: {
      method: 'DELETE' as const,
      path: '/api/messages/:messageId/reactions/:emoji' as const,
         comments: {
           list: {
             method: 'GET' as const,
             path: '/api/messages/:messageId/comments' as const,
             responses: {
               200: z.array(commentResponseSchema),
               401: errorSchemas.unauthorized,
               404: errorSchemas.notFound,
             },
           },
           add: {
             method: 'POST' as const,
             path: '/api/messages/:messageId/comments' as const,
             input: z.object({
               content: z.string().min(1).max(5000),
             }),
             responses: {
               201: commentResponseSchema,
               400: errorSchemas.validation,
               401: errorSchemas.unauthorized,
               404: errorSchemas.notFound,
             },
           },
           edit: {
             method: 'PUT' as const,
             path: '/api/messages/:messageId/comments/:commentId' as const,
             input: z.object({
               content: z.string().min(1).max(5000),
             }),
             responses: {
               200: commentResponseSchema,
               400: errorSchemas.validation,
               401: errorSchemas.unauthorized,
               404: errorSchemas.notFound,
             },
           },
           delete: {
             method: 'DELETE' as const,
             path: '/api/messages/:messageId/comments/:commentId' as const,
             responses: {
               200: z.object({ success: z.boolean() }),
               401: errorSchemas.unauthorized,
               404: errorSchemas.notFound,
             },
           },
         },
      responses: {
        200: z.object({ success: z.boolean() }),
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
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
export type ReactionResponse = z.infer<typeof reactionResponseSchema>;
export type UserResponse = z.infer<typeof userSchema>;
export type CommentResponse = z.infer<typeof commentResponseSchema>;
