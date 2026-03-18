import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Button, Card, Avatar, CoveModal } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { supabase } from '../../services/supabase';
import { pickAvatarImage, uploadAvatarForUser } from '../../core/services/avatarService';
import { CoveModalAction, CoveModalVariant } from '../../core/models/types';
import { navigateBackSafe } from '../../navigation/safeBack';

export const EditProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, profile, refreshProfile } = useAuth();
  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [language, setLanguage] = useState(profile?.language || 'English');
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
  const [modalState, setModalState] = useState<{
    visible: boolean;
    variant: CoveModalVariant;
    title: string;
    message: string;
    primaryAction?: CoveModalAction | null;
  }>({
    visible: false,
    variant: 'info',
    title: '',
    message: '',
    primaryAction: null,
  });

  const showModal = (variant: CoveModalVariant, title: string, message: string) => {
    setModalState({
      visible: true,
      variant,
      title,
      message,
      primaryAction: {
        label: 'Okay',
        onPress: () => setModalState((prev) => ({ ...prev, visible: false })),
      },
    });
  };

  const saveProfile = async () => {
    if (!user) return;

    if (firstName.trim().length < 2) {
      showModal('blocking', 'Invalid name', 'First name should have at least 2 characters.');
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
      showModal('error', 'Save failed', error.message || 'Unable to update profile right now.');
      return;
    }

    await refreshProfile();
    setModalState({
      visible: true,
      variant: 'success',
      title: 'Saved',
      message: 'Profile updated successfully.',
      primaryAction: {
        label: 'Done',
        onPress: () => {
          setModalState((prev) => ({ ...prev, visible: false }));
          navigateBackSafe(navigation, 'ProfileMain');
        },
      },
    });
  };

  const handleAvatarUpload = async () => {
    if (!user?.id || avatarUploading) return;
    try {
      setAvatarUploading(true);
      const pickedUri = await pickAvatarImage();
      if (!pickedUri) return;

      const publicUrl = await uploadAvatarForUser(user.id, pickedUri);
      setAvatarUrl(publicUrl);
      await refreshProfile();
      showModal('success', 'Avatar updated', 'Your profile image is now live.');
    } catch (error: any) {
      showModal('error', 'Avatar upload failed', error.message || 'Please try again.');
    } finally {
      setAvatarUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Button title="Back" variant="ghost" fullWidth={false} onPress={() => navigateBackSafe(navigation, 'ProfileMain')} />
        <Text style={styles.title}>Edit Profile</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Card style={styles.content}>
        <View style={styles.avatarRow}>
          <Avatar
            uri={avatarUrl}
            name={displayName || firstName || profile?.first_name || undefined}
            size={84}
          />
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={handleAvatarUpload}
            disabled={avatarUploading}
          >
            <Text style={styles.avatarBtnText}>{avatarUploading ? 'Uploading...' : 'Choose avatar'}</Text>
          </TouchableOpacity>
        </View>

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
      </Card>
      </ScrollView>
      <CoveModal
        visible={modalState.visible}
        variant={modalState.variant}
        title={modalState.title}
        message={modalState.message}
        primaryAction={modalState.primaryAction || undefined}
        onDismiss={() => setModalState((prev) => ({ ...prev, visible: false }))}
      />
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
    marginHorizontal: Spacing.xl,
    gap: Spacing.sm,
    borderRadius: Radius.xl,
  },
  scrollContent: {
    paddingBottom: Spacing.xxxxl + 24,
  },
  label: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    marginTop: Spacing.sm,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  avatarBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.medium,
    backgroundColor: Colors.ui.glass,
  },
  avatarBtnText: {
    ...Typography.captionEmphasis,
    color: Colors.accent.primary,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: Radius.lg,
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
