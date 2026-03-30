import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking,
  ActivityIndicator,
  Modal,
  Dimensions,
  Pressable,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { setStringAsync } from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio, Video, ResizeMode } from 'expo-av';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { useAuth } from '../hooks/useAuth';
import { useChat, useVotePoll, usePinMessage, useUnpinMessage, usePinnedMessages } from '../hooks/useChats';
import { useMessages, useSendMessage, useMarkMessagesRead, useEditMessage, useDeleteMessages, useAddReaction, useRemoveReaction, useClearChat } from '../hooks/useMessages';
import { useTyping, useSendTyping } from '../hooks/useTyping';
import { useUserStatus } from '@/hooks/useUserStatus';
import { getThemeColors } from '../theme';
import { BackgroundPickerModal } from '../components/background-picker';
import { getChatBackground, setChatBackground, findBackground, getCustomBackgroundUrl, setCustomBackgroundUrl, removeCustomBackground } from '../lib/chat-backgrounds';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest, getFullUrl } from '../api';
import {
  getChatName,
  getChatAvatar,
  getOtherUser,
  getDisplayName,
  getInitials,
  formatFullTime,
  formatMessageTime,
} from '../utils/helpers';
import type { Message, Attachment, Chat } from '../types';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉'];
const STICKERS = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '😎', '🤔', '😴', '🥳',
  '😇', '🤩', '😘', '😜', '😡', '😭', '😱', '👍', '👏', '🔥',
  '🎉', '💯', '❤️', '💙', '💚', '💛', '🧡', '💜', '🤝', '🙏',
];
const AUDIO_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const AUDIO_WAVE_BARS = [3, 5, 8, 4, 9, 6, 10, 7, 5, 8, 4, 6, 9, 3, 7, 10, 5, 8, 4, 6, 9, 7, 5, 3, 8, 6, 10, 4, 7, 5, 9, 6];
const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Props = {
  navigation: any;
  route: { params: { chatId: number; messageId?: number } };
};

