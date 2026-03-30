import React, { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CHAT_BACKGROUNDS, type ChatBackground } from '../lib/chat-backgrounds';
import { apiRequest, getFullUrl } from '../api';

interface BackgroundPickerModalProps {
  visible: boolean;
  onClose: () => void;
  currentBgId: string;
  customImageUrl: string | null;
  onSelectBackground: (bgId: string) => void;
  onCustomImage: (url: string) => void;
  onRemoveCustomImage: () => void;
  colors: any;
}

export function BackgroundPickerModal({
  visible,
  onClose,
  currentBgId,
  customImageUrl,
  onSelectBackground,
  onCustomImage,
  onRemoveCustomImage,
  colors,
}: BackgroundPickerModalProps) {
  const [uploading, setUploading] = useState(false);

  const handleUploadImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      setUploading(true);
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        type: asset.mimeType || 'image/jpeg',
        name: asset.fileName || `image-${Date.now()}.jpg`,
      } as any);

      const response = await apiRequest('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (response && typeof response === 'object' && 'url' in response) {
        onCustomImage(getFullUrl(response.url));
        onClose();
      }
    } catch (error) {
      console.error('Background upload failed:', error);
      Alert.alert('Upload Failed', 'Could not upload background image');
    } finally {
      setUploading(false);
    }
  };

  const isCustomSelected = currentBgId === 'custom-image' && customImageUrl;

  const renderBackgroundItem = ({ item }: { item: ChatBackground }) => {
    const isSelected = currentBgId === item.id && !customImageUrl;
    const bgColor = item.style.backgroundColor || '#000';

    return (
      <TouchableOpacity
        style={[
          styles.bgItem,
          {
            backgroundColor: bgColor,
            borderColor: isSelected ? colors.primary : colors.border,
            borderWidth: isSelected ? 3 : 1,
          },
        ]}
        onPress={() => {
          onSelectBackground(item.id);
          onClose();
        }}
      >
        {isSelected && (
          <View style={styles.checkmark}>
            <Ionicons name="checkmark" size={20} color="#fff" />
          </View>
        )}
        <Text style={[styles.bgLabel, { color: getTextColor(bgColor) }]}>
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderCustomImage = () => {
    if (!customImageUrl) {
      return (
        <TouchableOpacity
          style={[
            styles.bgItem,
            {
              backgroundColor: colors.surfaceVariant,
              borderColor: colors.border,
              borderWidth: 2,
              borderStyle: 'dashed',
            },
          ]}
          onPress={handleUploadImage}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color={colors.primary} size="large" />
          ) : (
            <View style={styles.uploadContent}>
              <Ionicons name="image" size={32} color={colors.primary} />
              <Text style={[styles.bgLabel, { color: colors.primary }]}>
                Your Image
              </Text>
            </View>
          )}
        </TouchableOpacity>
      );
    }

    return (
      <View style={styles.customImageWrapper}>
        <TouchableOpacity
          style={{
            flex: 1,
            borderColor: isCustomSelected ? colors.primary : colors.border,
            borderWidth: isCustomSelected ? 3 : 1,
            borderRadius: 12,
            overflow: 'hidden',
          }}
          onPress={() => {
            onSelectBackground('custom-image');
            onClose();
          }}
        >
          <Image
            source={{ uri: customImageUrl }}
            style={styles.customImage}
          />
          {isCustomSelected && (
            <View style={styles.checkmark}>
              <Ionicons name="checkmark" size={20} color="#fff" />
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.removeButton, { backgroundColor: colors.destructive }]}
          onPress={onRemoveCustomImage}
        >
          <Ionicons name="close" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.overlay, { backgroundColor: colors.overlay }]}
        onPress={onClose}
      >
        <Pressable
          style={[styles.container, { backgroundColor: colors.card }]}
          onPress={() => {}}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Chat Background</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Grid of backgrounds */}
          <FlatList
            data={CHAT_BACKGROUNDS}
            renderItem={renderBackgroundItem}
            keyExtractor={(bg) => bg.id}
            numColumns={3}
            scrollEnabled={true}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={() => renderCustomImage()}
            ListHeaderComponentStyle={styles.customImageSection}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function getTextColor(bgColor: any): string {
  // Handle different color types
  if (!bgColor || typeof bgColor !== 'string') return '#fff';
  
  // Simple luminance calculation
  const hex = bgColor.replace('#', '');
  if (hex.length !== 6) return '#fff';
  
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance > 128 ? '#000' : '#fff';
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 8,
  },
  customImageSection: {
    paddingBottom: 16,
  },
  bgItem: {
    flex: 1,
    aspectRatio: 1,
    margin: 8,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  bgLabel: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  uploadContent: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  customImageWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 8,
    marginBottom: 16,
  },
  customImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  removeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(96, 165, 250, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
