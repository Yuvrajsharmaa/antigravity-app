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
  other_id: string;
  other_name: string;
  other_avatar: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread: boolean;
}

export const MessagesListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, isTherapistMode } = useAuth();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async () => {
    if (!user) return;
    try {
      // Fetch conversations where user is either the client OR the therapist
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

      if (!error && data) {
        const mapped: ConversationItem[] = [];
        
        for (const c of data) {
          let name = 'User';
          let avatar = null;
          let otherId = c.therapist_id;

          if (isTherapistMode) {
            const uProfile = Array.isArray(c.users) ? c.users[0] : c.users;
            name = uProfile?.display_name || uProfile?.first_name || 'Client';
            avatar = uProfile?.avatar_url;
            otherId = c.user_id;
          } else {
            // Arrays are sometimes returned by postgrest depending on relationships
            const tProfile = Array.isArray(c.therapists) ? (c.therapists[0] as any)?.profiles : (c.therapists as any)?.profiles;
            name = tProfile?.display_name || 'Therapist';
            avatar = tProfile?.avatar_url;
          }

          const convItem: ConversationItem = {
            id: c.id,
            other_id: otherId,
            other_name: name,
            other_avatar: avatar,
            last_message: null,
            last_message_at: c.last_message_at,
            unread: false,
          };

          // Fetch last message for each conversation
          const { data: msgs } = await supabase
            .from('messages')
            .select('body')
            .eq('conversation_id', convItem.id)
            .order('created_at', { ascending: false })
            .limit(1);

          if (msgs && msgs.length > 0) {
            convItem.last_message = msgs[0].body;
          }
          mapped.push(convItem);
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
        therapistName: item.other_name,
        therapistAvatar: item.other_avatar,
        therapistId: item.other_id,
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
