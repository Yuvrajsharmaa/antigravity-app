import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Avatar, Card, ErrorState } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { supabase } from '../../services/supabase';
import { moderateMessage } from '../../core/utils/moderation';
import { ChatMessage } from '../../core/models/types';
import { careBuddyLine } from '../../core/utils/careBuddy';

export const ChatScreen: React.FC<{ route: any; navigation: any }> = ({
  route,
  navigation,
}) => {
  const { conversationId, therapistName, therapistAvatar, therapistId } = route.params;
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [showCrisisCard, setShowCrisisCard] = useState(false);
  const [blockedWarning, setBlockedWarning] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    fetchMessages();
    const subscription = setupRealtime();
    return () => { subscription?.unsubscribe(); };
  }, []);

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      setLoadError(error.message || 'Unable to load chat.');
      return;
    }

    setLoadError(null);
    if (data) setMessages(data as ChatMessage[]);
  };

  const setupRealtime = () => {
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => [...prev, newMsg]);
        }
      )
      .subscribe();

    return channel;
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !user || sending) return;

    const text = inputText.trim();
    setInputText('');
    setBlockedWarning('');

    // Client-side moderation
    const modResult = moderateMessage(text);

    if (modResult.isBlocked) {
      setBlockedWarning(
        "Contact details can't be shared here. This keeps sessions safe and professional for both of you."
      );
      return;
    }

    if (modResult.isCrisis) {
      setShowCrisisCard(true);
    }

    setSending(true);
    try {
      const { error } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        body: text,
        message_type: 'text',
        is_blocked: false,
      });

      if (error) throw error;

      // Update conversation last_message_at
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      // If crisis, flag it
      if (modResult.isCrisis) {
        await supabase.from('crisis_flags').insert({
          user_id: user.id,
          conversation_id: conversationId,
          keyword_hit: modResult.reason,
        });
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.sender_id === user?.id;

    return (
      <View style={[styles.bubbleRow, isMe ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
        {!isMe && (
          <Avatar uri={therapistAvatar} name={therapistName} size={28} />
        )}
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
            {item.body}
          </Text>
          <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem]}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  if (!conversationId) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ErrorState
          message="Conversation details are missing. Return to Messages and open chat again."
          onRetry={() => navigation.goBack()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Avatar uri={therapistAvatar} name={therapistName} size={36} />
        <View style={styles.headerText}>
          <Text style={styles.headerName}>{therapistName}</Text>
          <Text style={styles.headerStatus}>Online</Text>
        </View>
        <View style={{ flex: 1 }} />
      </View>

      {/* Crisis card */}
      {showCrisisCard && (
        <Card style={styles.crisisCard}>
          <View style={styles.crisisHeader}>
            <Ionicons name="warning" size={18} color={Colors.status.danger} />
            <Text style={styles.crisisTitle}>Need immediate help?</Text>
          </View>
          <Text style={styles.crisisText}>
            This app is not a substitute for emergency services. If you are in crisis, please contact:
          </Text>
          <Text style={styles.crisisNumber}>🇮🇳 iCall: 9152987821 | Vandrevala: 1860-2662-345</Text>
          <TouchableOpacity onPress={() => setShowCrisisCard(false)}>
            <Text style={styles.crisisDismiss}>Dismiss</Text>
          </TouchableOpacity>
        </Card>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Messages */}
        {loadError ? (
          <ErrorState message={loadError} onRetry={fetchMessages} />
        ) : (
          <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListHeaderComponent={
            <View style={styles.boundaryNotice}>
              <Ionicons name="shield-checkmark-outline" size={16} color={Colors.accent.primary} />
              <Text style={styles.boundaryText}>
                Messages are private between you and your therapist. Contact sharing is not permitted.
              </Text>
            </View>
          }
        />
        )}

        {/* Blocked warning */}
        {blockedWarning !== '' && (
          <View style={styles.blockedBanner}>
            <Ionicons name="close-circle" size={16} color={Colors.status.danger} />
            <Text style={styles.blockedText}>{blockedWarning}</Text>
          </View>
        )}
        {blockedWarning === '' && (
          <View style={styles.coachBanner}>
            <Ionicons name="leaf-outline" size={14} color={Colors.accent.primary} />
            <Text style={styles.coachText}>{careBuddyLine('reflect')}</Text>
          </View>
        )}

        {/* Composer */}
        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            placeholder="Type a message..."
            placeholderTextColor={Colors.text.tertiary}
            value={inputText}
            onChangeText={(t) => { setInputText(t); setBlockedWarning(''); }}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!inputText.trim() || sending}
          >
            <Ionicons name="send" size={18} color={Colors.text.inverse} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg.primary },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.secondary,
  },
  headerText: { marginLeft: 4 },
  headerName: { ...Typography.bodySemibold, color: Colors.text.primary },
  headerStatus: { ...Typography.caption, color: Colors.status.success },
  messagesList: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
  },
  boundaryNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    backgroundColor: Colors.accent.soft,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  boundaryText: { ...Typography.caption, color: Colors.accent.dark, flex: 1, lineHeight: 18 },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginBottom: 4,
  },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubbleRowLeft: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
  },
  bubbleMe: {
    backgroundColor: Colors.accent.primary,
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: Colors.bg.secondary,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  bubbleText: { ...Typography.body, lineHeight: 22 },
  bubbleTextMe: { color: Colors.text.inverse },
  bubbleTextThem: { color: Colors.text.primary },
  bubbleTime: { ...Typography.caption, marginTop: 4, fontSize: 11 },
  bubbleTimeMe: { color: Colors.text.inverse + '99' },
  bubbleTimeThem: { color: Colors.text.tertiary },
  crisisCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    backgroundColor: Colors.status.dangerSoft,
    borderColor: Colors.status.danger + '30',
    gap: Spacing.xs,
  },
  crisisHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  crisisTitle: { ...Typography.bodySemibold, color: Colors.status.danger },
  crisisText: { ...Typography.caption, color: Colors.text.secondary, lineHeight: 18 },
  crisisNumber: { ...Typography.captionEmphasis, color: Colors.text.primary },
  crisisDismiss: { ...Typography.captionEmphasis, color: Colors.accent.primary, marginTop: 4 },
  blockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.status.dangerSoft,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  blockedText: { ...Typography.caption, color: Colors.status.danger, flex: 1 },
  coachBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.accent.soft,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xs,
  },
  coachText: {
    ...Typography.caption,
    color: Colors.accent.dark,
    flex: 1,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.secondary,
  },
  composerInput: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Typography.body,
    color: Colors.text.primary,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
});
