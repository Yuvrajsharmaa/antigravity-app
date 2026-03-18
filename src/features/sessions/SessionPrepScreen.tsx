import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Button, Card, CoveModal, ErrorState } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { CoveModalAction, CoveModalVariant, RiskLevel } from '../../core/models/types';
import { Colors, Radius, Spacing, Typography } from '../../core/theme';
import { assessCareRisk } from '../../core/utils/careRisk';
import { supabase } from '../../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigateBackSafe } from '../../navigation/safeBack';

interface SessionPrepPayload {
  id: string | null;
  booking_id: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  participant_id: string;
  participant_name: string;
  participant_avatar: string | null;
  status: string;
  video_call_id: string | null;
  booking_status?: 'pending_payment' | 'confirmed' | 'cancelled' | 'completed' | 'failed';
  session_type?: 'video' | 'chat';
}

const FEELINGS = ['Calm', 'Focused', 'Anxious', 'Low'];

interface ClientSnapshot {
  concern: string | null;
  stylePreference: string | null;
  mood: string | null;
  stress: number | null;
  sleep: number | null;
  note: string | null;
}

export const SessionPrepScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { isTherapistMode } = useAuth();
  const session = route.params?.session as SessionPrepPayload;

  const [agenda, setAgenda] = useState('');
  const [feeling, setFeeling] = useState<string | null>(null);
  const [secondsToWindow, setSecondsToWindow] = useState(0);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('stable');
  const [riskReason, setRiskReason] = useState('Loading client check-in summary...');
  const [snapshot, setSnapshot] = useState<ClientSnapshot>({
    concern: null,
    stylePreference: null,
    mood: null,
    stress: null,
    sleep: null,
    note: null,
  });
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
    if (!session?.booking_id || isTherapistMode) return;
    const key = `care_space_session_prep_${session.booking_id}`;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as { agenda?: string; feeling?: string | null };
        if (parsed.agenda) setAgenda(parsed.agenda);
        if (parsed.feeling) setFeeling(parsed.feeling);
      })
      .catch(() => {
        // Best effort cache.
      });
  }, [isTherapistMode, session?.booking_id]);

  useEffect(() => {
    if (!session?.booking_id || isTherapistMode) return;
    const key = `care_space_session_prep_${session.booking_id}`;
    AsyncStorage.setItem(key, JSON.stringify({ agenda, feeling })).catch(() => {
      // Best effort cache.
    });
  }, [agenda, feeling, isTherapistMode, session?.booking_id]);

  useEffect(() => {
    const target = new Date(session.scheduled_start_at).getTime() - 5 * 60 * 1000;

    const update = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((target - now) / 1000));
      setSecondsToWindow(diff);
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [session.scheduled_start_at]);

  useEffect(() => {
    const fetchTrend = async () => {
      if (!isTherapistMode || !session.participant_id) return;

      const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('client_metrics')
        .select('created_at, stress_level, sleep_hours, mood, care_score_snapshot')
        .eq('user_id', session.participant_id)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(8);

      if (error) {
        setRiskLevel('stable');
        setRiskReason('Could not load check-in details.');
        return;
      }

      const result = assessCareRisk(data || []);
      setRiskLevel(result.level);
      setRiskReason(result.reason);

      const latest = data?.[0];
      const { data: latestJournal } = await supabase
        .from('journal_entries')
        .select('body')
        .eq('user_id', session.participant_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setSnapshot((prev) => ({
        ...prev,
        mood: latest?.mood || null,
        stress: latest?.stress_level ?? null,
        sleep: latest?.sleep_hours ?? null,
        note: latestJournal?.body || null,
      }));

      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('intent_tags, care_style_preference')
        .eq('user_id', session.participant_id)
        .maybeSingle();

      if (prefs) {
        setSnapshot((prev) => ({
          ...prev,
          concern: prefs.intent_tags?.[0] || null,
          stylePreference: prefs.care_style_preference || null,
        }));
      }
    };

    fetchTrend();
  }, [isTherapistMode, session.participant_id]);

  const joinAvailable = session.booking_status ? session.booking_status === 'confirmed' : true;
  const joinWindowOpen = secondsToWindow <= 0;
  const readinessText = !joinAvailable
    ? 'Awaiting therapist confirmation'
    : joinWindowOpen
      ? 'Session ready to join'
      : 'Join available 5 minutes before start';

  const countdownLabel = useMemo(() => {
    if (joinWindowOpen) return 'Join window is open';
    const mins = Math.floor(secondsToWindow / 60);
    const secs = secondsToWindow % 60;
    return `Join opens in ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, [joinWindowOpen, secondsToWindow]);

  const joinNow = () => {
    if (!joinAvailable) {
      showModal('blocking', 'Awaiting confirmation', 'This booking must be confirmed before joining.');
      return;
    }

    if (!joinWindowOpen) {
      showModal('info', 'Too early', 'Join opens 5 minutes before the session starts.');
      return;
    }

    navigation.navigate('VideoCall', { session });
  };

  const getRiskChip = () => {
    if (riskLevel === 'high') return { text: 'High Risk', bg: Colors.status.dangerSoft, color: Colors.status.danger };
    if (riskLevel === 'medium') return { text: 'Medium Risk', bg: Colors.status.warningSoft, color: Colors.status.warning };
    return { text: 'Stable', bg: Colors.status.successSoft, color: Colors.status.success };
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {!session?.booking_id ? (
        <ErrorState
          message="Session prep data is missing. Please return to Sessions and reopen this card."
          onRetry={() => navigateBackSafe(navigation, 'Main', { screen: 'SessionsTab' })}
        />
      ) : (
        <>
      <View style={styles.header}>
        <Button title="Back" variant="ghost" fullWidth={false} onPress={() => navigateBackSafe(navigation, 'Main', { screen: 'SessionsTab' })} />
        <Text style={styles.title}>Session Prep</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.participantCard}>
          <Avatar uri={session.participant_avatar} name={session.participant_name} size={56} />
          <View style={styles.participantInfo}>
            <Text style={styles.participantName}>{session.participant_name}</Text>
            <Text style={styles.participantSubtext}>
              {new Date(session.scheduled_start_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              {' · '}
              {new Date(session.scheduled_start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        </Card>

        <Card style={styles.countdownCard}>
          <Ionicons name={joinWindowOpen ? 'checkmark-circle-outline' : 'time-outline'} size={18} color={Colors.accent.primary} />
          <Text style={styles.countdownText}>{countdownLabel}</Text>
        </Card>

        <Card style={styles.readinessCard}>
          <Ionicons name={joinAvailable ? 'leaf-outline' : 'hourglass-outline'} size={16} color={Colors.accent.primary} />
          <Text style={styles.readinessText}>{readinessText}</Text>
        </Card>

        {!isTherapistMode ? (
          <>
            <Card>
              <Text style={styles.sectionTitle}>Session agenda</Text>
              <TextInput
                style={styles.textArea}
                placeholder="What would you like to focus on today?"
                placeholderTextColor={Colors.text.tertiary}
                multiline
                value={agenda}
                onChangeText={setAgenda}
              />
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>How are you feeling right now?</Text>
              <View style={styles.chipRow}>
                {FEELINGS.map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={[styles.chip, feeling === item && styles.chipActive]}
                    onPress={() => setFeeling(item)}
                  >
                    <Text style={[styles.chipText, feeling === item && styles.chipTextActive]}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Card>
          </>
        ) : (
          <Card>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Client snapshot (7 days)</Text>
              <View style={[styles.riskChip, { backgroundColor: getRiskChip().bg }]}>
                <Text style={[styles.riskChipText, { color: getRiskChip().color }]}>{getRiskChip().text}</Text>
              </View>
            </View>
            <Text style={styles.helper}>{riskReason}</Text>

             <View style={styles.snapshotGrid}>
              <SnapshotItem label="Reason" value={snapshot.concern || 'Not shared'} />
              <SnapshotItem label="Mood today" value={snapshot.mood || 'Not logged'} />
              <SnapshotItem label="Stress" value={snapshot.stress !== null ? `${snapshot.stress}/5` : 'Not logged'} />
              <SnapshotItem label="Sleep" value={snapshot.sleep !== null ? `${snapshot.sleep}h` : 'Not logged'} />
              <SnapshotItem label="Preferred style" value={snapshot.stylePreference || 'Not shared'} />
            </View>

            {snapshot.note ? (
              <View style={styles.noteBox}>
                <Text style={styles.noteTitle}>Pre-session note</Text>
                <Text style={styles.noteText} numberOfLines={3}>{snapshot.note}</Text>
              </View>
            ) : null}

            <View style={styles.promptBox}>
              <Text style={styles.promptTitle}>Suggested opener</Text>
              <Text style={styles.promptText}>"How have the last couple of days felt for you, especially outside session hours?"</Text>
            </View>
          </Card>
        )}

        <Button
          title="Join session"
          onPress={joinNow}
          disabled={!joinAvailable || !joinWindowOpen}
        />
      </ScrollView>
      </>
      )}
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

const SnapshotItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.snapshotItem}>
    <Text style={styles.snapshotLabel}>{label}</Text>
    <Text style={styles.snapshotValue} numberOfLines={1}>{value}</Text>
  </View>
);

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
    gap: Spacing.md,
    paddingBottom: Spacing.xxxxl + 24,
  },
  contentScroll: {
    flex: 1,
  },
  participantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.xl,
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  participantSubtext: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  countdownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.accent.soft,
    borderRadius: Radius.xl,
  },
  countdownText: {
    ...Typography.body,
    color: Colors.accent.dark,
    flex: 1,
  },
  readinessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.ui.glass,
    borderRadius: Radius.xl,
  },
  readinessText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  sectionTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  textArea: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Typography.body,
    color: Colors.text.primary,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderColor: Colors.stroke.medium,
    backgroundColor: Colors.ui.glass,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  chipActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  chipText: {
    ...Typography.body,
    color: Colors.text.secondary,
  },
  chipTextActive: {
    color: Colors.text.inverse,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  riskChip: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  riskChipText: {
    ...Typography.micro,
  },
  helper: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginBottom: Spacing.sm,
  },
  snapshotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  snapshotItem: {
    width: '48%',
    backgroundColor: Colors.ui.glass,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  snapshotLabel: {
    ...Typography.micro,
    color: Colors.text.tertiary,
  },
  snapshotValue: {
    ...Typography.captionEmphasis,
    color: Colors.text.primary,
    marginTop: 2,
  },
  noteBox: {
    backgroundColor: Colors.accent.soft,
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  noteTitle: {
    ...Typography.captionEmphasis,
    color: Colors.accent.dark,
  },
  noteText: {
    ...Typography.caption,
    color: Colors.accent.dark,
    marginTop: 2,
  },
  promptBox: {
    backgroundColor: Colors.ui.glass,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    padding: Spacing.sm,
    gap: 2,
  },
  promptTitle: {
    ...Typography.captionEmphasis,
    color: Colors.text.primary,
  },
  promptText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
});
