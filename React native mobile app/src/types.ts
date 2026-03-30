// Shared types mirroring the web app's schema
export interface User {
  id: string;
  email?: string | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  bio?: string | null;
  birthday?: string | null;
  status?: string | null;
  theme?: string;
  colorTheme?: string | null;
  fontType?: string | null;
  textSize?: string | null;
  lastSeen?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ChatMember {
  id: number;
  chatId: number;
  userId: string;
  role?: string | null;
  title?: string | null;
  permissions?: Record<string, boolean> | null;
  joinedAt?: string | null;
  pinnedAt?: string | null;
  user: User;
}

export interface Attachment {
  name: string;
  url: string;
  type: string;
}

export interface Reaction {
  id: number;
  messageId: number;
  userId: string;
  emoji: string;
  createdAt?: string | null;
  user: User;
}

export interface PollOption {
  id: number;
  text: string;
}

export interface PollResult {
  optionId: number;
  count: number;
  voters?: User[];
}

export interface Poll {
  id: number;
  chatId: number;
  messageId: number;
  createdBy: string;
  question: string;
  options: PollOption[];
  allowMultipleAnswers?: boolean | null;
  isAnonymous?: boolean | null;
  isClosed?: boolean | null;
  closesAt?: string | null;
  createdAt?: string | null;
  results: PollResult[];
  userVotes?: number[];
  totalVotes: number;
}

export interface Message {
  id: number;
  chatId: number;
  senderId: string;
  content?: string | null;
  attachments?: Attachment[];
  isEdited?: boolean | null;
  isRead?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  sender: User;
  poll?: Poll | null;
  reactions?: Reaction[];
}

export interface Chat {
  id: number;
  isGroup?: boolean | null;
  name?: string | null;
  avatarUrl?: string | null;
  creatorId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  members: ChatMember[];
  lastMessage?: Message | null;
  unreadCount?: number;
}

export interface PinnedMessage {
  id: number;
  chatId: number;
  messageId: number;
  pinnedBy: string;
  pinnedAt?: string | null;
  message: Message;
  pinnedByUser: User;
}

export interface InviteLink {
  id: number;
  chatId: number;
  token: string;
  createdBy: string;
  expiresAt?: string | null;
  maxUses?: number | null;
  currentUses: number;
  isActive?: boolean;
  createdAt?: string | null;
}

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
  POLL_NEW: 'poll:new',
  POLL_VOTE: 'poll:vote',
  POLL_CLOSE: 'poll:close',
  CALL_OFFER: 'call:offer',
  CALL_ANSWER: 'call:answer',
  CALL_ICE_CANDIDATE: 'call:ice-candidate',
  CALL_HANGUP: 'call:hangup',
  CALL_REJECT: 'call:reject',
  CALL_BUSY: 'call:busy',
  CHAT_DELETED: 'chat:deleted',
} as const;

export interface WsMessage<T = unknown> {
  type: (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
  payload: T;
}
