import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Avatar, Card, LoadingState } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { supabase } from '../../services/supabase';
import { useFocusEffect } from '@react-navigation/native';

const DUMMY_CLIENTS_NEEDING_ATTENTION = [
  {
    id: '1',
    name: 'Sarah M.',
    avatar: 'https://i.pravatar.cc/150?u=sarah',
    issue: 'Missed Journaling 3 times',
    lastContact: '5 days ago',
    alertLevel: 'high',
  },
  {
    id: '2',
    name: 'James L.',
    avatar: 'https://i.pravatar.cc/150?u=james',
    issue: 'Session completed, did not rebook',
    lastContact: 'Yesterday',
    alertLevel: 'medium',
  },
];

const DUMMY_UPCOMING_SESSIONS = [
  {
    id: '3',
    name: 'Emily R.',
    avatar: 'https://i.pravatar.cc/150?u=emily',
    time: '2:00 PM',
  },
  {
    id: '4',
    name: 'David K.',
    avatar: 'https://i.pravatar.cc/150?u=david',
    time: '4:30 PM',
  },
];

export const TherapistDashboardScreen: React.FC = () => {
  const { profile, user } = useAuth();
  const [realClients, setRealClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClients = React.useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          id,
          users:user_id ( id, first_name, display_name, avatar_url )
        `)
        .eq('therapist_id', user.id);
      
      if (!error && data) {
        setRealClients(data);
      }
    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    React.useCallback(() => {
      fetchClients();
    }, [fetchClients])
  );

  const handleSendNudge = async (clientName: string, activeConvId?: string) => {
    if (!activeConvId) {
      Alert.alert(
        'Prototype Note',
        `Send an automated check-in nudge to ${clientName}? (This is a dummy profile, so it won't send real data)`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Send Template', onPress: () => Alert.alert('Sent', 'The client will receive a push notification.') },
        ]
      );
      return;
    }

    Alert.alert(
      'Send check-in',
      `Send an automated check-in template to ${clientName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send Template', onPress: async () => {
            try {
              const text = `Hi ${clientName}, I noticed you haven't checked in lately. Take a deep breath and let me know how you're feeling today!`;
              await supabase.from('messages').insert({
                conversation_id: activeConvId,
                sender_id: user?.id,
                body: text,
                message_type: 'text',
              });
              await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', activeConvId);
              Alert.alert('Sent', 'Check-in sent successfully!');
            } catch(e) {
              Alert.alert('Error', 'Failed to send message.');
            }
        }},
      ]
    );
  };


  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading && <LoadingState message="" />}
        
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Practice Dashboard</Text>
            <Text style={styles.subtitle}>Welcome back, Dr. {profile?.display_name || 'Therapist'}</Text>
          </View>
          <Avatar uri={profile?.avatar_url} name={profile?.display_name || 'Dr.'} size={48} />
        </View>

        {/* Stats Summary */}
        <View style={styles.statsContainer}>
          <Card style={styles.statCard}>
            <Ionicons name="people-outline" size={24} color={Colors.accent.primary} />
            <Text style={styles.statValue}>14</Text>
            <Text style={styles.statLabel}>Active Clients</Text>
          </Card>
          <Card style={styles.statCard}>
            <Ionicons name="card-outline" size={24} color={Colors.status.success} />
            <Text style={styles.statValue}>$1,240</Text>
            <Text style={styles.statLabel}>Expected (Week)</Text>
          </Card>
        </View>

        {/* Needs Attention Roster */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Needs Attention</Text>
          <Text style={styles.sectionAction}>View all</Text>
        </View>

        {/* Real Clients rendered if available */}
        {realClients.map((conv) => {
          const uProfile = Array.isArray(conv.users) ? conv.users[0] : conv.users;
          const cName = uProfile?.display_name || uProfile?.first_name || 'Client';
          return (
            <Card key={conv.id} style={styles.clientCard}>
            <View style={styles.clientHeader}>
              <Avatar uri={uProfile?.avatar_url} name={cName} size={48} />
              <View style={styles.clientInfo}>
                <Text style={styles.clientName}>{cName}</Text>
                <Text style={styles.clientLastContact}>Last contact: Active</Text>
              </View>
              <View style={styles.alertDot} />
            </View>
            <View style={styles.issueContainer}>
              <Ionicons name="warning-outline" size={16} color={Colors.status.warning} />
              <Text style={styles.issueText}>Needs check-in</Text>
            </View>
            <View style={styles.actionButtons}>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnOutline]}>
                <Ionicons name="reader-outline" size={18} color={Colors.text.primary} />
                <Text style={styles.actionBtnTextOutline}>View Notes</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.actionBtn, styles.actionBtnPrimary]}
                onPress={() => handleSendNudge(cName, conv.id)}
              >
                <Ionicons name="paper-plane-outline" size={18} color={Colors.text.inverse} />
                <Text style={styles.actionBtnTextPrimary}>Send Check-in</Text>
              </TouchableOpacity>
            </View>
          </Card>
          );
        })}

        {/* Dummy placeholders if less than 2 real clients */}
        {realClients.length < 2 && DUMMY_CLIENTS_NEEDING_ATTENTION.map((client) => (
          <Card key={client.id} style={styles.clientCard}>
            <View style={styles.clientHeader}>
              <Avatar uri={client.avatar} name={client.name} size={48} />
              <View style={styles.clientInfo}>
                <Text style={styles.clientName}>{client.name}</Text>
                <Text style={styles.clientLastContact}>
                  Last contact: {client.lastContact}
                </Text>
              </View>
              {client.alertLevel === 'high' && (
                <View style={styles.alertDot} />
              )}
            </View>
            <View style={styles.issueContainer}>
              <Ionicons name="warning-outline" size={16} color={Colors.status.warning} />
              <Text style={styles.issueText}>{client.issue}</Text>
            </View>
            <View style={styles.actionButtons}>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnOutline]}>
                <Ionicons name="reader-outline" size={18} color={Colors.text.primary} />
                <Text style={styles.actionBtnTextOutline}>View Notes</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.actionBtn, styles.actionBtnPrimary]}
                onPress={() => handleSendNudge(client.name)}
              >
                <Ionicons name="paper-plane-outline" size={18} color={Colors.text.inverse} />
                <Text style={styles.actionBtnTextPrimary}>Send Check-in</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ))}

        {/* Upcoming Today */}
        <View style={[styles.sectionHeader, { marginTop: Spacing.xl }]}>
          <Text style={styles.sectionTitle}>Upcoming Today</Text>
        </View>
        
        {DUMMY_UPCOMING_SESSIONS.map((session) => (
          <Card key={session.id} style={styles.sessionCard}>
            <Avatar uri={session.avatar} name={session.name} size={40} />
            <Text style={styles.sessionName}>{session.name}</Text>
            <View style={styles.sessionTimeBadge}>
              <Text style={styles.sessionTime}>{session.time}</Text>
            </View>
          </Card>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg.primary },
  scrollContent: { padding: Spacing.xl, paddingBottom: 100 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  greeting: { ...Typography.title1, color: Colors.text.primary },
  subtitle: { ...Typography.body, color: Colors.text.secondary, marginTop: 4 },
  
  statsContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  statCard: {
    flex: 1,
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  statValue: { ...Typography.title2, color: Colors.text.primary, marginTop: Spacing.xs },
  statLabel: { ...Typography.caption, color: Colors.text.secondary },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: { ...Typography.title2, color: Colors.text.primary },
  sectionAction: { ...Typography.bodySemibold, color: Colors.accent.primary },

  clientCard: {
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  clientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: { ...Typography.bodySemibold, color: Colors.text.primary },
  clientLastContact: { ...Typography.caption, color: Colors.text.secondary, marginTop: 2 },
  alertDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.status.danger,
  },
  issueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.status.warningSoft,
    padding: Spacing.sm,
    borderRadius: Radius.md,
  },
  issueText: { ...Typography.captionEmphasis, color: Colors.status.warning, flex: 1 },
  actionButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  actionBtnOutline: {
    backgroundColor: Colors.bg.primary,
    borderWidth: 1,
    borderColor: Colors.stroke.medium,
  },
  actionBtnPrimary: {
    backgroundColor: Colors.accent.primary,
  },
  actionBtnTextOutline: { ...Typography.bodySemibold, color: Colors.text.primary, fontSize: 13 },
  actionBtnTextPrimary: { ...Typography.bodySemibold, color: Colors.text.inverse, fontSize: 13 },

  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sessionName: { ...Typography.bodySemibold, color: Colors.text.primary, flex: 1 },
  sessionTimeBadge: {
    backgroundColor: Colors.accent.soft,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  sessionTime: { ...Typography.captionEmphasis, color: Colors.accent.primary },
});