export function ChatWindowScreen({ navigation, route }: Props) {
  const { chatId } = route.params;
  const initialMessageId = route.params?.messageId;
  const { user } = useAuth();
  // Fix: Ensure all required properties are initialized
  const colors = getThemeColors(user?.theme, user?.colorTheme);
  const insets = useSafeAreaInsets();
  const { data: chat } = useChat(chatId);
  const otherUser = chat ? getOtherUser(chat, user?.id || '') : null;
  const { statusText } = useUserStatus(otherUser?.id || null, otherUser?.status || null, otherUser?.lastSeen || null);
  const { typingText } = useTyping(chatId);
  const sendTyping = useSendTyping(chatId);
  const chatName = chat ? getChatName(chat, user?.id || '') : 'Chat';
  const chatAvatar = chat ? getChatAvatar(chat, user?.id || '') : null;

  const [messageText, setMessageText] = useState('');
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showReactions, setShowReactions] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [pollSelections, setPollSelections] = useState<Record<number, number[]>>({});
  const [showCallsModal, setShowCallsModal] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  // Use useMessages hook for chat messages
  const { data: messages, isLoading: messagesLoading } = useMessages(chatId);
  const { data: pinnedMessages } = usePinnedMessages(chatId);
  const [uploading, setUploading] = useState(false);
  const [selectedImages, setSelectedImages] = useState<Attachment[]>([]);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [imagePickerIndex, setImagePickerIndex] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [recordingAudio, setRecordingAudio] = useState<Audio.Recording | null>(null);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [playingAudioUrl, setPlayingAudioUrl] = useState<string | null>(null);
  const [audioLoadingUrl, setAudioLoadingUrl] = useState<string | null>(null);
  const [audioPositionSec, setAudioPositionSec] = useState(0);
  const [audioDurationSec, setAudioDurationSec] = useState(0);
  const [audioPlaybackRate, setAudioPlaybackRate] = useState(1);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
  const [videoStatusByUrl, setVideoStatusByUrl] = useState<Record<string, { positionSec: number; durationSec: number }>>({});
  const [finishedVideoUrls, setFinishedVideoUrls] = useState<Set<string>>(new Set());
  const [fullscreenVideoUrl, setFullscreenVideoUrl] = useState<string | null>(null);
  const [chatBgId, setChatBgId] = useState<string>('default');
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(null);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const isNearBottomRef = useRef(true);
  const soundRef = useRef<Audio.Sound | null>(null);
  const videoRefs = useRef<Record<string, Video | null>>({});
  const fullscreenVideoRef = useRef<Video | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const sendMessage = useSendMessage();
  const removeReaction = useRemoveReaction();
  const addReaction = useAddReaction();
  const deleteMessages = useDeleteMessages();
  const markMessagesRead = useMarkMessagesRead();
  const editMessage = useEditMessage();
  const votePoll = useVotePoll();
  const pinMessage = usePinMessage();
  const unpinMessage = useUnpinMessage();
  const clearChat = useClearChat();

  const pinnedMessageIds = useMemo(() => {
    return new Set<number>((pinnedMessages || []).map((p) => p.messageId));
  }, [pinnedMessages]);

  const latestPinned = pinnedMessages?.[0]?.message;

  // Swipe gesture to go back - memoized to prevent re-creation on every render
  const swipeGesture = useCallback(() => {
    return Gesture.Pan()
      .maxPointers(1)
      // Activate only on a deliberate horizontal swipe so vertical list scrolling keeps working.
      .activeOffsetX(80)
      .failOffsetY([-18, 18])
      .onEnd((event) => {
        // Only trigger on right swipe with sufficient velocity
        if (event.translationX > 80 && event.velocityX > 500) {
          runOnJS(navigation.goBack)();
        }
      });
  }, [navigation]);

  const swipe = swipeGesture();

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !messages?.length) return [] as Array<{ messageId: number; index: number }>;

    const matches: Array<{ messageId: number; index: number }> = [];
    messages.forEach((m, index) => {
      if (m.content?.toLowerCase().includes(q)) {
        matches.push({ messageId: m.id, index });
      }
    });

    return matches;
  }, [messages, searchQuery]);

  useEffect(() => {
    if (!chatId || !messages?.length) return;
    markMessagesRead.mutate(chatId);
  }, [chatId, messages?.length]);

  useEffect(() => {
    if (!searchMatches.length) return;

    if (currentSearchIndex > searchMatches.length - 1) {
      setCurrentSearchIndex(0);
      return;
    }

    const target = searchMatches[currentSearchIndex];
    if (!target) return;

    setTimeout(() => {
      flatListRef.current?.scrollToIndex({ index: target.index, animated: true, viewPosition: 0.5 });
    }, 40);
  }, [searchMatches, currentSearchIndex]);

  useEffect(() => {
    const onShow = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates?.height || 0);

      if (!initialMessageId && isNearBottomRef.current) {
        // Run twice to follow Android keyboard animation and keep latest visible message on screen.
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 180);
      }
    });

    const onHide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);

      if (!initialMessageId && isNearBottomRef.current) {
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 80);
      }
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [initialMessageId]);

  useEffect(() => {
    if (!initialMessageId || !messages?.length) return;
    const idx = messages.findIndex((m) => m.id === initialMessageId);
    if (idx < 0) return;
    // Defer a tick to let FlatList measure
    setTimeout(() => {
      flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    }, 50);
  }, [initialMessageId, messages]);

  // Clear poll selections after successful vote
  useEffect(() => {
    if (votePoll.isSuccess) {
      setPollSelections({});
    }
  }, [votePoll.isSuccess]);

  // Load chat background on mount or chat change
  useEffect(() => {
    (async () => {
      const bgId = await getChatBackground(chatId, AsyncStorage);
      const customUrl = await getCustomBackgroundUrl(chatId, AsyncStorage);
      setChatBgId(bgId);
      setCustomBgUrl(customUrl);
    })();
  }, [chatId]);

  const handleSelectBackground = async (bgId: string) => {
    setChatBgId(bgId);
    await setChatBackground(chatId, bgId, AsyncStorage);
  };

  const handleCustomImage = async (url: string) => {
    setCustomBgUrl(url);
    setChatBgId('custom-image');
    await setCustomBackgroundUrl(chatId, url, AsyncStorage);
  };

  const handleRemoveCustomImage = async () => {
    setCustomBgUrl(null);
    setChatBgId('default');
    await removeCustomBackground(chatId, AsyncStorage);
  };

  useEffect(() => {
    return () => {
      if (recordingAudio) {
        recordingAudio.stopAndUnloadAsync().catch(() => {});
      }
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, [recordingAudio]);

  const handleSend = () => {
    const text = messageText.trim();
    if (!text && !editingMessage) return;

    if (editingMessage) {
      editMessage.mutate({
        messageId: editingMessage.id,
        content: text,
        chatId,
      });
      setEditingMessage(null);
    } else {
      sendMessage.mutate({ chatId, content: text });
    }

    setMessageText('');
  };

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow photo library access to attach images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      setUploading(true);
      try {
        const uri = asset.uri;
        const filename = uri.split('/').pop() || `image-${Date.now()}`;
        const ext = filename.split('.').pop()?.toLowerCase() || 'jpeg';
        const type = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

        const formData = new FormData();
        formData.append('file', {
          uri,
          name: filename,
          type,
        } as any);

        const response = await apiRequest<{ url: string }>('/api/upload', {
          method: 'POST',
          body: formData,
          isFormData: true,
        });

        const newImage = { name: filename, url: response.url, type };
        setSelectedImages([...selectedImages, newImage]);
        setImagePickerIndex(selectedImages.length);
        setShowImagePicker(true);
      } catch (err) {
        Alert.alert('Upload Failed', 'Could not upload the image. Please try again.');
      } finally {
        setUploading(false);
      }
    } catch {
      Alert.alert('Attachment failed', 'Could not pick an image. Please try again.');
    }
  };

  const handlePickGif = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow photo library access to attach GIFs.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      const uri = asset.uri;
      const filename = uri.split('/').pop() || `gif-${Date.now()}`;
      const type = 'image/gif';

      await uploadFile(uri, filename, type);
    } catch {
      Alert.alert('Attachment failed', 'Could not pick a GIF. Please try again.');
    }
  };

  const handleStickerSelect = (sticker: string) => {
    setMessageText((prev) => `${prev}${sticker}`);
    setShowStickerPicker(false);
  };

  const startAudioRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow microphone access to record audio.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      setRecordingAudio(recording);
      setIsRecordingAudio(true);
    } catch {
      Alert.alert('Recording failed', 'Could not start audio recording.');
    }
  };

  const stopAudioRecording = async () => {
    if (!recordingAudio) return;

    try {
      await recordingAudio.stopAndUnloadAsync();
      const uri = recordingAudio.getURI();
      if (uri) {
        await uploadFile(uri, `audio-${Date.now()}.m4a`, 'audio/m4a');
      }
    } catch {
      Alert.alert('Recording failed', 'Could not finish audio recording.');
    } finally {
      setRecordingAudio(null);
      setIsRecordingAudio(false);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      }).catch(() => {});
    }
  };

  const recordVideoMessage = async () => {
    try {
      const camPermission = await ImagePicker.requestCameraPermissionsAsync();
      if (camPermission.status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow camera access to record video.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        quality: 0.8,
        videoMaxDuration: 120,
      });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      const uriParts = asset.uri.split('/').pop() || '';
      const extFromUri = (uriParts.includes('.') ? uriParts.split('.').pop() : '')?.toLowerCase();
      const ext = extFromUri || (asset.mimeType?.includes('mp4') ? 'mp4' : 'mov');
      const mimeFromExt = ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm' : 'video/quicktime';
      const fileName = asset.fileName || `video-${Date.now()}.${ext}`;

      await uploadFile(asset.uri, fileName, asset.mimeType || mimeFromExt);
    } catch {
      Alert.alert('Recording failed', 'Could not record video.');
    }
  };

  const handleRecordPress = () => {
    if (isRecordingAudio) {
      stopAudioRecording();
      return;
    }

    Alert.alert('Record', 'Choose recording type', [
      { text: 'Audio message', onPress: startAudioRecording },
      { text: 'Video message', onPress: recordVideoMessage },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const toggleAudioPlayback = async (url: string) => {
    try {
      if (audioLoadingUrl) return;

      if (playingAudioUrl === url && soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
          await soundRef.current.pauseAsync();
          setPlayingAudioUrl(null);
          return;
        }
        await soundRef.current.playAsync();
        setPlayingAudioUrl(url);
        return;
      }

      setAudioLoadingUrl(url);
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true, rate: audioPlaybackRate, shouldCorrectPitch: true },
        (status) => {
          if (!status.isLoaded) {
            return;
          }
          setAudioPositionSec((status.positionMillis || 0) / 1000);
          setAudioDurationSec((status.durationMillis || 0) / 1000);

          if (status.didJustFinish) {
            setPlayingAudioUrl(null);
            setAudioPositionSec(0);
          }
        }
      );

      soundRef.current = sound;
      setPlayingAudioUrl(url);
      const initialStatus = await sound.getStatusAsync();
      if (initialStatus.isLoaded) {
        setAudioDurationSec((initialStatus.durationMillis || 0) / 1000);
      }
    } catch {
      Alert.alert('Playback failed', 'Could not play this audio message.');
      setPlayingAudioUrl(null);
    } finally {
      setAudioLoadingUrl(null);
    }
  };

  const cycleAudioSpeed = async () => {
    const next = AUDIO_SPEEDS[(AUDIO_SPEEDS.indexOf(audioPlaybackRate) + 1) % AUDIO_SPEEDS.length];
    setAudioPlaybackRate(next);

    if (soundRef.current && playingAudioUrl) {
      try {
        await soundRef.current.setRateAsync(next, true);
      } catch {
        // noop
      }
    }
  };

  const formatAudioTime = (seconds: number) => {
    if (!seconds || Number.isNaN(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatVideoTime = (seconds: number) => {
    if (!seconds || Number.isNaN(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const toggleVideoPlayback = async (url: string) => {
    const target = videoRefs.current[url];
    if (!target) return;

    try {
      if (playingVideoUrl === url) {
        await target.pauseAsync();
        setPlayingVideoUrl(null);
        return;
      }

      if (playingVideoUrl && videoRefs.current[playingVideoUrl]) {
        await videoRefs.current[playingVideoUrl]?.pauseAsync();
      }

      await target.playAsync();
      setPlayingVideoUrl(url);
    } catch {
      // noop
    }
  };

  const replayVideo = async (url: string) => {
    const target = videoRefs.current[url];
    if (!target) return;

    try {
      await (target as any).setStatusAsync({ positionMillis: 0 });
      setFinishedVideoUrls((prev) => {
        const next = new Set(prev);
        next.delete(url);
        return next;
      });
      await target.playAsync();
      setPlayingVideoUrl(url);
    } catch {
      // noop
    }
  };

  const getDisplayFileName = (name: string) => {
    try {
      return decodeURIComponent(name);
    } catch {
      return name;
    }
  };

  const getFileExtLabel = (name: string, type: string) => {
    const ext = (name.split('.').pop() || '').toUpperCase();
    if (ext) return ext;
    if (type.includes('/')) return type.split('/')[1].toUpperCase();
    return 'FILE';
  };

  const getFileIconName = (name: string, type: string): keyof typeof Ionicons.glyphMap => {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (type.includes('pdf') || ext === 'pdf') return 'document-text-outline';
    if (['doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) return 'document-text-outline';
    if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'grid-outline';
    if (['ppt', 'pptx', 'odp', 'key'].includes(ext)) return 'easel-outline';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive-outline';
    if (['js', 'ts', 'tsx', 'jsx', 'json', 'xml', 'html', 'css', 'py', 'java', 'cpp', 'c', 'cs', 'php'].includes(ext)) return 'code-slash-outline';
    return 'document-outline';
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      await uploadFile(asset.uri, asset.name || `document-${Date.now()}`, asset.mimeType || 'application/octet-stream');
    } catch {
      Alert.alert('Attachment failed', 'Could not pick a document. Please try again.');
    }
  };

  const confirmImageSelection = () => {
    if (selectedImages.length === 0) return;
    sendMessage.mutate({
      chatId,
      content: messageText.trim() || undefined,
      attachments: selectedImages,
    });
    setMessageText('');
    setSelectedImages([]);
    setShowImagePicker(false);
    setImagePickerIndex(0);
  };;

  const uploadFile = async (uri: string, name: string, type: string) => {
    setUploading(true);
    try {
      let uploadUri = uri;
      // Some Android camera/video providers return content:// URIs that are not reliably streamable via FormData.
      if (uri.startsWith('content://')) {
        const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const dest = `${FileSystemLegacy.cacheDirectory || ''}${Date.now()}-${safeName}`;
        await FileSystemLegacy.copyAsync({ from: uri, to: dest });
        uploadUri = dest;
      }

      const formData = new FormData();
      formData.append('file', {
        uri: uploadUri,
        name,
        type,
      } as any);

      const response = await apiRequest<{ url: string; name?: string; type?: string }>('/api/upload', {
        method: 'POST',
        body: formData,
        isFormData: true,
      });

      const attachment: Attachment = {
        name: response?.name || name,
        url: response.url,
        type: response?.type || type,
      };
      sendMessage.mutate({
        chatId,
        content: messageText.trim() || undefined,
        attachments: [attachment],
      });
      setMessageText('');
    } catch (err) {
      Alert.alert('Upload Failed', 'Could not upload the file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleLongPress = (message: Message) => {
    setSelectedMessage(message);
  };

  const handleReaction = (emoji: string) => {
    if (!selectedMessage || !user) return;
    const existingReaction = selectedMessage.reactions?.find(
      (r) => r.userId === user.id && r.emoji === emoji
    );
    if (existingReaction) {
      removeReaction.mutate({ messageId: selectedMessage.id, emoji, chatId });
    } else {
      addReaction.mutate({ messageId: selectedMessage.id, emoji, chatId });
    }
    setSelectedMessage(null);
    setShowReactions(false);
  };

  const handleDeleteMessage = (forAll: boolean) => {
    if (!selectedMessage) return;
    deleteMessages.mutate({
      messageIds: [selectedMessage.id],
      forAll,
      chatId,
    });
    setSelectedMessage(null);
  };

  const handleEditMessage = () => {
    if (!selectedMessage) return;
    setEditingMessage(selectedMessage);
    setMessageText(selectedMessage.content || '');
    setSelectedMessage(null);
  };

  const openHeaderMenu = () => {
    setShowHeaderMenu(true);
  };

  const handleToggleSearch = () => {
    if (searchVisible) {
      setSearchVisible(false);
      setSearchQuery('');
      setCurrentSearchIndex(0);
    } else {
      setSearchVisible(true);
    }
  };

  const handleClearHistory = () => {
    Alert.alert('Clear history', 'Remove all messages from your view?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => clearChat.mutate({ chatId, forAll: false }),
      },
    ]);
  };

  const headerMenuActions: Array<{
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    destructive?: boolean;
    onPress: () => void;
  }> = [
    {
      key: 'search',
      label: searchVisible ? 'Hide Search' : 'Search Messages',
      icon: 'search',
      onPress: handleToggleSearch,
    },
    {
      key: 'pinned',
      label: 'Pinned Messages',
      icon: 'pin-outline',
      onPress: () => navigation.navigate('PinnedMessages', { chatId }),
    },
    ...(chat?.isGroup
      ? [
          {
            key: 'poll',
            label: 'Create Poll',
            icon: 'bar-chart-outline' as keyof typeof Ionicons.glyphMap,
            onPress: () => navigation.navigate('CreatePoll', { chatId }),
          },
          {
            key: 'group',
            label: 'Group Info',
            icon: 'people-outline' as keyof typeof Ionicons.glyphMap,
            onPress: () => navigation.navigate('GroupInfo', { chatId }),
          },
        ]
      : otherUser
        ? [
            {
              key: 'profile',
              label: 'View Profile',
              icon: 'person-outline' as keyof typeof Ionicons.glyphMap,
              onPress: () => navigation.navigate('UserProfile', { userId: otherUser.id, chatId }),
            },
          ]
        : []),
    {
      key: 'background',
      label: 'Change Background',
      icon: 'image-outline' as keyof typeof Ionicons.glyphMap,
      onPress: () => setShowBgPicker(true),
    },
    {
      key: 'clear',
      label: 'Clear History for Me',
      icon: 'trash-outline',
      destructive: true,
      onPress: handleClearHistory,
    },
  ];

  const attachMenuActions: Array<{
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  }> = [
    {
      key: 'photo',
      label: 'Photo/Video',
      icon: 'images-outline',
      onPress: handlePickImage,
    },
    {
      key: 'document',
      label: 'Document',
      icon: 'document-outline',
      onPress: handlePickDocument,
    },
    ...(chat?.isGroup
      ? [
          {
            key: 'poll',
            label: 'Poll',
            icon: 'bar-chart-outline' as keyof typeof Ionicons.glyphMap,
            onPress: () => navigation.navigate('CreatePoll', { chatId }),
          },
        ]
      : []),
  ];

  const renderAttachment = (attachment: Attachment, isMine: boolean) => {
    const url = getFullUrl(attachment.url);
    const lowerName = (attachment.name || '').toLowerCase();
    const lowerUrl = (attachment.url || '').toLowerCase();
    const isRecordedAudio = lowerName.startsWith('audio-');
    const isRecordedVideo = lowerName.startsWith('video-') || lowerName.startsWith('screen-');
    const isImageByExt = /(\.jpg|\.jpeg|\.png|\.gif|\.webp|\.bmp|\.heic|\.heif|\.jfif)(\?|$)/.test(lowerName)
      || /(\.jpg|\.jpeg|\.png|\.gif|\.webp|\.bmp|\.heic|\.heif|\.jfif)(\?|$)/.test(lowerUrl);
    const isVideoByExt = /(\.mp4|\.mov|\.webm|\.m4v|\.avi|\.mkv)(\?|$)/.test(lowerName)
      || /(\.mp4|\.mov|\.webm|\.m4v|\.avi|\.mkv)(\?|$)/.test(lowerUrl);
    const isAudioByExt = /(\.mp3|\.m4a|\.aac|\.wav|\.ogg|\.flac|\.opus|\.webm)(\?|$)/.test(lowerName)
      || /(\.mp3|\.m4a|\.aac|\.wav|\.ogg|\.flac|\.opus|\.webm)(\?|$)/.test(lowerUrl);

    const isImage = attachment.type.startsWith('image/') || isImageByExt;
    const isAudio = isRecordedAudio || attachment.type.startsWith('audio/') || (!isImage && isAudioByExt);
    const isVideo = isRecordedVideo || (!isAudio && (attachment.type.startsWith('video/') || (!isImage && isVideoByExt)));

    if (isImage) {
      return (
        <TouchableOpacity onPress={() => setImagePreview(url)}>
          <Image source={{ uri: url }} style={styles.attachmentImage} resizeMode="cover" />
        </TouchableOpacity>
      );
    }

    if (isVideo) {
      const status = videoStatusByUrl[url];
      const progress = status?.durationSec ? Math.min(100, (status.positionSec / status.durationSec) * 100) : 0;
      const isFinished = finishedVideoUrls.has(url);
      const isPlaying = playingVideoUrl === url;

      return (
        <Pressable
          style={styles.videoAttachmentWrap}
          onPress={() => {
            if (isFinished) {
              replayVideo(url);
            } else {
              toggleVideoPlayback(url);
            }
          }}
        >
          <Video
            ref={(ref) => {
              videoRefs.current[url] = ref;
            }}
            source={{ uri: url }}
            style={styles.attachmentVideo}
            useNativeControls={false}
            resizeMode={ResizeMode.CONTAIN}
            isLooping={false}
            onPlaybackStatusUpdate={(playbackStatus: any) => {
              if (!playbackStatus?.isLoaded) return;
              const positionSec = (playbackStatus.positionMillis || 0) / 1000;
              const durationSec = (playbackStatus.durationMillis || 0) / 1000;
              setVideoStatusByUrl((prev) => ({
                ...prev,
                [url]: { positionSec, durationSec },
              }));
              if (playbackStatus.didJustFinish) {
                setPlayingVideoUrl((prev) => (prev === url ? null : prev));
                setFinishedVideoUrls((prev) => new Set([...prev, url]));
              }
            }}
          />

          {/* Fullscreen button */}
          <TouchableOpacity
            style={styles.videoFullscreenButton}
            onPress={(e) => {
              e.stopPropagation?.();
              setFullscreenVideoUrl(url);
            }}
          >
            <Ionicons name="expand" size={20} color="#fff" />
          </TouchableOpacity>

          {/* Replay button when finished */}
          {isFinished && (
            <View style={styles.videoReplayOverlay}>
              <TouchableOpacity
                style={styles.videoReplayButton}
                onPress={(e) => {
                  e.stopPropagation?.();
                  replayVideo(url);
                }}
              >
                <Ionicons name="play" size={32} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.videoProgressWrap}>
            <Text style={styles.videoTimeText}>{formatVideoTime(status?.positionSec || 0)}</Text>
            <View style={styles.videoProgressTrack}>
              <View style={[styles.videoProgressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.videoTimeText}>{formatVideoTime(status?.durationSec || 0)}</Text>
          </View>
        </Pressable>
      );
    }

    if (isAudio) {
      const isActive = playingAudioUrl === url;
      const progress = audioDurationSec > 0 ? Math.min(100, (audioPositionSec / audioDurationSec) * 100) : 0;

      return (
        <View
          style={[
            styles.audioPlayerWrap,
            {
              backgroundColor: isMine ? 'rgba(255,255,255,0.14)' : colors.surfaceVariant,
              borderColor: isMine ? 'rgba(255,255,255,0.22)' : colors.border,
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.audioPlayButton,
              { backgroundColor: isMine ? 'rgba(255,255,255,0.24)' : colors.primary },
            ]}
            onPress={() => toggleAudioPlayback(url)}
          >
            {audioLoadingUrl === url ? (
              <ActivityIndicator size="small" color={isMine ? '#fff' : '#fff'} />
            ) : (
              <Ionicons
                name={isActive ? 'pause' : 'play'}
                size={16}
                color={isMine ? '#fff' : '#fff'}
                style={!isActive ? { marginLeft: 1 } : undefined}
              />
            )}
          </TouchableOpacity>

          <View style={styles.audioMiddle}>
            <View style={styles.audioWaveRow}>
              {AUDIO_WAVE_BARS.map((h, idx) => {
                const played = (idx / AUDIO_WAVE_BARS.length) * 100 <= (isActive ? progress : 0);
                return (
                  <View
                    key={`${attachment.url}-${idx}`}
                    style={[
                      styles.audioWaveBar,
                      {
                        height: Math.round((h / 10) * 22 + 4),
                        backgroundColor: played
                          ? (isMine ? 'rgba(255,255,255,0.92)' : colors.primary)
                          : (isMine ? 'rgba(255,255,255,0.38)' : 'rgba(100,116,139,0.35)'),
                      },
                    ]}
                  />
                );
              })}
            </View>

            <View style={styles.audioBottomRow}>
              <Text style={[styles.audioTimeText, { color: isMine ? 'rgba(255,255,255,0.78)' : colors.textMuted }]}>
                {formatAudioTime(isActive ? audioPositionSec : audioDurationSec)}
              </Text>
              <View style={styles.audioBottomActions}>
                <TouchableOpacity onPress={cycleAudioSpeed}>
                  <Text style={[styles.audioRateText, { color: isMine ? 'rgba(255,255,255,0.78)' : colors.textMuted }]}>
                    {audioPlaybackRate}x
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Linking.openURL(url)} style={styles.audioDownloadButton}>
                  <Ionicons name="download-outline" size={16} color={isMine ? 'rgba(255,255,255,0.78)' : colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      );
    }

    const displayName = getDisplayFileName(attachment.name);
    const extLabel = getFileExtLabel(displayName, attachment.type);
    const iconName = getFileIconName(displayName, attachment.type);
    const iconColor = isMine ? 'rgba(255,255,255,0.92)' : colors.primary;
    const titleColor = isMine ? 'rgba(255,255,255,0.95)' : colors.text;
    const subColor = isMine ? 'rgba(255,255,255,0.68)' : colors.textMuted;

    return (
      <TouchableOpacity
        style={[
          styles.fileCard,
          {
            backgroundColor: isMine ? 'rgba(255,255,255,0.14)' : colors.surfaceVariant,
            borderColor: isMine ? 'rgba(255,255,255,0.20)' : colors.border,
          },
        ]}
        onPress={() => Linking.openURL(url)}
      >
        <View style={styles.fileCardLeft}>
          <Ionicons name={iconName} size={22} color={iconColor} />
          <View style={styles.fileCardMeta}>
            <Text style={[styles.fileCardName, { color: titleColor }]} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={[styles.fileCardType, { color: subColor }]}>{extLabel}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => Linking.openURL(url)} style={styles.fileCardDownload}>
          <Ionicons name="download-outline" size={18} color={subColor} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderReactions = (message: Message) => {
    if (!message.reactions?.length) return null;

    // Group reactions by emoji
    const groups: Record<string, { count: number; userReacted: boolean }> = {};
    message.reactions.forEach((r) => {
      if (!groups[r.emoji]) {
        groups[r.emoji] = { count: 0, userReacted: false };
      }
      groups[r.emoji].count++;
      if (r.userId === user?.id) groups[r.emoji].userReacted = true;
    });

    return (
      <View style={styles.reactionsContainer}>
        {Object.entries(groups).map(([emoji, data]) => (
          <TouchableOpacity
            key={emoji}
            style={[
              styles.reactionBubble,
              {
                backgroundColor: data.userReacted ? colors.primary + '20' : colors.surfaceVariant,
                borderColor: data.userReacted ? colors.primary : 'transparent',
              },
            ]}
            onPress={() => {
              if (data.userReacted) {
                removeReaction.mutate({ messageId: message.id, emoji, chatId });
              } else {
                addReaction.mutate({ messageId: message.id, emoji, chatId });
              }
            }}
          >
            <Text style={styles.reactionEmoji}>{emoji}</Text>
            <Text style={[styles.reactionCount, { color: colors.text }]}>{data.count}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderPoll = (message: Message) => {
    if (!message.poll) return null;
    const poll = message.poll;
    // Always prefer server data (poll.userVotes) over local selections, unless voting is in progress
    const selected = (poll.userVotes && poll.userVotes.length > 0) ? poll.userVotes : (pollSelections[poll.id] || []);
    const allowMultiple = !!poll.allowMultipleAnswers;
    const canVote = !poll.isClosed;
    const isVoting = votePoll.isPending;

    return (
      <View style={[styles.pollContainer, { backgroundColor: colors.surfaceVariant }]}>
        <Text style={[styles.pollQuestion, { color: colors.text }]}>{poll.question}</Text>
        {poll.options.map((option) => {
          const result = poll.results.find((r) => r.optionId === option.id);
          const count = result?.count || 0;
          const percentage = poll.totalVotes > 0 ? (count / poll.totalVotes) * 100 : 0;
          const voted = selected?.includes(option.id);

          return (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.pollOption,
                {
                  backgroundColor: colors.card,
                  borderColor: voted ? colors.primary : colors.border,
                  opacity: isVoting ? 0.6 : 1,
                },
              ]}
              onPress={() => {
                if (!canVote || isVoting) return;
                setPollSelections((prev) => {
                  const current = prev[poll.id] || [];
                  if (allowMultiple) {
                    const exists = current.includes(option.id);
                    const next = exists ? current.filter((id) => id !== option.id) : [...current, option.id];
                    return { ...prev, [poll.id]: next };
                  }
                  // single answer: vote immediately
                  votePoll.mutate({ chatId, pollId: poll.id, optionIds: [option.id] });
                  return { ...prev, [poll.id]: [option.id] };
                });
              }}
              disabled={!canVote || isVoting}
            >
              <View style={styles.pollOptionContent}>
                <Text style={[styles.pollOptionText, { color: colors.text }]}>{option.text}</Text>
                <Text style={[styles.pollVoteCount, { color: colors.textMuted }]}>{count}</Text>
              </View>
              <View style={[styles.pollBar, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.pollBarFill,
                    { width: `${percentage}%`, backgroundColor: voted ? colors.primary : colors.textMuted },
                  ]}
                />
              </View>
            </TouchableOpacity>
          );
        })}
        {allowMultiple && canVote && (
          <TouchableOpacity
            style={[styles.pollVoteButton, { backgroundColor: selected.length ? colors.primary : colors.border, opacity: isVoting ? 0.6 : 1 }]}
            disabled={!selected.length || isVoting}
            onPress={() => votePoll.mutate({ chatId, pollId: poll.id, optionIds: selected })}
          >
            <Text style={[styles.pollVoteButtonText, { color: selected.length ? '#fff' : colors.textMuted }]}>
              {isVoting ? 'Voting…' : 'Vote'}
            </Text>
          </TouchableOpacity>
        )}
        <Text style={[styles.pollTotal, { color: colors.textMuted }]}>
          {poll.totalVotes} vote{poll.totalVotes !== 1 ? 's' : ''}
          {poll.isClosed ? ' • Closed' : ''}
          {poll.isAnonymous ? ' • Anonymous' : ''}
        </Text>
      </View>
    );
  };

  const renderMessage = ({ item: message, index }: { item: Message; index: number }) => {
    const isMine = message.senderId === user?.id;
    const showSender = chat?.isGroup && !isMine;
    const prevMessage = messages?.[index - 1];
    const showDateSeparator =
      !prevMessage ||
      new Date(message.createdAt || '').toDateString() !==
        new Date(prevMessage.createdAt || '').toDateString();

    // Check if this is a call history message
    const isCallMessage = message.content?.startsWith('📞') || message.content?.startsWith('📹');
    const isCurrentSearchMatch =
      searchMatches.length > 0 &&
      searchMatches[currentSearchIndex]?.messageId === message.id;

    return (
      <View>
        {showDateSeparator && (
          <View style={styles.dateSeparator}>
            <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dateText, { color: colors.textMuted, backgroundColor: colors.background }]}>
              {new Date(message.createdAt || '').toLocaleDateString([], {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
            <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
          </View>
        )}

        {isCallMessage ? (
          <View style={styles.systemMessage}>
            <Text style={[styles.systemMessageText, { color: colors.textMuted }]}>
              {message.content}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={0.8}
            onLongPress={() => handleLongPress(message)}
            style={[styles.messageRow, isMine && styles.messageRowMine]}
          >
            {showSender && !isMine && (
              <View style={[styles.senderAvatar, { backgroundColor: colors.primary }]}>
                {message.sender.profileImageUrl ? (
                  <Image
                    source={{ uri: getFullUrl(message.sender.profileImageUrl) }}
                    style={styles.senderAvatarImage}
                  />
                ) : (
                  <Text style={styles.senderAvatarText}>
                    {getInitials(getDisplayName(message.sender))}
                  </Text>
                )}
              </View>
            )}
            <View
              style={[
                styles.messageBubble,
                {
                  backgroundColor: isMine ? colors.messageBubbleSent : colors.messageBubbleReceived,
                  maxWidth: SCREEN_WIDTH * 0.75,
                },
                isMine ? styles.messageBubbleMine : styles.messageBubbleOther,
                isCurrentSearchMatch ? { borderColor: colors.primary, borderWidth: 2 } : undefined,
              ]}
            >
              {showSender && (
                <Text style={[styles.senderName, { color: colors.primary }]}>
                  {getDisplayName(message.sender)}
                  {message.sender.username ? ` @${message.sender.username}` : ''}
                </Text>
              )}

              {/* Attachments */}
              {message.attachments?.map((att, i) => (
                <View key={i}>{renderAttachment(att, isMine)}</View>
              ))}

              {/* Poll */}
              {message.poll && renderPoll(message)}

              {/* Content */}
              {message.content && !isCallMessage && (
                <Text
                  style={[
                    styles.messageText,
                    { color: isMine ? colors.messageBubbleSentText : colors.messageBubbleReceivedText },
                  ]}
                >
                  {message.content}
                </Text>
              )}

              {/* Meta info */}
              <View style={styles.messageMeta}>
                {message.isEdited && (
                  <Text style={[styles.editedLabel, { color: isMine ? 'rgba(255,255,255,0.6)' : colors.textMuted }]}>
                    edited
                  </Text>
                )}
                <Text
                  style={[
                    styles.messageTime,
                    { color: isMine ? 'rgba(255,255,255,0.6)' : colors.textMuted },
                  ]}
                >
                  {formatFullTime(message.createdAt)}
                </Text>
                {isMine && (
                  <Ionicons
                    name={message.isRead ? 'checkmark-done' : 'checkmark'}
                    size={14}
                    color={isMine ? 'rgba(255,255,255,0.6)' : colors.textMuted}
                    style={{ marginLeft: 2 }}
                  />
                )}
              </View>

              {/* Reactions */}
              {renderReactions(message)}
            </View>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <GestureDetector gesture={swipe}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 8) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerInfo}
          onPress={() => {
            if (chat?.isGroup) {
              navigation.navigate('GroupInfo', { chatId });
            } else if (otherUser) {
              navigation.navigate('UserProfile', { userId: otherUser.id, chatId });
            }
          }}
        >
          <View style={[styles.headerAvatarContainer, { backgroundColor: colors.primary }]}>
            {chatAvatar ? (
              <Image source={{ uri: chatAvatar }} style={styles.headerAvatar} />
            ) : chat?.isGroup ? (
              <View style={[styles.groupHeaderAvatarFallback, { backgroundColor: colors.primary }]}>
                <Ionicons name="people" size={18} color="#fff" />
              </View>
            ) : (
              <Text style={styles.headerAvatarText}>{getInitials(chatName)}</Text>
            )}
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={[styles.headerName, { color: colors.text }]} numberOfLines={1}>
              {chatName}
            </Text>
            <Text style={[styles.headerStatus, { color: colors.textMuted }]} numberOfLines={1}>
              {typingText || (chat?.isGroup
                ? `${chat.members.length} members`
                : statusText)}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerActionButton}
            onPress={() => {
              setShowCallsModal(true);
            }}
          >
            <Ionicons name="call" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerActionButton}
            onPress={() => {
              setShowCallsModal(true);
            }}
          >
            <Ionicons name="videocam" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerActionButton}
            onPress={openHeaderMenu}
          >
            <Ionicons name="ellipsis-vertical" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        keyboardVerticalOffset={0}
      >
        {searchVisible && (
          <View style={[styles.searchBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search messages..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={(value) => {
                setSearchQuery(value);
                setCurrentSearchIndex(0);
              }}
              autoFocus
            />
            <Text style={[styles.searchCount, { color: colors.textMuted }]}>
              {searchMatches.length ? `${currentSearchIndex + 1}/${searchMatches.length}` : '0/0'}
            </Text>
            <TouchableOpacity
              style={styles.searchNavButton}
              onPress={() => {
                if (!searchMatches.length) return;
                setCurrentSearchIndex((prev) => (prev === 0 ? searchMatches.length - 1 : prev - 1));
              }}
            >
              <Ionicons name="chevron-up" size={18} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.searchNavButton}
              onPress={() => {
                if (!searchMatches.length) return;
                setCurrentSearchIndex((prev) => (prev + 1) % searchMatches.length);
              }}
            >
              <Ionicons name="chevron-down" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}

        {messagesLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages || []}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={[styles.messagesList, { paddingBottom: 20 + keyboardHeight }]}
            style={[
              styles.messagesList,
              customBgUrl && chatBgId === 'custom-image'
                ? { backgroundColor: colors.background }
                : { backgroundColor: findBackground(chatBgId).style.backgroundColor || colors.background }
            ]}
            onScroll={(event) => {
              const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
              const distanceToBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
              isNearBottomRef.current = distanceToBottom < 48;
            }}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onContentSizeChange={() => {
              if (!initialMessageId) {
                flatListRef.current?.scrollToEnd({ animated: false });
              }
            }}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({
                  index: Math.max(0, Math.min(info.index, (messages?.length || 1) - 1)),
                  animated: true,
                });
              }, 100);
            }}
          />
        )}

        {latestPinned ? (
          <TouchableOpacity
            style={[styles.pinnedBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}
            onPress={() => navigation.navigate('PinnedMessages', { chatId })}
          >
            <Ionicons name="pin" size={15} color={colors.primary} />
            <Text style={[styles.pinnedBarText, { color: colors.text }]} numberOfLines={1}>
              Pinned: {latestPinned.content || (latestPinned.poll ? latestPinned.poll.question : 'Attachment')}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}

        {/* Typing indicator */}
        {typingText ? (
          <View style={[styles.typingIndicator, { backgroundColor: colors.surface }]}>
            <Text style={[styles.typingText, { color: colors.textMuted }]}>{typingText}</Text>
          </View>
        ) : null}

        {/* Edit indicator */}
        {editingMessage && (
          <View style={[styles.editBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <Ionicons name="pencil" size={16} color={colors.primary} />
            <Text style={[styles.editBarText, { color: colors.text }]} numberOfLines={1}>
              Editing: {editingMessage.content}
            </Text>
            <TouchableOpacity onPress={() => { setEditingMessage(null); setMessageText(''); }}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Input */}
        <View
          pointerEvents="box-none"
          style={[
            styles.inputContainer,
            {
              backgroundColor: colors.headerBackground,
              borderTopColor: colors.border,
              paddingBottom: Platform.OS === 'ios' ? 24 : 0,
              transform: Platform.OS === 'android' ? [{ translateY: -keyboardHeight }] : undefined,
            },
          ]}
        >
          <View pointerEvents="box-none" style={styles.inputRow}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text }]}
              value={messageText}
              onChangeText={(value) => {
                setMessageText(value);
                if (value.trim()) {
                  sendTyping();
                }
              }}
              placeholder="Message..."
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={4000}
            />

            {uploading ? (
              <ActivityIndicator color={colors.primary} style={styles.sendButton} />
            ) : (
              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: messageText.trim() ? colors.primary : colors.surfaceVariant }]}
                onPress={handleSend}
                disabled={!messageText.trim() && !editingMessage}
              >
                <Ionicons
                  name={editingMessage ? 'checkmark' : 'send'}
                  size={20}
                  color={messageText.trim() ? '#fff' : colors.textMuted}
                />
              </TouchableOpacity>
            )}
          </View>

          <View pointerEvents="box-none" style={styles.attachmentsRow}>
            {/* Image button */}
            <TouchableOpacity style={styles.attachButton} onPress={handlePickImage} disabled={uploading}>
              <Ionicons name="image" size={24} color={colors.primary} />
            </TouchableOpacity>

            {/* Sticker button */}
            <TouchableOpacity
              style={styles.attachButton}
              onPress={() => setShowStickerPicker(true)}
              disabled={uploading || isRecordingAudio}
            >
              <Ionicons name="happy-outline" size={24} color={colors.primary} />
            </TouchableOpacity>

            {/* Record button */}
            <TouchableOpacity style={styles.attachButton} onPress={handleRecordPress} disabled={uploading}>
              <Ionicons name={isRecordingAudio ? 'stop-circle-outline' : 'mic-outline'} size={24} color={isRecordingAudio ? colors.destructive : colors.primary} />
            </TouchableOpacity>

            {/* File button */}
            <TouchableOpacity style={styles.attachButton} onPress={handlePickDocument} disabled={uploading}>
              <Ionicons name="document" size={24} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showStickerPicker} transparent animationType="fade" onRequestClose={() => setShowStickerPicker(false)}>
        <Pressable
          style={[styles.stickerOverlay, { backgroundColor: colors.overlay }]}
          onPress={() => setShowStickerPicker(false)}
        >
          <Pressable style={[styles.stickerSheet, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={[styles.stickerHeader, { borderBottomColor: colors.border }]}> 
              <Text style={[styles.stickerTitle, { color: colors.text }]}>Stickers</Text>
              <TouchableOpacity onPress={() => setShowStickerPicker(false)}>
                <Ionicons name="close" size={22} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <View style={styles.stickerGrid}>
              {STICKERS.map((sticker, idx) => (
                <TouchableOpacity
                  key={`${sticker}-${idx}`}
                  style={[styles.stickerItem, { backgroundColor: colors.surfaceVariant }]}
                  onPress={() => handleStickerSelect(sticker)}
                >
                  <Text style={styles.stickerText}>{sticker}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Message Action Modal */}
      <Modal visible={!!selectedMessage} transparent animationType="fade">
        <TouchableOpacity
          style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
          activeOpacity={1}
          onPress={() => setSelectedMessage(null)}
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.card }]}>
            {/* Reaction bar */}
            <View style={styles.reactionBar}>
              {EMOJIS.map((emoji) => (
                <TouchableOpacity key={emoji} style={styles.reactionButton} onPress={() => handleReaction(emoji)}>
                  <Text style={styles.reactionButtonText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Actions */}
            {selectedMessage?.senderId === user?.id && (
              <TouchableOpacity style={styles.actionItem} onPress={handleEditMessage}>
                <Ionicons name="pencil" size={20} color={colors.text} />
                <Text style={[styles.actionText, { color: colors.text }]}>Edit</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                if (!selectedMessage) return;
                const isPinned = pinnedMessageIds.has(selectedMessage.id);
                if (isPinned) {
                  unpinMessage.mutate({ chatId, messageId: selectedMessage.id });
                } else {
                  pinMessage.mutate({ chatId, messageId: selectedMessage.id });
                }
                setSelectedMessage(null);
              }}
            >
              <Ionicons name={pinnedMessageIds.has(selectedMessage?.id || -1) ? 'pin' : 'pin-outline'} size={20} color={colors.text} />
              <Text style={[styles.actionText, { color: colors.text }]}>
                {pinnedMessageIds.has(selectedMessage?.id || -1) ? 'Unpin' : 'Pin'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                if (selectedMessage?.content) {
                  setStringAsync(selectedMessage.content || '');
                }
                setSelectedMessage(null);
              }}
            >
              <Ionicons name="copy" size={20} color={colors.text} />
              <Text style={[styles.actionText, { color: colors.text }]}>Copy</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => handleDeleteMessage(false)}
            >
              <Ionicons name="trash" size={20} color={colors.destructive} />
              <Text style={[styles.actionText, { color: colors.destructive }]}>Delete for me</Text>
            </TouchableOpacity>

            {selectedMessage?.senderId === user?.id && (
              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => handleDeleteMessage(true)}
              >
                <Ionicons name="trash" size={20} color={colors.destructive} />
                <Text style={[styles.actionText, { color: colors.destructive }]}>Delete for everyone</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.actionItem, styles.cancelAction]}
              onPress={() => setSelectedMessage(null)}
            >
              <Text style={[styles.actionText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Image Preview Modal */}
      <Modal visible={!!imagePreview} transparent animationType="fade">
        <View style={[styles.imagePreviewOverlay, { backgroundColor: 'rgba(0,0,0,0.95)' }]}>
          <TouchableOpacity
            style={styles.imagePreviewClose}
            onPress={() => setImagePreview(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {imagePreview && (
            <Image
              source={{ uri: imagePreview }}
              style={styles.imagePreviewImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* Calls disabled modal (Expo Go compatible path) */}
      <Modal visible={showCallsModal} transparent animationType="fade" onRequestClose={() => setShowCallsModal(false)}>
        <TouchableOpacity
          style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
          activeOpacity={1}
          onPress={() => setShowCallsModal(false)}
        >
          <View style={[styles.callsSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.callsSheetHeader}>
              <Ionicons name="call-outline" size={22} color={colors.primary} />
              <Text style={[styles.callsTitle, { color: colors.text }]}>Calls require a dev build</Text>
            </View>
            <Text style={[styles.callsText, { color: colors.textSecondary }]}>
              Audio/video calls use native WebRTC modules and won’t run inside Expo Go. This app build is chat-only.
            </Text>

            <TouchableOpacity
              style={[styles.callsPrimaryButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                setShowCallsModal(false);
                Linking.openURL('https://docs.expo.dev/develop/development-builds/introduction/');
              }}
            >
              <Text style={styles.callsPrimaryText}>How to enable calls</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.callsSecondaryButton, { borderColor: colors.border }]}
              onPress={() => setShowCallsModal(false)}
            >
              <Text style={[styles.callsSecondaryText, { color: colors.textMuted }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Header chat actions modal */}
      <Modal visible={showHeaderMenu} transparent animationType="fade" onRequestClose={() => setShowHeaderMenu(false)}>
        <Pressable
          style={[styles.headerMenuOverlay, { backgroundColor: colors.overlay }]}
          onPress={() => setShowHeaderMenu(false)}
        >
          <Pressable
            style={[styles.headerMenuCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {}}
          >
            <View style={styles.headerMenuTitleRow}>
              <Text style={[styles.headerMenuTitle, { color: colors.text }]}>Chat actions</Text>
              <Text style={[styles.headerMenuSubtitle, { color: colors.textMuted }]}>Choose an action</Text>
            </View>

            <View style={[styles.headerMenuDivider, { backgroundColor: colors.border }]} />

            {headerMenuActions.map((action) => (
              <TouchableOpacity
                key={action.key}
                style={styles.headerMenuItem}
                onPress={() => {
                  setShowHeaderMenu(false);
                  action.onPress();
                }}
              >
                <Ionicons
                  name={action.icon}
                  size={20}
                  color={action.destructive ? colors.destructive : colors.primary}
                />
                <Text
                  style={[
                    styles.headerMenuItemText,
                    { color: action.destructive ? colors.destructive : colors.text },
                  ]}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Attach menu modal */}
      <Modal visible={showAttachMenu} transparent animationType="fade" onRequestClose={() => setShowAttachMenu(false)}>
        <Pressable
          style={[styles.headerMenuOverlay, { backgroundColor: colors.overlay }]}
          onPress={() => setShowAttachMenu(false)}
        >
          <Pressable
            style={[styles.headerMenuCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {}}
          >
            <View style={styles.headerMenuTitleRow}>
              <Text style={[styles.headerMenuTitle, { color: colors.text }]}>Attach</Text>
              <Text style={[styles.headerMenuSubtitle, { color: colors.textMuted }]}>Choose file type</Text>
            </View>

            <View style={[styles.headerMenuDivider, { backgroundColor: colors.border }]} />

            {attachMenuActions.map((action) => (
              <TouchableOpacity
                key={action.key}
                style={styles.headerMenuItem}
                onPress={() => {
                  setShowAttachMenu(false);
                  action.onPress();
                }}
              >
                <Ionicons name={action.icon} size={20} color={colors.primary} />
                <Text style={[styles.headerMenuItemText, { color: colors.text }]}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Image Picker Modal with Indexing */}
      <Modal visible={showImagePicker} transparent animationType="fade">
        <Pressable
          style={[styles.imagePickerOverlay, { backgroundColor: colors.overlay }]}
          onPress={() => {
            setShowImagePicker(false);
            setSelectedImages([]);
            setImagePickerIndex(0);
          }}
        >
          <Pressable style={[styles.imagePickerContainer, { backgroundColor: colors.card }]} onPress={() => {}}>
            {/* Header */}
            <View style={[styles.imagePickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.imagePickerTitle, { color: colors.text }]}>
                Selected Images ({imagePickerIndex + 1} / {selectedImages.length})
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowImagePicker(false);
                  setSelectedImages([]);
                  setImagePickerIndex(0);
                }}
              >
                <Ionicons name="close" size={24} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {/* Image Display */}
            {selectedImages.length > 0 && (
              <View style={styles.imagePickerImageContainer}>
                <Image
                  source={{ uri: getFullUrl(selectedImages[imagePickerIndex].url) }}
                  style={styles.imagePickerImage}
                  resizeMode="contain"
                />
              </View>
            )}

            {/* Navigation and Action */}
            <View style={[styles.imagePickerFooter, { borderTopColor: colors.border }]}>
              <View style={styles.imagePickerNav}>
                {selectedImages.length > 1 && (
                  <>
                    <TouchableOpacity
                      onPress={() => setImagePickerIndex((imagePickerIndex - 1 + selectedImages.length) % selectedImages.length)}
                      style={styles.navButton}
                    >
                      <Ionicons name="chevron-back" size={24} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setImagePickerIndex((imagePickerIndex + 1) % selectedImages.length)}
                      style={styles.navButton}
                    >
                      <Ionicons name="chevron-forward" size={24} color={colors.primary} />
                    </TouchableOpacity>
                  </>
                )}
              </View>

              <View style={styles.imagePickerActions}>
                <TouchableOpacity
                  onPress={() => {
                    setShowImagePicker(false);
                    setSelectedImages([]);
                    setImagePickerIndex(0);
                  }}
                  style={[styles.imagePickerButton, { backgroundColor: colors.surfaceVariant }]}
                >
                  <Text style={[styles.imagePickerButtonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={confirmImageSelection}
                  style={[styles.imagePickerButton, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.imagePickerButtonText, { color: '#fff' }]}>Send All</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Fullscreen Video Player Modal */}
      <Modal visible={!!fullscreenVideoUrl} animationType="fade" presentationStyle="fullScreen">
        <View style={[styles.fullscreenVideoContainer, { backgroundColor: '#000' }]}>
          <TouchableOpacity
            style={styles.fullscreenVideoClose}
            onPress={() => setFullscreenVideoUrl(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          {fullscreenVideoUrl && (
            <Video
              ref={(ref) => {
                if (ref) fullscreenVideoRef.current = ref;
              }}
              source={{ uri: fullscreenVideoUrl }}
              style={styles.fullscreenVideo}
              useNativeControls={true}
              resizeMode={ResizeMode.CONTAIN}
              isLooping={false}
              onFullscreenUpdate={(event) => {
                if (event.fullscreenUpdate === 0) {
                  setFullscreenVideoUrl(null);
                }
              }}
            />
          )}
        </View>
      </Modal>

      {/* Background Picker Modal */}
      <BackgroundPickerModal
        visible={showBgPicker}
        onClose={() => setShowBgPicker(false)}
        currentBgId={chatBgId}
        customImageUrl={customBgUrl}
        onSelectBackground={handleSelectBackground}
        onCustomImage={handleCustomImage}
        onRemoveCustomImage={handleRemoveCustomImage}
        colors={colors}
      />
    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  backButton: { padding: 8 },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  headerAvatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerAvatar: { width: 40, height: 40, borderRadius: 20 },
  headerAvatarText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  groupHeaderAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextContainer: { marginLeft: 10, flex: 1 },
  headerName: { fontSize: 16, fontWeight: '600' },
  headerStatus: { fontSize: 12, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 4 },
  headerActionButton: { padding: 8 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchBar: {
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 4,
  },
  searchCount: {
    fontSize: 12,
    minWidth: 40,
    textAlign: 'right',
  },
  searchNavButton: { padding: 2 },
  messagesList: { paddingHorizontal: 12, paddingVertical: 8 },
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dateLine: { flex: 1, height: 1 },
  dateText: { paddingHorizontal: 12, fontSize: 12 },
  systemMessage: { alignItems: 'center', marginVertical: 8 },
  systemMessageText: { fontSize: 13, fontStyle: 'italic' },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 4,
    alignItems: 'flex-end',
  },
  messageRowMine: { justifyContent: 'flex-end' },
  senderAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    overflow: 'hidden',
  },
  senderAvatarImage: { width: 28, height: 28, borderRadius: 14 },
  senderAvatarText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  senderName: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  messageBubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 2,
  },
  messageBubbleMine: { borderBottomRightRadius: 4 },
  messageBubbleOther: { borderBottomLeftRadius: 4 },
  messageText: { fontSize: 15, lineHeight: 20 },
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  editedLabel: { fontSize: 11, fontStyle: 'italic' },
  messageTime: { fontSize: 11 },
  attachmentImage: {
    width: 220,
    height: 180,
    borderRadius: 10,
    marginBottom: 4,
  },
  videoAttachmentWrap: {
    width: 240,
    marginBottom: 6,
  },
  attachmentVideo: {
    width: 240,
    height: 180,
    borderRadius: 10,
    backgroundColor: '#000',
  },
  videoProgressWrap: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  videoProgressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 3,
    backgroundColor: 'rgba(148,163,184,0.35)',
    overflow: 'hidden',
  },
  videoProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#60a5fa',
  },
  videoTimeText: {
    minWidth: 34,
    fontSize: 11,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  videoFullscreenButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoReplayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 10,
  },
  videoReplayButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(96,165,250,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenVideoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  fullscreenVideo: {
    flex: 1,
    width: '100%',
  },
  fullscreenVideoClose: {
    position: 'absolute',
    top: 40,
    right: 18,
    zIndex: 10,
    padding: 8,
  },
  fileAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    marginBottom: 4,
  },
  fileName: { fontSize: 14, flex: 1 },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
    minWidth: 230,
    maxWidth: 280,
  },
  fileCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  fileCardMeta: {
    flex: 1,
    minWidth: 0,
  },
  fileCardName: {
    fontSize: 16,
    fontWeight: '600',
  },
  fileCardType: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '500',
  },
  fileCardDownload: {
    marginLeft: 8,
    padding: 4,
  },
  audioPlayerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 4,
    minWidth: 220,
    maxWidth: 280,
  },
  audioPlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioMiddle: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  audioWaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 26,
  },
  audioWaveBar: {
    width: 3,
    borderRadius: 3,
  },
  audioBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  audioBottomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  audioTimeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  audioRateText: {
    fontSize: 12,
    fontWeight: '700',
  },
  audioDownloadButton: {
    padding: 4,
  },
  reactionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  reactionBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 12, marginLeft: 2 },
  pollContainer: { borderRadius: 12, padding: 12, marginBottom: 4 },
  pollQuestion: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  pollOption: {
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
  },
  pollOptionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  pollOptionText: { fontSize: 14, flex: 1 },
  pollVoteCount: { fontSize: 12 },
  pollBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  pollBarFill: { height: '100%', borderRadius: 2 },
  pollTotal: { fontSize: 12, marginTop: 6, textAlign: 'center' },
  pollVoteButton: {
    marginTop: 10,
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  pollVoteButtonText: { fontSize: 13, fontWeight: '700' },

  typingIndicator: { paddingHorizontal: 16, paddingVertical: 4 },
  typingText: { fontSize: 12, fontStyle: 'italic' },
  pinnedBar: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pinnedBarText: { flex: 1, fontSize: 13, fontWeight: '500' },

  editBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  editBarText: { flex: 1, fontSize: 13 },

  inputContainer: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: '100%',
  },
  attachmentsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 0,
  },
  attachButton: { paddingVertical: 4, paddingHorizontal: 8 },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 100,
    marginHorizontal: 4,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  actionSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 32,
  },
  callsSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 24,
    borderWidth: 1,
  },
  callsSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  callsTitle: { fontSize: 16, fontWeight: '800' },
  callsText: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
  callsPrimaryButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callsPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  callsSecondaryButton: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callsSecondaryText: { fontSize: 14, fontWeight: '800' },
  headerMenuOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  headerMenuCard: {
    width: '100%',
    borderRadius: 16,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderWidth: 1,
  },
  headerMenuTitleRow: {
    gap: 2,
    marginBottom: 8,
  },
  headerMenuTitle: { fontSize: 23, fontWeight: '700' },
  headerMenuSubtitle: { fontSize: 15, fontWeight: '500' },
  headerMenuDivider: { height: 1, marginVertical: 8 },
  headerMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  headerMenuItemText: {
    fontSize: 16,
    fontWeight: '600',
  },
  reactionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    marginBottom: 8,
  },
  reactionButton: { padding: 8 },
  reactionButtonText: { fontSize: 24 },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  actionText: { fontSize: 16 },
  cancelAction: {
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    marginTop: 8,
  },

  imagePreviewOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  imagePreviewClose: { position: 'absolute', top: 50, right: 16, zIndex: 10 },
  imagePreviewImage: { width: '100%', height: '80%' },

  stickerOverlay: { flex: 1, justifyContent: 'flex-end' },
  stickerSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    paddingBottom: 14,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  stickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingBottom: 8,
    marginBottom: 10,
  },
  stickerTitle: { fontSize: 16, fontWeight: '700' },
  stickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  stickerItem: {
    width: '15.5%',
    aspectRatio: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerText: { fontSize: 24 },

  imagePickerOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  imagePickerContainer: { borderRadius: 16, width: '85%', maxHeight: '80%', overflow: 'hidden' },
  imagePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  imagePickerTitle: { fontSize: 16, fontWeight: '600' },
  imagePickerImageContainer: { height: 300, justifyContent: 'center', alignItems: 'center' },
  imagePickerImage: { width: '100%', height: '100%' },
  imagePickerFooter: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  imagePickerNav: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 12 },
  navButton: { padding: 8 },
  imagePickerActions: { flexDirection: 'row', gap: 8 },
  imagePickerButton: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  imagePickerButtonText: { fontSize: 14, fontWeight: '600' },
});
