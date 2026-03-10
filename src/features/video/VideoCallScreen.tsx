import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Avatar, Card, ErrorState } from '../../core/components';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../core/context/AuthContext';
import { completeSessionAndBooking } from '../../core/services/careFlowService';
import { asDependencyState, dependenciesReady, describeBlockingDependency } from '../../core/utils/flowDependencies';
import { careBuddyLine } from '../../core/utils/careBuddy';
import { VideoCallRouteSession } from '../../navigation/types';

export const VideoCallScreen: React.FC<{ route: any; navigation: any }> = ({
  route,
  navigation,
}) => {
  const [sessionState, setSessionState] = useState<VideoCallRouteSession | null>(route.params?.session || null);
  const { isTherapistMode } = useAuth();
  const [callState, setCallState] = useState<'waiting' | 'connecting' | 'active' | 'ended'>('waiting');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [truthIssue, setTruthIssue] = useState<string | null>(null);
  const [refreshingTruth, setRefreshingTruth] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const participantName = sessionState?.participant_name || sessionState?.therapist_name || 'Session participant';
  const participantAvatar = sessionState?.participant_avatar || sessionState?.therapist_avatar || null;
  const participantRoleLabel = isTherapistMode ? 'Client' : 'Therapist';

  const calculatedDuration = Math.round(
    (new Date(sessionState?.scheduled_end_at || Date.now()).getTime()
      - new Date(sessionState?.scheduled_start_at || Date.now()).getTime()) / 60000
  );
  const sessionDuration = Number.isFinite(calculatedDuration) && calculatedDuration > 0 ? calculatedDuration : 45;
  const totalSeconds = sessionDuration * 60;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const refreshSessionTruth = async () => {
    if (!sessionState?.id || !sessionState?.booking_id) {
      setTruthIssue('Session details are incomplete. Reopen this call from Sessions.');
      return false;
    }

    setRefreshingTruth(true);
    setTruthIssue(null);
    try {
      const [{ data: latestSession, error: sessionError }, { data: latestBooking, error: bookingError }] = await Promise.all([
        supabase
          .from('sessions')
          .select('id,status,video_call_id')
          .eq('id', sessionState.id)
          .maybeSingle(),
        supabase
          .from('bookings')
          .select('id,status,session_type,scheduled_start_at,scheduled_end_at')
          .eq('id', sessionState.booking_id)
          .maybeSingle(),
      ]);

      if (sessionError) throw sessionError;
      if (bookingError) throw bookingError;
      if (!latestSession || !latestBooking) {
        setTruthIssue('Session is not ready yet. Please refresh from Sessions.');
        return false;
      }
      if (latestBooking.status !== 'confirmed') {
        setTruthIssue('This booking is not confirmed yet.');
        return false;
      }
      if (['completed', 'cancelled'].includes(latestSession.status)) {
        setTruthIssue('This session is already closed.');
        return false;
      }

      setSessionState((prev: any) => ({
        ...prev,
        status: latestSession.status,
        video_call_id: latestSession.video_call_id,
        booking_status: latestBooking.status,
        session_type: latestBooking.session_type,
        scheduled_start_at: latestBooking.scheduled_start_at,
        scheduled_end_at: latestBooking.scheduled_end_at,
      }));
      return true;
    } catch (error: any) {
      setTruthIssue(error.message || 'Unable to verify session status right now.');
      return false;
    } finally {
      setRefreshingTruth(false);
    }
  };

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        if (prev >= totalSeconds - 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          endCall();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const startCall = async () => {
    const dependencies = [
      asDependencyState('session_id', 'Session room', Boolean(sessionState?.id), 'Ask therapist to confirm booking first.'),
      asDependencyState('booking_id', 'Booking details', Boolean(sessionState?.booking_id), 'Refresh sessions and try again.'),
      asDependencyState('participant', 'Participant', Boolean(participantName), 'Re-open this call from sessions.'),
    ];
    if (!dependenciesReady(dependencies)) {
      Alert.alert('Unavailable', describeBlockingDependency(dependencies) || 'This session is not ready to join yet.');
      return;
    }

    const isFresh = await refreshSessionTruth();
    if (!isFresh) return;

    setCallState('connecting');
    setElapsed(0);

    const now = new Date().toISOString();
    const joinPayload = isTherapistMode
      ? { joined_therapist_at: now }
      : { joined_user_at: now };

    const { error } = await supabase
      .from('sessions')
      .update({
        status: 'in_progress',
        ...joinPayload,
      })
      .eq('id', sessionState?.id || '');

    if (error) {
      setCallState('waiting');
      Alert.alert('Unable to join', error.message || 'Please try again.');
      return;
    }

    setTimeout(() => {
      setCallState('active');
      startTimer();
    }, 1200);
  };

  const endCall = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCallState('ended');

    try {
      await completeSessionAndBooking({
        sessionId: sessionState?.id,
        bookingId: sessionState?.booking_id,
      });
    } catch (error: any) {
      Alert.alert(
        'Session ended locally',
        error?.message || 'Call ended, but sync failed. Please refresh sessions.',
      );
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const remaining = totalSeconds - elapsed;

  if (callState === 'ended') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.endedContainer}>
          <View style={styles.endedIcon}>
            <Ionicons name="checkmark-circle" size={56} color={Colors.status.success} />
          </View>
          <Text style={styles.endedTitle}>Session complete</Text>
          <Text style={styles.endedSubtitle}>
            {isTherapistMode
              ? 'Wrap up with a quick follow-up action.'
              : 'Take 30 seconds to capture your post-session reflection.'}
          </Text>
          {!isTherapistMode ? (
            <Text style={styles.buddyLine}>{careBuddyLine('reflect')}</Text>
          ) : null}

          <View style={styles.endedActions}>
            <TouchableOpacity
              style={styles.endedBtn}
              onPress={() => {
                navigation.navigate('PostSessionReflection', { session: sessionState });
              }}
            >
              <Text style={styles.endedBtnText}>{isTherapistMode ? 'Open follow-up' : 'Reflect now'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.endedBtn, styles.endedBtnPrimary]}
              onPress={() => {
                navigation.navigate('Main', { screen: 'SessionsTab', params: { initialTab: 'past' } });
              }}
            >
              <Text style={[styles.endedBtnText, styles.endedBtnPrimaryText]}>Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (callState === 'waiting') {
    if (!sessionState?.participant_name && !sessionState?.therapist_name) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <ErrorState
            message="Session details are incomplete. Go back and open this call from Sessions."
            onRetry={() => navigation.goBack()}
          />
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.waitingContainer}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={22} color={Colors.text.primary} />
          </TouchableOpacity>

          <Card style={styles.waitingCard}>
            <Avatar uri={participantAvatar} name={participantName} size={72} />
            <Text style={styles.waitingName}>{participantName}</Text>
            <Text style={styles.waitingRole}>{participantRoleLabel}</Text>
            <Text style={styles.waitingTime}>
              {new Date(sessionState.scheduled_start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {' · '}{sessionDuration} min
            </Text>
          </Card>

          {truthIssue ? (
            <Card style={styles.truthIssueCard}>
              <Text style={styles.truthIssueText}>{truthIssue}</Text>
              <TouchableOpacity onPress={refreshSessionTruth}>
                <Text style={styles.truthIssueRetry}>{refreshingTruth ? 'Refreshing...' : 'Retry status check'}</Text>
              </TouchableOpacity>
            </Card>
          ) : null}

          <View style={styles.permissionsCard}>
            <PermissionRow icon="camera-outline" label="Camera" granted={!isCameraOff} />
            <PermissionRow icon="mic-outline" label="Microphone" granted={!isMuted} />
            <PermissionRow icon="volume-high-outline" label="Speaker" granted={isSpeakerOn} />
          </View>

          <View style={styles.previewControls}>
            <ControlButton
              icon={isMuted ? 'mic-off' : 'mic'}
              label="Mic"
              active={!isMuted}
              onPress={() => setIsMuted(!isMuted)}
            />
            <ControlButton
              icon={isCameraOff ? 'videocam-off' : 'videocam'}
              label="Camera"
              active={!isCameraOff}
              onPress={() => setIsCameraOff(!isCameraOff)}
            />
            <ControlButton
              icon={isSpeakerOn ? 'volume-high' : 'volume-mute'}
              label="Speaker"
              active={isSpeakerOn}
              onPress={() => setIsSpeakerOn(!isSpeakerOn)}
            />
          </View>

          <TouchableOpacity style={styles.joinBtn} onPress={startCall}>
            <Ionicons name="videocam" size={22} color={Colors.text.inverse} />
            <Text style={styles.joinBtnText}>Join session</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.callContainer}>
      <View style={styles.remoteVideo}>
        <Avatar uri={participantAvatar} name={participantName} size={120} />
        {callState === 'connecting' && (
          <Text style={styles.connectingText}>Connecting...</Text>
        )}
      </View>

      <SafeAreaView style={styles.topOverlay}>
        <View style={styles.topBar}>
          <Text style={styles.callName}>{participantName}</Text>
          <View style={[styles.timerBadge, remaining < 300 && styles.timerWarning]}>
            <Ionicons name="time-outline" size={14} color={remaining < 300 ? Colors.status.danger : Colors.text.inverse} />
              <Text style={[styles.timerText, remaining < 300 && styles.timerTextWarning]}>
                {formatTime(Math.max(remaining, 0))}
              </Text>
          </View>
        </View>
      </SafeAreaView>

      <View style={styles.localPreview}>
        {isCameraOff ? (
          <View style={styles.localPreviewOff}>
            <Ionicons name="person" size={28} color={Colors.text.tertiary} />
          </View>
        ) : (
          <View style={styles.localPreviewActive}>
            <Text style={styles.localPreviewLabel}>You</Text>
          </View>
        )}
      </View>

      <SafeAreaView style={styles.bottomOverlay} edges={['bottom']}>
        <View style={styles.callControls}>
          <ControlButton
            icon={isMuted ? 'mic-off' : 'mic'}
            active={!isMuted}
            onPress={() => setIsMuted(!isMuted)}
          />
          <ControlButton
            icon={isCameraOff ? 'videocam-off' : 'videocam'}
            active={!isCameraOff}
            onPress={() => setIsCameraOff(!isCameraOff)}
          />
          <ControlButton
            icon={isSpeakerOn ? 'volume-high' : 'volume-mute'}
            active={isSpeakerOn}
            onPress={() => setIsSpeakerOn(!isSpeakerOn)}
          />
          <TouchableOpacity style={styles.endCallBtn} onPress={endCall}>
            <Ionicons name="call" size={24} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
};

const PermissionRow: React.FC<{ icon: string; label: string; granted: boolean }> = ({
  icon,
  label,
  granted,
}) => (
  <View style={permStyles.row}>
    <Ionicons name={icon as any} size={18} color={Colors.text.secondary} />
    <Text style={permStyles.label}>{label}</Text>
    <Ionicons
      name={granted ? 'checkmark-circle' : 'close-circle'}
      size={18}
      color={granted ? Colors.status.success : Colors.status.danger}
    />
  </View>
);

const ControlButton: React.FC<{
  icon: string;
  label?: string;
  active: boolean;
  onPress: () => void;
}> = ({ icon, label, active, onPress }) => (
  <TouchableOpacity style={ctrlStyles.btn} onPress={onPress}>
    <View style={[ctrlStyles.circle, !active && ctrlStyles.circleInactive]}>
      <Ionicons name={icon as any} size={22} color={active ? Colors.text.inverse : Colors.text.secondary} />
    </View>
    {label && <Text style={ctrlStyles.label}>{label}</Text>}
  </TouchableOpacity>
);

const permStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 6,
  },
  label: { ...Typography.body, color: Colors.text.primary, flex: 1 },
});

