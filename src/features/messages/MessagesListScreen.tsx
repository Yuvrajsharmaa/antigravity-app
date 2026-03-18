import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Typography, Spacing } from '../../core/theme';
import { Avatar, EmptyState, LoadingState, ErrorState } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { getRoleModeContract } from '../../core/utils/roleAccess';
import { supabase } from '../../services/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { useTabSafeBottomPadding } from '../../core/hooks/useTabSafeBottomPadding';
import { assessCareRisk } from '../../core/utils/careRisk';
import { RiskLevel } from '../../core/models/types';

interface ConversationItem {
  id: string;
  other_id: string;
  other_name: string;
  other_avatar: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread: boolean;
  awaiting_reply: boolean;
  recent_mood: string | null;
  risk_level: RiskLevel | null;
  overdue_checkin: boolean;
  nudge_due: boolean;
}

export const MessagesListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, isTherapistMode, profile } = useAuth();
  const tabSafeBottomPadding = useTabSafeBottomPadding(Spacing.xxl);
  const roleMode = getRoleModeContract(profile?.role, isTherapistMode);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!user) return;
    try {
      setLoadError(null);
      const columnToMatch = isTherapistMode ? 'therapist_id' : 'user_id';

      const { data, error } = await supabase
        .from('conversations')
        .select(`
          id, therapist_id, user_id, last_message_at,
          therapists:therapist_id ( profiles!inner (display_name, avatar_url) ),
          users:user_id ( display_name, first_name, avatar_url )
        `)
        .eq(columnToMatch, user.id)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        setConversations([]);
        return;
      }

      const conversationIds = data.map((row) => row.id);
      const otherIds = data
        .map((row) => (isTherapistMode ? row.user_id : row.therapist_id))
        .filter((id): id is string => Boolean(id));

      const [{ data: allMessages }, moodResult, nudgeResult] = await Promise.all([
        supabase
          .from('messages')
          .select('conversation_id,body,sender_id,created_at')
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: false }),
        isTherapistMode && otherIds.length > 0
          ? supabase
              .from('client_metrics')
              .select('user_id,mood,stress_level,sleep_hours,care_score_snapshot,energy_level,connectedness_level,coping_helpfulness,created_at')
              .in('user_id', otherIds)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: null, error: null } as { data: null; error: null }),
        isTherapistMode && otherIds.length > 0
          ? supabase
              .from('care_nudge_events')
              .select('user_id,created_at')
              .eq('therapist_id', user.id)
              .eq('source', 'therapist_manual')
              .in('user_id', otherIds)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: null, error: null } as { data: null; error: null }),
      ]);

      const latestByConversation = new Map<string, { body: string; sender_id: string }>();
      for (const message of allMessages || []) {
        if (!latestByConversation.has(message.conversation_id)) {
          latestByConversation.set(message.conversation_id, {
            body: message.body,
            sender_id: message.sender_id,
          });
        }
      }

      const latestMoodByUser = new Map<string, string>();
      const metricsByUser = new Map<string, any[]>();
      if (!moodResult.error) {
        for (const metric of moodResult.data || []) {
          const rows = metricsByUser.get(metric.user_id) || [];
          rows.push(metric);
          metricsByUser.set(metric.user_id, rows);
          if (!latestMoodByUser.has(metric.user_id)) {
            latestMoodByUser.set(metric.user_id, metric.mood);
          }
        }
      }

      const latestNudgeByUser = new Map<string, string>();
      if (!nudgeResult.error) {
        for (const event of nudgeResult.data || []) {
          if (!latestNudgeByUser.has(event.user_id)) {
            latestNudgeByUser.set(event.user_id, event.created_at);
          }
        }
      }

      const mapped: ConversationItem[] = data.map((c) => {
        let name = 'User';
        let avatar = null;
        let otherId = c.therapist_id;

        if (isTherapistMode) {
          const uProfile = Array.isArray(c.users) ? c.users[0] : c.users;
          name = uProfile?.display_name || uProfile?.first_name || 'Client';
          avatar = uProfile?.avatar_url;
          otherId = c.user_id;
        } else {
          const tProfile = Array.isArray(c.therapists)
            ? (c.therapists[0] as any)?.profiles
            : (c.therapists as any)?.profiles;
          name = tProfile?.display_name || 'Therapist';
          avatar = tProfile?.avatar_url;
        }

        const latestMessage = latestByConversation.get(c.id);
        const metrics = isTherapistMode && otherId ? (metricsByUser.get(otherId) || []) : [];
        const latestMetric = metrics[0];
        const riskLevel = isTherapistMode
          ? assessCareRisk(metrics.slice(0, 5)).level
          : null;
        const lastCheckInAt = latestMetric?.created_at ? new Date(latestMetric.created_at).getTime() : null;
        const overdueCheckIn = isTherapistMode
          ? (!lastCheckInAt || Date.now() - lastCheckInAt > (48 * 60 * 60 * 1000))
          : false;
        const lastManualNudgeAt = latestNudgeByUser.get(otherId || '');
        const nudgeDue = isTherapistMode
          ? (riskLevel !== 'stable' && (!lastManualNudgeAt || (Date.now() - new Date(lastManualNudgeAt).getTime() > 24 * 60 * 60 * 1000)))
          : false;

        return {
          id: c.id,
          other_id: otherId,
          other_name: name,
          other_avatar: avatar,
          last_message: latestMessage?.body || null,
          last_message_at: c.last_message_at,
          unread: false,
          awaiting_reply: Boolean(latestMessage && latestMessage.sender_id !== user.id),
          recent_mood: isTherapistMode && otherId ? latestMoodByUser.get(otherId) || null : null,
          risk_level: riskLevel,
          overdue_checkin: overdueCheckIn,
          nudge_due: nudgeDue,
        };
      });

      setConversations(mapped);
    } catch (err) {
      console.error(err);
      setLoadError('Unable to load conversations right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isTherapistMode, user]);

  useFocusEffect(
    useCallback(() => {
      fetch();
    }, [fetch])
  );

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const renderConversation = ({ item }: { item: ConversationItem }) => (
    <TouchableOpacity
      style={styles.conversationRow}
      onPress={() => navigation.navigate('Chat', {
        conversationId: item.id,
        therapistName: item.other_name,
        therapistAvatar: item.other_avatar,
        therapistId: item.other_id,
        attentionCue: {
          riskLevel: item.risk_level,
          recentMood: item.recent_mood,
          overdueCheckIn: item.overdue_checkin,
          nudgeDue: item.nudge_due,
        },
      })}
      activeOpacity={0.7}
    >
      <Avatar uri={item.other_avatar} name={item.other_name} size={48} />
      <View style={styles.convContent}>
        <View style={styles.convHeader}>
          <Text style={styles.convName}>{item.other_name}</Text>
          <Text style={styles.convTime}>{formatTime(item.last_message_at)}</Text>
        </View>
        <Text style={styles.convPreview} numberOfLines={1}>
          {item.last_message || 'Start a conversation'}
        </Text>
        {(item.awaiting_reply || item.recent_mood || item.overdue_checkin || item.nudge_due) && (
          <View style={styles.metaRow}>
            {item.awaiting_reply ? (
              <Text style={styles.awaitingReply}>Awaiting your reply</Text>
            ) : null}
            {item.recent_mood ? (
              <Text style={styles.metaChip}>{item.recent_mood}</Text>
            ) : null}
            {item.overdue_checkin ? (
              <Text style={[styles.metaChip, styles.metaChipWarning]}>Check-in overdue</Text>
            ) : null}
            {item.nudge_due ? (
              <Text style={[styles.metaChip, styles.metaChipNudge]}>Nudge due</Text>
            ) : null}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Text style={styles.screenTitle}>Messages</Text>

      {loading ? (
        <LoadingState message="Loading conversations..." style={styles.screenState} />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={fetch} style={styles.screenState} />
      ) : conversations.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title="No messages yet"
          message={
            roleMode.canAccessMatchFlow
              ? 'Start by completing therapist match to open your first conversation.'
              : 'Client conversations will appear here once they message you.'
          }
          actionLabel={roleMode.canAccessMatchFlow ? 'Go to Match' : undefined}
          onAction={roleMode.canAccessMatchFlow ? () => navigation.navigate('MatchTab') : undefined}
          style={styles.screenState}
        />
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabSafeBottomPadding }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(); }} tintColor={Colors.accent.primary} />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
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
    paddingBottom: Spacing.md,
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxxl,
  },
  screenState: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
  conversationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.ui.glass,
  },
  convContent: { flex: 1 },
  convHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  convName: { ...Typography.bodySemibold, color: Colors.text.primary },
  convTime: { ...Typography.caption, color: Colors.text.tertiary },
  convPreview: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: 4,
  },
  awaitingReply: {
    ...Typography.micro,
    color: Colors.status.warning,
  },
  metaChip: {
    ...Typography.micro,
    color: Colors.accent.dark,
    borderWidth: 1,
    borderColor: Colors.accent.primary + '34',
    backgroundColor: Colors.accent.soft,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  metaChipWarning: {
    color: Colors.status.warning,
    borderColor: Colors.status.warning + '45',
    backgroundColor: Colors.status.warningSoft,
  },
  metaChipNudge: {
    color: Colors.status.success,
    borderColor: Colors.status.success + '45',
    backgroundColor: Colors.status.successSoft,
  },
  separator: {
    height: Spacing.xs,
  },
});
