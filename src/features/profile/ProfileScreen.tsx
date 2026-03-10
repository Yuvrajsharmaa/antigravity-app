import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Avatar, Card } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';

export const ProfileScreen: React.FC = () => {
  const { profile, signOut, isTherapistMode, toggleTherapistMode } = useAuth();

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  const settingsItems = [
    { icon: 'person-outline', label: 'Edit profile', onPress: () => {} },
    { icon: 'notifications-outline', label: 'Notifications', onPress: () => {} },
    { icon: 'shield-checkmark-outline', label: 'Privacy & safety', onPress: () => {} },
    { icon: 'help-circle-outline', label: 'Help & support', onPress: () => {} },
  ];

  const legalItems = [
    { icon: 'document-text-outline', label: 'Terms of service', onPress: () => {} },
    { icon: 'lock-closed-outline', label: 'Privacy policy', onPress: () => {} },
    { icon: 'information-circle-outline', label: 'About Care Space', onPress: () => {} },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Text style={styles.screenTitle}>Profile</Text>

      {/* User header */}
      <View style={styles.userHeader}>
        <Avatar
          uri={profile?.avatar_url}
          name={profile?.display_name || profile?.first_name || undefined}
          size={72}
        />
        <Text style={styles.userName}>{profile?.display_name || profile?.first_name || 'User'}</Text>
        <Text style={styles.userEmail}>{profile?.email || 'Email not set'}</Text>
      </View>

      {/* Settings */}
      <Card style={styles.settingsCard}>
        {settingsItems.map((item, i) => (
          <TouchableOpacity key={item.label} style={styles.settingRow} onPress={item.onPress}>
            <Ionicons name={item.icon as any} size={20} color={Colors.text.secondary} />
            <Text style={styles.settingLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} />
          </TouchableOpacity>
        ))}
        {/* Therapist Mode Toggle */}
        <View style={styles.settingRow}>
          <Ionicons name="medical-outline" size={20} color={Colors.accent.primary} />
          <Text style={styles.settingLabel}>Therapist Mode</Text>
          <Switch
            value={isTherapistMode}
            onValueChange={toggleTherapistMode}
            trackColor={{ false: Colors.stroke.medium, true: Colors.accent.primary }}
          />
        </View>
      </Card>

      {/* Legal */}
      <Card style={styles.settingsCard}>
        {legalItems.map((item) => (
          <TouchableOpacity key={item.label} style={styles.settingRow} onPress={item.onPress}>
            <Ionicons name={item.icon as any} size={20} color={Colors.text.secondary} />
            <Text style={styles.settingLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} />
          </TouchableOpacity>
        ))}
      </Card>

      {/* Emergency notice */}
      <View style={styles.emergencyCard}>
        <Ionicons name="warning-outline" size={16} color={Colors.status.warning} />
        <Text style={styles.emergencyText}>
          This app is not for emergencies. If you are in crisis, please contact your local emergency services.
        </Text>
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color={Colors.status.danger} />
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Care Space v1.0.0 (prototype)</Text>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg.primary },
  screenTitle: {
    ...Typography.title1,
    color: Colors.text.primary,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
  },
  userHeader: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: 6,
  },
  userName: { ...Typography.title2, color: Colors.text.primary },
  userEmail: { ...Typography.caption, color: Colors.text.secondary },
  settingsCard: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    padding: 0,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.ui.divider,
  },
  settingLabel: { ...Typography.body, color: Colors.text.primary, flex: 1 },
  emergencyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginHorizontal: Spacing.xl,
    backgroundColor: Colors.status.warningSoft,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
  },
  emergencyText: { ...Typography.caption, color: Colors.text.secondary, flex: 1, lineHeight: 18 },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.lg,
    backgroundColor: Colors.status.dangerSoft,
  },
  signOutText: { ...Typography.bodyEmphasis, color: Colors.status.danger },
  version: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
});
