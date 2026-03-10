import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Button } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { supabase } from '../../services/supabase';

export const EditProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, profile, refreshProfile } = useAuth();
  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [language, setLanguage] = useState(profile?.language || 'English');
  const [saving, setSaving] = useState(false);

  const saveProfile = async () => {
    if (!user) return;

    if (firstName.trim().length < 2) {
      Alert.alert('Invalid name', 'First name should have at least 2 characters.');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: firstName.trim(),
        display_name: displayName.trim() || firstName.trim(),
        language: language.trim() || 'English',
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    setSaving(false);

    if (error) {
      Alert.alert('Save failed', error.message || 'Unable to update profile right now.');
      return;
    }

    await refreshProfile();
    Alert.alert('Saved', 'Profile updated successfully.');
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Button title="Back" variant="ghost" fullWidth={false} onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Edit Profile</Text>
        <View style={{ width: 56 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>First name</Text>
        <TextInput
          style={styles.input}
          value={firstName}
          onChangeText={setFirstName}
          placeholder="First name"
          placeholderTextColor={Colors.text.tertiary}
        />

        <Text style={styles.label}>Display name</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Display name"
          placeholderTextColor={Colors.text.tertiary}
        />

        <Text style={styles.label}>Preferred language</Text>
        <TextInput
          style={styles.input}
          value={language}
          onChangeText={setLanguage}
          placeholder="English"
          placeholderTextColor={Colors.text.tertiary}
        />

        <Button title="Save changes" onPress={saveProfile} loading={saving} size="lg" style={styles.saveBtn} />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  title: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  label: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    marginTop: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    ...Typography.body,
    color: Colors.text.primary,
  },
  saveBtn: {
    marginTop: Spacing.lg,
  },
});
