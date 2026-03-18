import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, EmptyState, ErrorState, LoadingState, ScreenScaffold } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { HomeUpdateItem } from '../../core/models/types';
import { useTabSafeBottomPadding } from '../../core/hooks/useTabSafeBottomPadding';
import { Colors, Radius, Spacing, Typography } from '../../core/theme';
import { supabase } from '../../services/supabase';
import { navigateBackSafe } from '../../navigation/safeBack';

type UpdateFilter = 'all' | 'session' | 'message' | 'wellbeing';

const FILTERS: Array<{ label: string; value: UpdateFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Sessions', value: 'session' },
  { label: 'Messages', value: 'message' },
  { label: 'Wellbeing', value: 'wellbeing' },
];

const kindIcon: Record<HomeUpdateItem['kind'], keyof typeof Ionicons.glyphMap> = {
  session: 'calendar-outline',
  message: 'chatbubble-ellipses-outline',
  wellbeing: 'leaf-outline',
  match: 'sparkles-outline',
};

export const HomeUpdatesScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const tabSafeBottomPadding = useTabSafeBottomPadding(Spacing.xxl);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<UpdateFilter>('all');
  const [items, setItems] = useState<HomeUpdateItem[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setError(null);

      const nowIso = new Date().toISOString();

      const [{ data: sessions }, { data: conversations }, { data: wellbeingEvents }] = await Promise.all([
        supabase
          .from('bookings')
          .select('id,scheduled_start_at,status')
          .eq('user_id', user.id)
          .in('status', ['confirmed', 'pending_payment'])
          .gte('scheduled_start_at', nowIso)
          .order('scheduled_start_at', { ascending: true })
          .limit(5),
        supabase
          .from('conversations')
          .select(`
            id,last_message_at,therapist_id,
            therapists:therapist_id ( profiles!inner(display_name,first_name) )
          `)
          .eq('user_id', user.id)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(5),
        supabase
          .from('care_nudge_events')
          .select('id,trigger_type,created_at,message_preview')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      const convIds = (conversations || []).map((row: any) => row.id);
      const { data: latestMessages } = convIds.length
        ? await supabase
            .from('messages')
            .select('conversation_id,body,created_at')
            .in('conversation_id', convIds)
            .order('created_at', { ascending: false })
        : { data: [] as any[] };

      const messageByConversation = new Map<string, { body: string; created_at: string }>();
      for (const message of latestMessages || []) {
        if (!messageByConversation.has(message.conversation_id)) {
          messageByConversation.set(message.conversation_id, {
            body: message.body,
            created_at: message.created_at,
          });
        }
      }

      const merged: HomeUpdateItem[] = [];

      for (const booking of sessions || []) {
        merged.push({
          id: `session-${booking.id}`,
          kind: 'session',
          title: booking.status === 'pending_payment' ? 'Session awaiting confirmation' : 'Upcoming session',
          body: new Date(booking.scheduled_start_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          timestamp: booking.scheduled_start_at,
          route: { name: 'Main', params: { screen: 'SessionsTab', params: { initialTab: 'upcoming' } } },
        });
      }

      for (const conversation of conversations || []) {
        const therapist = Array.isArray((conversation as any).therapists)
          ? (conversation as any).therapists[0]
          : (conversation as any).therapists;
        const tProfile = Array.isArray(therapist?.profiles) ? therapist?.profiles[0] : therapist?.profiles;
        const lastMessage = messageByConversation.get(conversation.id);
        if (!lastMessage) continue;

        merged.push({
          id: `message-${conversation.id}`,
          kind: 'message',
          title: tProfile?.display_name || tProfile?.first_name || 'Therapist message',
          body: lastMessage.body,
          timestamp: lastMessage.created_at,
          route: {
            name: 'Main',
            params: {
              screen: 'MessagesTab',
              params: {
                screen: 'Chat',
                params: {
                  conversationId: conversation.id,
                  therapistName: tProfile?.display_name || tProfile?.first_name || 'Therapist',
                  therapistId: conversation.therapist_id,
                },
              },
            },
          },
        });
      }

      for (const event of wellbeingEvents || []) {
        merged.push({
          id: `wellbeing-${event.id}`,
          kind: 'wellbeing',
          title: 'Wellbeing update',
          body: event.message_preview || 'Your recent check-in has been recorded.',
          timestamp: event.created_at,
          route: { name: 'HomeMain' },
        });
      }

      merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setItems(merged);
    } catch (err: any) {
      setError(err?.message || 'Unable to load updates right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) => item.kind === filter);
  }, [filter, items]);

  return (
    <ScreenScaffold scroll={false}>
      <View style={styles.header}>
        <Button title="Back" variant="ghost" fullWidth={false} onPress={() => navigateBackSafe(navigation, 'HomeMain')} />
        <Text style={styles.title}>Updates</Text>
        <View style={{ width: 56 }} />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((row) => (
          <TouchableOpacity
            key={row.value}
            style={[styles.filterChip, filter === row.value && styles.filterChipActive]}
            onPress={() => setFilter(row.value)}
          >
            <Text style={[styles.filterChipText, filter === row.value && styles.filterChipTextActive]}>
              {row.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <LoadingState message="Loading updates..." style={styles.stateWrap} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} style={styles.stateWrap} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="No updates right now"
          message="Session, message, and wellbeing updates will appear here."
          style={styles.stateWrap}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: tabSafeBottomPadding }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={Colors.accent.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                if (item.route) {
                  navigation.navigate(item.route.name, item.route.params);
                }
              }}
            >
              <Card style={styles.updateCard}>
                <View style={styles.iconWrap}>
                  <Ionicons name={kindIcon[item.kind]} size={18} color={Colors.accent.primary} />
                </View>
                <View style={styles.copyWrap}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardBody} numberOfLines={2}>{item.body}</Text>
                  <Text style={styles.cardTime}>
                    {new Date(item.timestamp).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  title: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  filterRow: {
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  filterChip: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.ui.glass,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  filterChipActive: {
    borderColor: Colors.accent.primary,
    backgroundColor: Colors.accent.soft,
  },
  filterChipText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  filterChipTextActive: {
    color: Colors.accent.dark,
    fontWeight: '700',
  },
  stateWrap: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
  updateCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent.soft,
  },
  copyWrap: {
    flex: 1,
  },
  cardTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  cardBody: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  cardTime: {
    ...Typography.micro,
    color: Colors.text.tertiary,
    marginTop: Spacing.xs,
  },
});
