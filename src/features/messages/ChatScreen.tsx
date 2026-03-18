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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Avatar, Button, Card, CoveModal, ErrorState } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { supabase } from '../../services/supabase';
import { moderateMessage } from '../../core/utils/moderation';
import { ChatMessage, CoveModalAction, CoveModalVariant, RiskLevel } from '../../core/models/types';
import { ChatRouteParams } from '../../navigation/types';
import { createCareNudgeEvent, getNudgeCooldownState } from '../../core/services/careFlowService';
import { therapistNudgePrefill } from '../../core/utils/careBuddy';
import { navigateBackSafe } from '../../navigation/safeBack';

export const ChatScreen: React.FC<{ route: any; navigation: any }> = ({
  route,
  navigation,
}) => {
  const { conversationId, therapistName, therapistAvatar, therapistId, attentionCue } = (route.params || {}) as ChatRouteParams;
  const { user, isTherapistMode } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [showCrisisCard, setShowCrisisCard] = useState(false);
  const [blockedWarning, setBlockedWarning] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cueDismissed, setCueDismissed] = useState(false);
  const [modalState, setModalState] = useState<{
    visible: boolean;
    variant: CoveModalVariant;
    title: string;
    message: string;
    primaryAction?: CoveModalAction | null;
    secondaryAction?: CoveModalAction | null;
  }>({
    visible: false,
    variant: 'info',
    title: '',
    message: '',
    primaryAction: null,
    secondaryAction: null,
  });
  const flatListRef = useRef<FlatList>(null);

  const showModal = (
    variant: CoveModalVariant,
    title: string,
    message: string,
    primaryAction?: CoveModalAction | null,
    secondaryAction?: CoveModalAction | null,
  ) => {
    setModalState({
      visible: true,
      variant,
      title,
      message,
      primaryAction: primaryAction || {
        label: 'Okay',
        onPress: () => setModalState((prev) => ({ ...prev, visible: false })),
      },
      secondaryAction: secondaryAction || null,
    });
  };

  useEffect(() => {
    if (!conversationId) return;
    fetchMessages();
    const subscription = setupRealtime();
    return () => { subscription?.unsubscribe(); };
  }, [conversationId]);

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
      showModal('error', 'Error', 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const sendAttentionNudge = async () => {
    if (!isTherapistMode || !user?.id || !therapistId || !conversationId) return;

    const riskLevel: RiskLevel = attentionCue?.riskLevel || 'medium';
    try {
      const cooldown = await getNudgeCooldownState({
        userId: therapistId,
        therapistId: user.id,
        source: 'therapist_manual',
        cooldownHours: 24,
      });
      if (cooldown.isBlocked) {
        showModal('info', 'Cooldown active', 'A manual nudge was already sent in the last 24 hours.');
        return;
      }

      const name = therapistName || 'there';
      const reason = attentionCue?.overdueCheckIn
        ? 'No recent check-in logged'
        : attentionCue?.recentMood
          ? `Recent mood noted as ${attentionCue.recentMood}`
          : 'Recent pattern needs attention';
      const body = `Hi ${name}, ${therapistNudgePrefill(riskLevel, reason)}`;

      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        body,
        message_type: 'text',
      });
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      await createCareNudgeEvent({
        userId: therapistId,
        therapistId: user.id,
        triggerType: 'therapist_checkin',
        riskLevel,
        source: 'therapist_manual',
        messagePreview: body,
      });
      setCueDismissed(true);
      showModal('success', 'Nudge sent', 'Supportive follow-up has been sent.');
    } catch {
      showModal('error', 'Unable to send', 'Try again in a moment.');
    }
  };

  const cueTitle = attentionCue?.overdueCheckIn
    ? 'Check-in may be overdue'
    : attentionCue?.riskLevel === 'high'
      ? 'Client may need quick support'
      : attentionCue?.riskLevel === 'medium'
        ? 'Recent check-ins may need attention'
        : null;

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
          onRetry={() => navigateBackSafe(navigation, 'MessagesList')}
        />
      </SafeAreaView>
    );
  }

  const openChatProfile = async () => {
    if (!therapistId) return;
    if (isTherapistMode) {
      const parentNav = navigation.getParent();
      if (parentNav) {
        parentNav.navigate('HomeTab', {
          screen: 'ClientDetail',
          params: {
            clientId: therapistId,
            clientName: therapistName || 'Client',
          },
        });
      } else {
        navigation.navigate('ClientDetail', {
          clientId: therapistId,
          clientName: therapistName || 'Client',
        });
      }
      return;
    }
    try {
      const { data, error } = await supabase
        .from('therapists')
        .select(`
          *,
          profiles!inner (display_name, avatar_url, first_name)
        `)
        .eq('id', therapistId)
        .maybeSingle();

      if (error || !data) {
        showModal('error', 'Profile unavailable', 'Unable to open therapist profile right now.');
        return;
      }

      const tProfile = Array.isArray((data as any).profiles)
        ? (data as any).profiles[0]
        : (data as any).profiles;

      const therapist = {
        ...data,
        display_name: tProfile?.display_name || tProfile?.first_name || therapistName || 'Therapist',
        avatar_url: tProfile?.avatar_url || therapistAvatar || null,
        first_name: tProfile?.first_name || null,
      };

      const parentNav = navigation.getParent();
      if (parentNav) {
        parentNav.navigate('MatchTab', {
          screen: 'TherapistProfile',
          params: { therapist },
        });
        return;
      }

      navigation.navigate('TherapistProfile', { therapist });
    } catch {
      showModal('error', 'Profile unavailable', 'Unable to open therapist profile right now.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigateBackSafe(navigation, 'MessagesList')}>
          <Ionicons name="chevron-back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerProfileTouch}
          onPress={openChatProfile}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
        <Avatar uri={therapistAvatar} name={therapistName} size={36} />
        <View style={styles.headerText}>
          <Text style={styles.headerName}>{therapistName}</Text>
          <Text style={styles.headerStatus}>{isTherapistMode ? 'View client profile' : 'View profile'}</Text>
        </View>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
      </View>

      {isTherapistMode && cueTitle && !cueDismissed ? (
        <Card style={styles.attentionCard}>
          <View style={styles.attentionHeader}>
            <Ionicons name="sparkles-outline" size={16} color={Colors.accent.primary} />
            <Text style={styles.attentionTitle}>{cueTitle}</Text>
            <TouchableOpacity onPress={() => setCueDismissed(true)}>
              <Ionicons name="close" size={16} color={Colors.text.tertiary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.attentionBody}>
            {attentionCue?.recentMood
              ? `Recent mood: ${attentionCue.recentMood}.`
              : 'Use a short, supportive check-in to reopen the conversation.'}
          </Text>
          {attentionCue?.nudgeDue ? (
            <Button
              title="Send supportive nudge"
              onPress={sendAttentionNudge}
              size="sm"
              variant="primary"
              fullWidth={false}
              style={{ alignSelf: 'flex-start', marginTop: 2 }}
            />
          ) : null}
        </Card>
      ) : null}

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
            <Text style={styles.coachText}>Keep messages clear so care stays aligned.</Text>
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

      <CoveModal
        visible={modalState.visible}
        variant={modalState.variant}
        title={modalState.title}
        message={modalState.message}
        primaryAction={modalState.primaryAction || undefined}
        secondaryAction={modalState.secondaryAction || undefined}
        onDismiss={() => setModalState((prev) => ({ ...prev, visible: false }))}
      />
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
    backgroundColor: Colors.ui.glass,
  },
  headerText: { marginLeft: 4 },
  headerProfileTouch: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerName: { ...Typography.bodySemibold, color: Colors.text.primary },
  headerStatus: { ...Typography.caption, color: Colors.text.secondary },
  attentionCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
    backgroundColor: Colors.accent.soft,
    borderColor: Colors.accent.primary + '35',
  },
  attentionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  attentionTitle: {
    ...Typography.bodySemibold,
    color: Colors.accent.dark,
    flex: 1,
  },
  attentionBody: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
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
    borderRadius: Radius.lg,
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
    borderBottomRightRadius: 10,
  },
  bubbleThem: {
    backgroundColor: Colors.ui.glass,
    borderBottomLeftRadius: 10,
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
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.xs,
    borderRadius: Radius.lg,
  },
  blockedText: { ...Typography.caption, color: Colors.status.danger, flex: 1 },
  coachBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.accent.soft,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.xs,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
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
    backgroundColor: Colors.ui.glass,
  },
  composerInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.92)',
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
    borderRadius: 14,
    backgroundColor: Colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
});
