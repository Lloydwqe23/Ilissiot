import { getFullUrl } from '../api';
import type { Chat, User } from '../types';

export function getChatName(chat: Chat, currentUserId: string): string {
  if (chat.isGroup) return chat.name || 'Group Chat';
  const otherMember = chat.members.find((m) => m.userId !== currentUserId);
  if (!otherMember?.user) return 'Chat';
  return getDisplayName(otherMember.user);
}

export function getChatAvatar(chat: Chat, currentUserId: string): string | null {
  if (chat.isGroup) return chat.avatarUrl ? getFullUrl(chat.avatarUrl) : null;
  const otherMember = chat.members.find((m) => m.userId !== currentUserId);
  return otherMember?.user?.profileImageUrl
    ? getFullUrl(otherMember.user.profileImageUrl)
    : null;
}

export function getOtherUser(chat: Chat, currentUserId: string): User | null {
  if (chat.isGroup) return null;
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
