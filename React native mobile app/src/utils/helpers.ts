import { getFullUrl } from '../api';
import type { Attachment, Chat, Message, User } from '../types';

export function getChatName(chat: Chat, currentUserId: string): string {
  if (chat.isChannel) return chat.name || 'Channel';
  if (chat.isGroup) return chat.name || 'Group Chat';
  const otherMember = chat.members.find((m) => m.userId !== currentUserId);
  if (!otherMember?.user) return 'Chat';
  return getDisplayName(otherMember.user);
}

export function getChatAvatar(chat: Chat, currentUserId: string): string | null {
  if (chat.isChannel || chat.isGroup) return chat.avatarUrl ? getFullUrl(chat.avatarUrl) : null;
  const otherMember = chat.members.find((m) => m.userId !== currentUserId);
  return otherMember?.user?.profileImageUrl
    ? getFullUrl(otherMember.user.profileImageUrl)
    : null;
}

export function getOtherUser(chat: Chat, currentUserId: string): User | null {
  if (chat.isChannel || chat.isGroup) return null;
  const otherMember = chat.members.find((m) => m.userId !== currentUserId);
  return otherMember?.user || null;
}

export function getDisplayName(user: User): string {
  if (user.firstName || user.lastName) {
    return [user.firstName, user.lastName].filter(Boolean).join(' ');
  }
  return user.username || 'User';
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function formatMessageTime(date: string | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const dayDiff = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (dayDiff === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatFullTime(date: string | null | undefined): string {
  if (!date) return '';
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// Format message content for preview (strip markdown)
export function formatPreview(content: string | null | undefined): string {
  if (!content) return '';
  return content
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/~(.+?)~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\|\|(.+?)\|\|/g, '[spoiler]')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1')
    .replace(/^> /gm, '');
}

const IMAGE_EXT_RE = /(\.jpg|\.jpeg|\.png|\.gif|\.webp|\.bmp|\.heic|\.heif|\.jfif)(\?|$)/i;
const VIDEO_EXT_RE = /(\.mp4|\.mov|\.webm|\.m4v|\.avi|\.mkv)(\?|$)/i;
const AUDIO_EXT_RE = /(\.mp3|\.m4a|\.aac|\.wav|\.ogg|\.flac|\.opus|\.webm)(\?|$)/i;

function getAttachmentPreviewLabel(attachment: Attachment): string {
  const type = (attachment.type || '').toLowerCase();
  const name = attachment.name || '';
  const lowerName = name.toLowerCase();
  const lowerUrl = (attachment.url || '').toLowerCase();

  const isImage = type.startsWith('image/') || IMAGE_EXT_RE.test(lowerName) || IMAGE_EXT_RE.test(lowerUrl);
  const isVideo = type.startsWith('video/') || VIDEO_EXT_RE.test(lowerName) || VIDEO_EXT_RE.test(lowerUrl);
  const isAudio = type.startsWith('audio/') || AUDIO_EXT_RE.test(lowerName) || AUDIO_EXT_RE.test(lowerUrl);

  if (type === 'sticker') return '😀 Sticker';
  if (type.startsWith('call/')) return '📞 Call';
  if (isImage) return '🖼 Photo';
  if (isVideo) return '🎬 Video';
  if (isAudio) return '🎵 Audio';

  return name.trim() ? `📄 ${name}` : '📎 File';
}

export function getMessagePreviewText(
  message: Message | null | undefined,
  currentUserId?: string,
  options?: { includeGroupSender?: boolean }
): string {
  if (!message) return '';

  let prefix = '';
  if (currentUserId && message.senderId === currentUserId) {
    prefix = 'You: ';
  } else if (options?.includeGroupSender) {
    const senderName = getDisplayName(message.sender);
    if (senderName && senderName !== 'User') {
      prefix = `${senderName}: `;
    }
  }

  const attachments = (message.attachments || []).filter(
    (attachment) => attachment.type !== 'reply' && attachment.type !== 'forward'
  );
  const hasForward = (message.attachments || []).some((attachment) => attachment.type === 'forward');
  const forwardPrefix = hasForward ? '↗ ' : '';

  const content = formatPreview(message.content).trim();
  if (content) {
    return `${prefix}${forwardPrefix}${content}`;
  }

  if (attachments.length > 0) {
    return `${prefix}${forwardPrefix}${getAttachmentPreviewLabel(attachments[0])}`;
  }

  return `${prefix}${forwardPrefix}Message`;
}
