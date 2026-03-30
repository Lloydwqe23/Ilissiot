import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ThemeColors } from '../theme';

type Props = {
  colors: ThemeColors;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  style?: ViewStyle;
};

export function ScreenHeader({ colors, title, subtitle, onBack, right, style }: Props) {
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.headerBackground }, style]}>
      <View style={[styles.row, { borderBottomColor: colors.border }]}>
        <View style={styles.left}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} style={styles.backButton} hitSlop={10}>
              <Ionicons name="arrow-back" size={22} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.backSpacer} />
          )}
        </View>

        <View style={styles.center}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.right}>{right || <View style={styles.backSpacer} />}</View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  left: { width: 44, alignItems: 'flex-start' },
  center: { flex: 1 },
  right: { width: 44, alignItems: 'flex-end' },
  backButton: { padding: 6 },
  backSpacer: { width: 32, height: 32 },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
});


