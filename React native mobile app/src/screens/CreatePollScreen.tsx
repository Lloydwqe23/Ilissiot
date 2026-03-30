import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { useCreatePoll } from '../hooks/useChats';
import { getThemeColors } from '../theme';

type Props = {
  navigation: any;
  route: { params: { chatId: number } };
};

export function CreatePollScreen({ navigation, route }: Props) {
  const { chatId } = route.params;
  const { user } = useAuth();
  const createPoll = useCreatePoll();
  const colors = getThemeColors(user?.theme, user?.colorTheme);
  const insets = useSafeAreaInsets();

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);

  const addOption = () => {
    if (options.length >= 10) return;
    setOptions([...options, '']);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== index));
  };

  const updateOption = (index: number, text: string) => {
    const newOptions = [...options];
    newOptions[index] = text;
    setOptions(newOptions);
  };

  const handleCreate = async () => {
    const trimmedQuestion = question.trim();
    const validOptions = options.map((o) => o.trim()).filter(Boolean);

    if (!trimmedQuestion) {
      Alert.alert('Error', 'Please enter a question');
      return;
    }
    if (validOptions.length < 2) {
      Alert.alert('Error', 'Please add at least 2 options');
      return;
    }

    try {
      await createPoll.mutateAsync({
        chatId,
        question: trimmedQuestion,
        options: validOptions,
        allowMultipleAnswers: allowMultiple,
        isAnonymous,
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', 'Failed to create poll');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 8) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Create Poll</Text>
        <TouchableOpacity onPress={handleCreate}>
          <Text style={[styles.createButton, { color: colors.primary }]}>Create</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Question</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
          value={question}
          onChangeText={setQuestion}
          placeholder="Ask a question..."
          placeholderTextColor={colors.textMuted}
          multiline
        />

        <Text style={[styles.label, { color: colors.textSecondary }]}>Options</Text>
        {options.map((option, index) => (
          <View key={index} style={styles.optionRow}>
            <TextInput
              style={[styles.optionInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
              value={option}
              onChangeText={(text) => updateOption(index, text)}
              placeholder={`Option ${index + 1}`}
              placeholderTextColor={colors.textMuted}
            />
            {options.length > 2 && (
              <TouchableOpacity onPress={() => removeOption(index)} style={styles.removeOption}>
                <Ionicons name="close-circle" size={22} color={colors.destructive} />
              </TouchableOpacity>
            )}
          </View>
        ))}

        {options.length < 10 && (
          <TouchableOpacity style={[styles.addOption, { borderColor: colors.primary }]} onPress={addOption}>
            <Ionicons name="add" size={20} color={colors.primary} />
            <Text style={[styles.addOptionText, { color: colors.primary }]}>Add Option</Text>
          </TouchableOpacity>
        )}

        <View style={[styles.switchRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.switchLabel, { color: colors.text }]}>Allow multiple answers</Text>
          <Switch
            value={allowMultiple}
            onValueChange={setAllowMultiple}
            trackColor={{ true: colors.primary }}
          />
        </View>

        <View style={[styles.switchRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.switchLabel, { color: colors.text }]}>Anonymous voting</Text>
          <Switch
            value={isAnonymous}
            onValueChange={setIsAnonymous}
            trackColor={{ true: colors.primary }}
          />
        </View>
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
  createButton: { fontSize: 16, fontWeight: '600' },
  content: { flex: 1 },
  contentContainer: { padding: 16 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  optionInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  removeOption: { padding: 4 },
  addOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
    marginTop: 4,
  },
  addOptionText: { fontSize: 14, fontWeight: '500' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    marginTop: 12,
  },
  switchLabel: { fontSize: 15 },
});