const ctrlStyles = StyleSheet.create({
  btn: { alignItems: 'center', gap: 4 },
  circle: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: Colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleInactive: {
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  label: { ...Typography.caption, color: Colors.text.secondary },
});

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg.primary },

  waitingContainer: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.bg.primary,
  },
  closeBtn: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.xl,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  waitingCard: {
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xl,
    width: '100%',
  },
  waitingName: { ...Typography.title2, color: Colors.text.primary },
  waitingRole: { ...Typography.caption, color: Colors.text.secondary },
  waitingTime: { ...Typography.body, color: Colors.text.secondary },
  permissionsCard: {
    width: '100%',
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    marginBottom: Spacing.xl,
  },
  truthIssueCard: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
    width: '100%',
  },
  truthIssueText: {
    ...Typography.caption,
    color: Colors.status.danger,
  },
  truthIssueRetry: {
    ...Typography.captionEmphasis,
    color: Colors.accent.primary,
  },
  previewControls: {
    flexDirection: 'row',
    gap: Spacing.xl,
    marginBottom: Spacing.xxl,
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    width: '100%',
    paddingVertical: Spacing.md,
    backgroundColor: Colors.accent.primary,
    borderRadius: Radius.lg,
  },
  joinBtnText: { ...Typography.bodySemibold, color: Colors.text.inverse },

  callContainer: { flex: 1, backgroundColor: '#E9EFEA' },
  remoteVideo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DCE7DE',
  },
  connectingText: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginTop: Spacing.md,
    opacity: 0.7,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
  },
  callName: { ...Typography.bodySemibold, color: Colors.text.primary },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  timerWarning: { backgroundColor: Colors.status.dangerSoft },
  timerText: { ...Typography.captionEmphasis, color: Colors.text.primary },
  timerTextWarning: { color: Colors.status.danger },
  localPreview: {
    position: 'absolute',
    bottom: 140,
    right: Spacing.xl,
    width: 100,
    height: 140,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: Colors.bg.secondary,
  },
  localPreviewOff: {
    flex: 1,
    backgroundColor: '#EBEFEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  localPreviewActive: {
    flex: 1,
    backgroundColor: '#BED1C2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  localPreviewLabel: { ...Typography.caption, color: Colors.text.primary, opacity: 0.7 },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(247,248,245,0.92)',
    borderTopWidth: 1,
    borderTopColor: Colors.stroke.subtle,
  },
  callControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  endCallBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.status.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },

  endedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  endedIcon: { marginBottom: Spacing.lg },
  endedTitle: { ...Typography.title1, color: Colors.text.primary, marginBottom: Spacing.xs },
  endedSubtitle: { ...Typography.body, color: Colors.text.secondary, textAlign: 'center', lineHeight: 22 },
  buddyLine: {
    ...Typography.body,
    color: Colors.accent.primary,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  endedActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xxl,
    width: '100%',
  },
  endedBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent.soft,
  },
  endedBtnPrimary: {
    backgroundColor: Colors.accent.primary,
  },
  endedBtnText: { ...Typography.bodyEmphasis, color: Colors.accent.primary },
  endedBtnPrimaryText: { color: Colors.text.inverse },
});
