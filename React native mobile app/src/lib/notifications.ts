import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiRequest } from '../api';

type NotificationsModule = typeof import('expo-notifications');

let notificationsInitialized = false;
let notificationPermissionGranted = false;
let notificationHandlerConfigured = false;
let notificationsModulePromise: Promise<NotificationsModule | null> | null = null;
let registeredPushToken: string | null = null;
let registeredPushTokenUserId: string | null = null;

function isExpoGoAndroidRuntime(): boolean {
  const executionEnvironment = (Constants as { executionEnvironment?: string }).executionEnvironment;
  const appOwnership = Constants.appOwnership;
  const isExpoGo = appOwnership === 'expo' || executionEnvironment === 'storeClient';
  return Platform.OS === 'android' && isExpoGo;
}

async function getNotificationsModule(): Promise<NotificationsModule | null> {
  if (isExpoGoAndroidRuntime()) {
    return null;
  }

  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications')
      .then((mod) => mod)
      .catch(() => null);
  }

  return notificationsModulePromise;
}

function getExpoProjectId(): string | undefined {
  const constants = Constants as unknown as {
    expoConfig?: { extra?: { eas?: { projectId?: string } } };
    easConfig?: { projectId?: string };
  };

  return constants.expoConfig?.extra?.eas?.projectId || constants.easConfig?.projectId;
}

async function resolveExpoPushToken(Notifications: NotificationsModule): Promise<string | null> {
  try {
    const projectId = getExpoProjectId();
    const result = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    return result.data || null;
  } catch {
    return null;
  }
}

function configureNotificationHandler(Notifications: NotificationsModule) {
  if (notificationHandlerConfigured) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  notificationHandlerConfigured = true;
}

async function ensureAndroidChannel(Notifications: NotificationsModule) {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function initializeNotifications(): Promise<boolean> {
  if (notificationsInitialized) {
    return notificationPermissionGranted;
  }

  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    notificationsInitialized = true;
    notificationPermissionGranted = false;
    return false;
  }

  configureNotificationHandler(Notifications);

  try {
    const currentPermissions = await Notifications.getPermissionsAsync();
    let granted = currentPermissions.granted;

    if (!granted && currentPermissions.canAskAgain) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }

    notificationPermissionGranted = granted;

    if (granted) {
      await ensureAndroidChannel(Notifications);
    }
  } catch {
    notificationPermissionGranted = false;
  }

  notificationsInitialized = true;
  return notificationPermissionGranted;
}

export async function registerDevicePushToken(userId?: string): Promise<void> {
  if (!userId) return;

  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  const isReady = await initializeNotifications();
  if (!isReady) return;

  const token = await resolveExpoPushToken(Notifications);
  if (!token) return;

  if (registeredPushToken === token && registeredPushTokenUserId === userId) {
    return;
  }

  try {
    await apiRequest('/api/notifications/push-token', {
      method: 'POST',
      body: {
        token,
        platform: Platform.OS,
      },
    });

    registeredPushToken = token;
    registeredPushTokenUserId = userId;
  } catch {
    // Keep app flow stable even if push registration fails.
  }
}

export async function unregisterDevicePushToken(): Promise<void> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    registeredPushToken = null;
    registeredPushTokenUserId = null;
    return;
  }

  const token = registeredPushToken || await resolveExpoPushToken(Notifications);

  try {
    await apiRequest('/api/notifications/push-token', {
      method: 'DELETE',
      body: token ? { token } : {},
    });
  } catch {
    // Ignore deregistration failures to avoid blocking logout.
  }

  registeredPushToken = null;
  registeredPushTokenUserId = null;
}

function buildMessageBody(content: string | null | undefined, attachmentCount?: number): string {
  const trimmed = (content || '').trim();
  if (trimmed.length > 0) {
    return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
  }

  if (attachmentCount && attachmentCount > 0) {
    return attachmentCount === 1 ? 'Sent an attachment' : `Sent ${attachmentCount} attachments`;
  }

  return 'New message';
}

export async function showIncomingMessageNotification(input: {
  chatId: number;
  chatName: string;
  senderName: string;
  content?: string | null;
  attachmentCount?: number;
  isGroup?: boolean;
  isChannel?: boolean;
}): Promise<void> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  const isReady = await initializeNotifications();
  if (!isReady) return;

  const { chatId, chatName, senderName, content, attachmentCount, isGroup, isChannel } = input;

  const title = isChannel
    ? `#${chatName}`
    : isGroup
      ? chatName
      : senderName;

  const body = isGroup || isChannel
    ? `${senderName}: ${buildMessageBody(content, attachmentCount)}`
    : buildMessageBody(content, attachmentCount);

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        chatId,
      },
      sound: 'default',
    },
    trigger: null,
  });
}
