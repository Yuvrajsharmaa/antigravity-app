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
import { Colors, Typography, Spacing } from '../../core/theme';
import { Avatar, EmptyState, LoadingState } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { supabase } from '../../services/supabase';
import { useFocusEffect } from '@react-navigation/native';

interface ConversationItem {
  id: string;
  therapist_id: string;
  therapist_name: string;
  therapist_avatar: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread: boolean;
}

export const MessagesListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          id, therapist_id, last_message_at,
          therapists!inner (
            id,
            profiles!inner (display_name, avatar_url)
          )
        `)
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (!error && data) {
        const mapped: ConversationItem[] = data.map((c: any) => ({
          id: c.id,
          therapist_id: c.therapist_id,
          therapist_name: c.therapists?.profiles?.display_name || 'Therapist',
          therapist_avatar: c.therapists?.profiles?.avatar_url,
          last_message: null,
          last_message_at: c.last_message_at,
          unread: false,
        }));

        // Fetch last message for each conversation
        for (const conv of mapped) {
          const { data: msgs } = await supabase
            .from('messages')
            .select('body')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1);

          if (msgs && msgs.length > 0) {
            conv.last_message = msgs[0].body;
          }
        }

        setConversations(mapped);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

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
        therapistName: item.therapist_name,
        therapistAvatar: item.therapist_avatar,
        therapistId: item.therapist_id,
      })}
      activeOpacity={0.7}
    >
      <Avatar uri={item.therapist_avatar} name={item.therapist_name} size={48} />
      <View style={styles.convContent}>
        <View style={styles.convHeader}>
          <Text style={styles.convName}>{item.therapist_name}</Text>
          <Text style={styles.convTime}>{formatTime(item.last_message_at)}</Text>
        </View>
        <Text style={styles.convPreview} numberOfLines={1}>
          {item.last_message || 'Start a conversation'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Text style={styles.screenTitle}>Messages</Text>

      {loading ? (
        <LoadingState message="Loading conversations..." />
      ) : conversations.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title="No messages yet"
          message="Start a conversation with a therapist from their profile."
          actionLabel="Browse therapists"
          onAction={() => navigation.navigate('HomeTab')}
        />
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
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
  conversationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
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
  separator: {
    height: 1,
    backgroundColor: Colors.ui.divider,
    marginLeft: 60,
  },
});
