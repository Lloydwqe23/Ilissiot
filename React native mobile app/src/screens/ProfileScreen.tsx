import React, { useEffect, useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../hooks/useAuth';
import { useUpdateProfile } from '../hooks/useUsers';
import { useBlockedUsers, useUnblockUser } from '../hooks/useChats';
import { getThemeColors, getColorThemeAccent } from '../theme';
import { getDisplayName, getInitials } from '../utils/helpers';
import { apiRequest, getFullUrl } from '../api';
import { THEMES, COLOR_THEMES, FONT_TYPES, TEXT_SIZES } from '../config';
import type { User } from '../types';

type Props = { navigation: any };

const APPEARANCE_PREVIEW: Record<string, { swatch: string; card: string }> = {
  light: { swatch: '#d5dbe3', card: '#f0f3f6' },
  dark: { swatch: '#0b1530', card: '#121c38' },
  greenish: { swatch: '#8fe2bf', card: '#e6f6ef' },
  yellowish: { swatch: '#f1e395', card: '#f8f4df' },
  blueish: { swatch: '#9fcee9', card: '#e6f2fb' },
  purpleish: { swatch: '#cdc2eb', card: '#f0ebf8' },
  pinkish: { swatch: '#ecc2d9', card: '#f9edf3' },
  orangeish: { swatch: '#f4d895', card: '#fcf3df' },
};

const APPEARANCE_LABEL: Record<string, string> = {
  light: 'Light',
  dark: 'Dark',
  greenish: 'Greenish',
  yellowish: 'Yellowish',
  blueish: 'Blueish',
  purpleish: 'Purpleish',
  pinkish: 'Pinkish',
  orangeish: 'Orangeish',
};

const COLOR_THEME_LABEL: Record<string, string> = {
  blue: 'Blue',
  green: 'Green',
  red: 'Red',
  gold: 'Gold',
  purple: 'Purple',
  pink: 'Pink',
  teal: 'Teal',
  orange: 'Orange',
  indigo: 'Indigo',
};

const FONT_TYPE_LABEL: Record<string, string> = {
  inter: 'Inter',
  poppins: 'Poppins',
  lora: 'Lora',
  jetbrains: 'JetBrains Mono',
  nunito: 'Nunito',
  merriweather: 'Merriweather',
  manrope: 'Manrope',
  playfair: 'Playfair',
};

const FONT_TYPE_PREVIEW: Record<string, string> = {
  inter: 'Inter, sans-serif',
  poppins: 'Poppins, sans-serif',
  lora: 'Lora, serif',
  jetbrains: 'monospace',
  nunito: 'Nunito, sans-serif',
  merriweather: 'Merriweather, serif',
  manrope: 'Manrope, sans-serif',
  playfair: 'serif',
};

const TEXT_SIZE_LABEL: Record<string, string> = {
  small: 'Small',
  normal: 'Normal',
  large: 'Large',
};

const TEXT_SIZE_SAMPLE: Record<string, number> = {
  small: 13,
  normal: 16,
  large: 19,
};

const DESIGN_UI = {
  panelBg: '#f5f7fb',
  cardBg: '#f7f9fc',
  cardBorder: '#d8dee8',
  selectedBorder: '#38bdf8',
  selectedBg: '#eef6ff',
  title: '#1f2937',
  text: '#111827',
  muted: '#64748b',
};

export function ProfileScreen({ navigation }: Props) {
  const { user, logout, isLoggingOut } = useAuth();
  const updateProfile = useUpdateProfile();
  const { data: blockedUsers } = useBlockedUsers();
  const unblockUser = useUnblockUser();
  const colors = getThemeColors(user?.theme, user?.colorTheme);
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<'general' | 'design' | 'blocked'>('general');
  const [username, setUsername] = useState(user?.username || '');
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [birthday, setBirthday] = useState(user?.birthday || '');
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState(user?.theme || 'light');
  const [selectedColorTheme, setSelectedColorTheme] = useState(user?.colorTheme || 'blue');
  const [selectedFontType, setSelectedFontType] = useState(user?.fontType || 'inter');
  const [selectedTextSize, setSelectedTextSize] = useState(user?.textSize || 'normal');

  useEffect(() => {
    setSelectedTheme(user?.theme || 'light');
    setSelectedColorTheme(user?.colorTheme || 'blue');
    setSelectedFontType(user?.fontType || 'inter');
    setSelectedTextSize(user?.textSize || 'normal');
  }, [user?.theme, user?.colorTheme, user?.fontType, user?.textSize]);

  // Tab switching is handled by TouchableOpacity buttons below

  const handleSaveProfile = () => {
    const normalizedUsername = username.trim().toLowerCase();
    if (normalizedUsername && !/^[a-z0-9_]{3,32}$/.test(normalizedUsername)) {
      Alert.alert('Invalid Username', 'Username must be 3-32 chars: a-z, 0-9, _');
      return;
    }

    updateProfile.mutate({
      username: normalizedUsername || undefined,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      bio: bio || null,
      birthday: birthday || null,
    });
  };

  const handlePickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      legacy: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', {
          uri: result.assets[0].uri,
          name: 'avatar.jpg',
          type: 'image/jpeg',
        } as any);

        const response = await apiRequest<{ url: string }>('/api/upload', {
          method: 'POST',
          body: formData,
          isFormData: true,
        });

        updateProfile.mutate({ profileImageUrl: response.url });
      } catch (err) {
        Alert.alert('Upload Failed', 'Could not upload the image.');
      } finally {
        setUploading(false);
      }
    }
  };

  const handleSaveDesign = () => {
    updateProfile.mutate({
      theme: selectedTheme,
      colorTheme: selectedColorTheme,
      fontType: selectedFontType,
      textSize: selectedTextSize,
    } as any);
  };

  const avatarUrl = user?.profileImageUrl ? getFullUrl(user.profileImageUrl) : null;
  const designDirty =
    selectedTheme !== (user?.theme || 'light') ||
    selectedColorTheme !== (user?.colorTheme || 'blue') ||
    selectedFontType !== (user?.fontType || 'inter') ||
    selectedTextSize !== (user?.textSize || 'normal');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 8) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <TouchableOpacity
          onPress={() => {
            Alert.alert('Logout', 'Are you sure you want to logout?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Logout', style: 'destructive', onPress: () => logout() },
            ]);
          }}
        >
          {isLoggingOut ? (
            <ActivityIndicator size="small" color={colors.destructive} />
          ) : (
            <Ionicons name="log-out-outline" size={24} color={colors.destructive} />
          )}
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[styles.tabContainer, { backgroundColor: colors.surface }]}>
        {(['general', 'design', 'blocked'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && { color: '#fff' }]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {activeTab === 'general' && (
          <>
            {/* Avatar */}
            <View style={styles.avatarSection}>
              <TouchableOpacity onPress={handlePickAvatar} style={styles.avatarButton}>
                <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                  {uploading ? (
                    <ActivityIndicator color="#fff" />
                  ) : avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarText}>
                      {getInitials(getDisplayName(user || {} as User))}
                    </Text>
                  )}
                </View>
                <View style={[styles.cameraIcon, { backgroundColor: colors.primary }]}>
                  <Ionicons name="camera" size={14} color="#fff" />
                </View>
              </TouchableOpacity>
              <Text style={[styles.displayName, { color: colors.text }]}>
                {getDisplayName(user || {} as User)}
              </Text>
              {user?.username && (
                <Text style={[styles.usernameDisplay, { color: colors.textMuted }]}>@{user.username}</Text>
              )}
            </View>

            {/* Fields */}
            <View style={styles.fields}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Username</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                value={username}
                onChangeText={setUsername}
                placeholder="username"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
              />

              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>First Name</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="First name"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Last Name</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Last name"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>

              <Text style={[styles.label, { color: colors.textSecondary }]}>Bio</Text>
              <TextInput
                style={[styles.input, styles.bioInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell about yourself..."
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={200}
              />

              <Text style={[styles.label, { color: colors.textSecondary }]}>Birthday</Text>
              <TouchableOpacity
                style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                onPress={() => setShowBirthdayPicker(true)}
              >
                <Text style={{ color: colors.text }}>
                  {birthday ? birthday : 'Select birthday'}
                </Text>
              </TouchableOpacity>
              {showBirthdayPicker && (
                <DateTimePicker
                  value={birthday ? new Date(birthday) : new Date()}
                  mode="date"
                  display="calendar"
                  onChange={(event, selectedDate) => {
                    setShowBirthdayPicker(false);

                    if (event.type === 'set' && selectedDate) {
                      const yyyy = selectedDate.getFullYear();
                      const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
                      const dd = String(selectedDate.getDate()).padStart(2, '0');
                      setBirthday(`${yyyy}-${mm}-${dd}`);
                    }
                  }}
                />
              )}

              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: colors.primary }]}
                onPress={handleSaveProfile}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {activeTab === 'design' && (
          <View style={[styles.designPanel, { backgroundColor: DESIGN_UI.panelBg }]}> 
            <Text style={[styles.sectionTitle, { color: DESIGN_UI.title }]}>Appearance Mode</Text>
            <View style={styles.designCardGrid}>
              {THEMES.map((theme) => {
                const selected = selectedTheme === theme;
                const preview = APPEARANCE_PREVIEW[theme] || APPEARANCE_PREVIEW.light;

                return (
                  <TouchableOpacity
                    key={theme}
                    style={[
                      styles.designCard,
                      {
                        backgroundColor: selected ? DESIGN_UI.selectedBg : DESIGN_UI.cardBg,
                        borderColor: selected ? DESIGN_UI.selectedBorder : DESIGN_UI.cardBorder,
                        borderWidth: selected ? 2 : 1,
                      },
                    ]}
                    onPress={() => setSelectedTheme(theme)}
                    activeOpacity={0.85}
                  >
                    <View
                      style={[
                        styles.designSwatch,
                        {
                          backgroundColor: preview.swatch,
                          borderColor: selected ? DESIGN_UI.selectedBorder : DESIGN_UI.cardBorder,
                        },
                      ]}
                    />
                    <Text style={[styles.designCardLabel, { color: DESIGN_UI.text }]}>
                      {APPEARANCE_LABEL[theme] || theme}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.sectionTitle, { color: DESIGN_UI.title, marginTop: 24 }]}>Color Theme</Text>
            <View style={styles.designCardGrid}>
              {COLOR_THEMES.map((ct) => {
                const selected = selectedColorTheme === ct;
                return (
                  <TouchableOpacity
                    key={ct}
                    style={[
                      styles.designCard,
                      {
                        backgroundColor: selected ? DESIGN_UI.selectedBg : DESIGN_UI.cardBg,
                        borderColor: selected ? DESIGN_UI.selectedBorder : DESIGN_UI.cardBorder,
                        borderWidth: selected ? 2 : 1,
                      },
                    ]}
                    onPress={() => setSelectedColorTheme(ct)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.designSwatch, { backgroundColor: getColorThemeAccent(ct), borderColor: 'transparent' }]} />
                    <Text style={[styles.designCardLabel, { color: DESIGN_UI.text }]}>
                      {COLOR_THEME_LABEL[ct] || ct}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.sectionTitle, { color: DESIGN_UI.title, marginTop: 24 }]}>Font Type</Text>
            <View style={styles.designWideGrid}>
              {FONT_TYPES.map((fontType) => {
                const selected = selectedFontType === fontType;
                return (
                  <TouchableOpacity
                    key={fontType}
                    style={[
                      styles.designWideCard,
                      {
                        backgroundColor: selected ? DESIGN_UI.selectedBg : DESIGN_UI.cardBg,
                        borderColor: selected ? DESIGN_UI.selectedBorder : DESIGN_UI.cardBorder,
                        borderWidth: selected ? 2 : 1,
                      },
                    ]}
                    onPress={() => setSelectedFontType(fontType)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.designWideLabel, { color: DESIGN_UI.muted }]}>
                      {FONT_TYPE_LABEL[fontType] || fontType}
                    </Text>
                    <Text
                      style={[
                        styles.designWidePreview,
                        { color: DESIGN_UI.text, fontFamily: FONT_TYPE_PREVIEW[fontType] },
                      ]}
                    >
                      The quick brown fox
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.sectionTitle, { color: DESIGN_UI.title, marginTop: 24 }]}>Text Size</Text>
            <View style={styles.textSizeGrid}>
              {TEXT_SIZES.map((textSize) => {
                const selected = selectedTextSize === textSize;
                return (
                  <TouchableOpacity
                    key={textSize}
                    style={[
                      styles.textSizeCard,
                      {
                        backgroundColor: selected ? DESIGN_UI.selectedBg : DESIGN_UI.cardBg,
                        borderColor: selected ? DESIGN_UI.selectedBorder : DESIGN_UI.cardBorder,
                        borderWidth: selected ? 2 : 1,
                      },
                    ]}
                    onPress={() => setSelectedTextSize(textSize)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.textSizeLabel, { color: DESIGN_UI.muted }]}>
                      {TEXT_SIZE_LABEL[textSize] || textSize}
                    </Text>
                    <Text style={[styles.textSizePreview, { color: DESIGN_UI.text, fontSize: TEXT_SIZE_SAMPLE[textSize] }]}>Aa</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.designActionsRow}>
              <TouchableOpacity
                style={[styles.designCancelButton, { borderColor: DESIGN_UI.cardBorder }]}
                onPress={() => {
                  setSelectedTheme(user?.theme || 'light');
                  setSelectedColorTheme(user?.colorTheme || 'blue');
                  setSelectedFontType(user?.fontType || 'inter');
                  setSelectedTextSize(user?.textSize || 'normal');
                }}
              >
                <Text style={[styles.designCancelText, { color: DESIGN_UI.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.designSaveButton,
                  { backgroundColor: '#38bdf8', opacity: designDirty && !updateProfile.isPending ? 1 : 0.6 },
                ]}
                onPress={handleSaveDesign}
                disabled={!designDirty || updateProfile.isPending}
              >
                {updateProfile.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.designSaveButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {activeTab === 'blocked' && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Blocked Users</Text>
            {(!blockedUsers || blockedUsers.length === 0) ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No blocked users
              </Text>
            ) : (
              blockedUsers.map((blockedUser) => (
                <View key={blockedUser.id} style={[styles.blockedItem, { borderBottomColor: colors.border }]}>
                  <View style={[styles.blockedAvatar, { backgroundColor: colors.primary }]}>
                    {blockedUser.profileImageUrl ? (
                      <Image source={{ uri: getFullUrl(blockedUser.profileImageUrl) }} style={styles.blockedAvatarImage} />
                    ) : (
                      <Text style={styles.blockedAvatarText}>{getInitials(getDisplayName(blockedUser))}</Text>
                    )}
                  </View>
                  <View style={styles.blockedInfo}>
                    <Text style={[styles.blockedName, { color: colors.text }]}>{getDisplayName(blockedUser)}</Text>
                    {blockedUser.username && (
                      <Text style={[styles.blockedUsername, { color: colors.textMuted }]}>@{blockedUser.username}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[styles.unblockButton, { borderColor: colors.destructive }]}
                    onPress={() => unblockUser.mutate(blockedUser.id)}
                  >
                    <Text style={[styles.unblockText, { color: colors.destructive }]}>Unblock</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  backButton: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600' },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 10,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  content: { flex: 1 },
  contentContainer: { padding: 16 },
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatarButton: { position: 'relative' },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: 88, height: 88, borderRadius: 44 },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '600' },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  displayName: { fontSize: 20, fontWeight: '600', marginTop: 12 },
  usernameDisplay: { fontSize: 14, marginTop: 2 },
  fields: { gap: 4 },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 4, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  bioInput: { height: 80, textAlignVertical: 'top' },
  saveButton: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  designPanel: {
    borderRadius: 14,
    padding: 14,
  },
  designCardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  designCard: {
    width: '31.5%',
    borderRadius: 12,
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  designSwatch: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  designCardLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  designWideGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  designWideCard: {
    width: '48.5%',
    borderRadius: 12,
    minHeight: 76,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  designWideLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  designWidePreview: {
    fontSize: 14,
    fontWeight: '500',
  },
  textSizeGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  textSizeCard: {
    width: '31.5%',
    borderRadius: 12,
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  textSizeLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  textSizePreview: {
    fontWeight: '600',
  },
  designActionsRow: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    alignItems: 'center',
  },
  designCancelButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  designCancelText: {
    fontSize: 15,
    fontWeight: '500',
  },
  designSaveButton: {
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  designSaveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: { textAlign: 'center', marginTop: 32, fontSize: 14 },
  blockedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  blockedAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  blockedAvatarImage: { width: 40, height: 40, borderRadius: 20 },
  blockedAvatarText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  blockedInfo: { flex: 1 },
  blockedName: { fontSize: 15, fontWeight: '500' },
  blockedUsername: { fontSize: 12 },
  unblockButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  unblockText: { fontSize: 13, fontWeight: '600' },
});
