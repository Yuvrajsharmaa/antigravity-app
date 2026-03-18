import React, { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackendSetupCard, Button, Card, CoveMascot, CoveModal } from '../../../core/components';
import { Colors, Radius, Spacing, Typography } from '../../../core/theme';
import { useAuth } from '../../../core/context/AuthContext';
import { supabase } from '../../../services/supabase';
import { assessCareRisk } from '../../../core/utils/careRisk';
import {
  scheduleAdaptiveWellbeingReminders,
  triggerSupportiveNudgeNotification,
} from '../../../core/utils/wellbeingNotifications';
import {
  carePatternExplanation,
  calculateCareScoreBreakdown,
  getCarePatternState,
} from '../../../core/utils/careScore';
import {
  createCareNudgeEvent,
  getNudgeCooldownState,
  upsertDailyCheckIn,
} from '../../../core/services/careFlowService';
import { CoveModalVariant } from '../../../core/models/types';
import { localDateKey } from '../../../core/utils/date';
import { MOOD_OPTIONS, normalizeMoodLabel } from '../../../core/utils/mood';

interface DailyCheckInModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  backendReady: boolean;
  setupIssue: string | null;
  onRetrySetup: () => void;
}

const SLEEP_PRESETS = ['5', '6', '7', '8', '9'];

const parseSleepHours = (value: string) => {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  if (Number.isNaN(parsed)) return null;
  return parsed;
};

export const DailyCheckInModal: React.FC<DailyCheckInModalProps> = ({
  visible,
  onClose,
  onSuccess,
  backendReady,
  setupIssue,
  onRetrySetup,
}) => {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const [mood, setMood] = useState<string | null>(null);
  const [stress, setStress] = useState(3);
  const [sleep, setSleep] = useState('7');
  const [energy, setEnergy] = useState(3);
  const [connectedness, setConnectedness] = useState(3);
  const [coping, setCoping] = useState(3);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [isEditingToday, setIsEditingToday] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    variant: CoveModalVariant;
    title: string;
    message: string;
  }>({
    visible: false,
    variant: 'info',
    title: '',
    message: '',
  });

  const sleepHours = useMemo(() => parseSleepHours(sleep), [sleep]);
  const effectiveKeyboardHeight = useMemo(
    () => Math.max(0, keyboardHeight - (Platform.OS === 'ios' ? insets.bottom : 0)),
    [insets.bottom, keyboardHeight],
  );
  const sheetMaxHeight = useMemo(() => {
    const keyboardInset = Math.max(0, effectiveKeyboardHeight - Spacing.sm);
    const available = viewportHeight - insets.top - Spacing.lg - keyboardInset;
    // Keep this feeling like a full-height sheet (not a small floating card), while still
    // respecting top insets + keyboard.
    const preferred = viewportHeight * 0.92;
    return Math.max(360, Math.min(available, preferred));
  }, [effectiveKeyboardHeight, insets.top, viewportHeight]);

  const breakdown = useMemo(() => {
    const normalizedMood = normalizeMoodLabel(mood);
    if (!normalizedMood || sleepHours === null || sleepHours <= 0 || sleepHours > 24) return null;
    return calculateCareScoreBreakdown({
      mood: normalizedMood,
      stressLevel: stress,
      sleepHours,
      energyLevel: energy,
      connectednessLevel: connectedness,
      copingHelpfulness: coping,
    });
  }, [mood, sleepHours, stress, energy, connectedness, coping]);

  const patternState = useMemo(() => {
    if (!breakdown) return null;
    return getCarePatternState(breakdown.score, lastScore);
  }, [breakdown, lastScore]);

  const resetForm = () => {
    setStep(0);
    setMood(null);
    setStress(3);
    setSleep('7');
    setEnergy(3);
    setConnectedness(3);
    setCoping(3);
    setNote('');
    setIsEditingToday(false);
    setShowBreakdown(false);
    setFeedbackModal((prev) => ({ ...prev, visible: false }));
  };

  const showFeedback = (variant: CoveModalVariant, title: string, message: string) => {
    setFeedbackModal({
      visible: true,
      variant,
      title,
      message,
    });
  };

  useEffect(() => {
    if (!visible || !user?.id) {
      if (!visible) resetForm();
      return;
    }

    const loadToday = async () => {
      const today = localDateKey();
      const isMissingColumnError = (error: any, columnName: string) => {
        const code = `${error?.code || ''}`.toUpperCase();
        const message = `${error?.message || ''}`.toLowerCase();
        return code === '42703' || message.includes(columnName.toLowerCase());
      };

      let data: any = null;
      const modernQuery = await supabase
        .from('client_metrics')
        .select('mood, stress_level, sleep_hours, energy_level, connectedness_level, coping_helpfulness, care_score_snapshot, check_in_date')
        .eq('user_id', user.id)
        .eq('check_in_date', today)
        .maybeSingle();

      if (modernQuery.error) {
        const useLegacyPath =
          isMissingColumnError(modernQuery.error, 'check_in_date')
          || isMissingColumnError(modernQuery.error, 'energy_level')
          || isMissingColumnError(modernQuery.error, 'connectedness_level')
          || isMissingColumnError(modernQuery.error, 'coping_helpfulness');
        if (!useLegacyPath) {
          setIsEditingToday(false);
          return;
        }

        const dayStart = `${today}T00:00:00.000Z`;
        const dayEndDate = new Date(dayStart);
        dayEndDate.setUTCDate(dayEndDate.getUTCDate() + 1);

        const legacyQuery = await supabase
          .from('client_metrics')
          .select('mood, stress_level, sleep_hours, care_score_snapshot, created_at')
          .eq('user_id', user.id)
          .gte('created_at', dayStart)
          .lt('created_at', dayEndDate.toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (legacyQuery.error) {
          const scoreMissing = isMissingColumnError(legacyQuery.error, 'care_score_snapshot');
          if (!scoreMissing) {
            setIsEditingToday(false);
            return;
          }
          const freudFallback = await supabase
            .from('client_metrics')
            .select('mood, stress_level, sleep_hours, freud_score_snapshot, created_at')
            .eq('user_id', user.id)
            .gte('created_at', dayStart)
            .lt('created_at', dayEndDate.toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          data = freudFallback.data
            ? { ...freudFallback.data, care_score_snapshot: (freudFallback.data as any).freud_score_snapshot }
            : null;
        } else {
          data = legacyQuery.data;
        }
      } else {
        data = modernQuery.data;
      }

      if (data) {
        setMood(data.mood || null);
        setStress(data.stress_level ?? 3);
        setSleep(data.sleep_hours ? `${data.sleep_hours}` : '7');
        setEnergy(data.energy_level ?? 3);
        setConnectedness(data.connectedness_level ?? 3);
        setCoping(data.coping_helpfulness ?? 3);
        setIsEditingToday(true);
      } else {
        setIsEditingToday(false);
      }

      const { data: prevRows } = await supabase
        .from('client_metrics')
        .select('care_score_snapshot')
        .eq('user_id', user.id)
        .neq('check_in_date', today)
        .order('check_in_date', { ascending: false })
        .limit(1);
      if (prevRows) {
        setLastScore(prevRows?.[0]?.care_score_snapshot ?? null);
      } else {
        const previousLegacy = await supabase
          .from('client_metrics')
          .select('care_score_snapshot,created_at')
          .eq('user_id', user.id)
          .lt('created_at', `${today}T00:00:00.000Z`)
          .order('created_at', { ascending: false })
          .limit(1);
        if (!previousLegacy.error) {
          setLastScore(previousLegacy.data?.[0]?.care_score_snapshot ?? null);
        } else {
          const previousFreud = await supabase
            .from('client_metrics')
            .select('freud_score_snapshot,created_at')
            .eq('user_id', user.id)
            .lt('created_at', `${today}T00:00:00.000Z`)
            .order('created_at', { ascending: false })
            .limit(1);
          setLastScore((previousFreud.data?.[0] as any)?.freud_score_snapshot ?? null);
        }
      }
    };

    loadToday();
  }, [visible, user?.id]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const closeModal = () => {
    Keyboard.dismiss();
    onClose();
  };

  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(mood);
    if (step === 1) return sleepHours !== null && sleepHours > 0 && sleepHours <= 24;
    return true;
  }, [mood, sleepHours, step]);

  const saveCheckIn = async () => {
    if (!backendReady) {
      showFeedback('blocking', 'Setup required', setupIssue || 'Backend setup is not complete yet.');
      return;
    }

    const normalizedMood = normalizeMoodLabel(mood);
    if (!user?.id || !breakdown || !normalizedMood || sleepHours === null) {
      showFeedback('blocking', 'Missing details', 'Complete mood and wellbeing details to continue.');
      return;
    }

    setSaving(true);

    try {
      await upsertDailyCheckIn({
        userId: user.id,
        mood: normalizedMood,
        stressLevel: stress,
        sleepHours,
        energyLevel: energy,
        connectednessLevel: connectedness,
        copingHelpfulness: coping,
        note,
        checkInDate: localDateKey(),
      });

      const { data: riskMetrics } = await supabase
        .from('client_metrics')
        .select('created_at,check_in_date,stress_level,care_score_snapshot')
        .eq('user_id', user.id)
        .order('check_in_date', { ascending: false })
        .limit(5);

      const risk = assessCareRisk(riskMetrics || []);
      if (risk.level === 'high') {
        const cooldown = await getNudgeCooldownState({
          userId: user.id,
          source: 'system_auto',
          cooldownHours: 24,
        });

        if (!cooldown.isBlocked) {
          const supportiveMessage =
            'Your recent check-in suggests higher strain today. Your therapist can follow up if needed.';

          const { data: conversations } = await supabase
            .from('conversations')
            .select('therapist_id')
            .eq('user_id', user.id);

          const therapistIds = (conversations || [])
            .map((row) => row.therapist_id)
            .filter((id): id is string => Boolean(id));

          await createCareNudgeEvent({
            userId: user.id,
            therapistId: therapistIds[0] || null,
            triggerType: 'care_score_high_risk',
            riskLevel: 'high',
            source: 'system_auto',
            messagePreview: supportiveMessage,
          });

          await triggerSupportiveNudgeNotification();
        }
      }

      await scheduleAdaptiveWellbeingReminders(user.id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      showFeedback(
        'success',
        isEditingToday ? 'Check-in updated' : 'Check-in saved',
        'Your CareScore was updated for today.',
      );
    } catch (saveError: any) {
      showFeedback('error', 'Could not save', saveError.message || 'Please try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  const onPrimaryAction = () => {
    if (step < 2) {
      setStep((prev) => prev + 1);
      return;
    }
    saveCheckIn();
  };

  const onBackAction = () => {
    if (step === 0) {
      closeModal();
      return;
    }
    setStep((prev) => Math.max(0, prev - 1));
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={closeModal} />
          <View style={styles.keyboardWrap}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <View
                style={[
                  styles.sheet,
                  {
                    height: sheetMaxHeight,
                    marginTop: insets.top + Spacing.md,
                    paddingBottom: Math.max(insets.bottom + Spacing.xs, Spacing.lg),
                  },
                ]}
              >
                <View style={styles.sheetHandle} />
                <View style={styles.header}>
                  <Text style={styles.title}>Daily check-in</Text>
                  <TouchableOpacity
                    onPress={closeModal}
                    hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Close check-in"
                  >
                    <Ionicons name="close" size={22} color={Colors.text.primary} />
                  </TouchableOpacity>
                </View>

              {isEditingToday ? (
                <View style={styles.editBadge}>
                  <Ionicons name="create-outline" size={14} color={Colors.accent.primary} />
                  <Text style={styles.editBadgeText}>Edit today&apos;s check-in</Text>
                </View>
              ) : null}

              <View style={styles.stepRail}>
                {[0, 1, 2].map((railStep) => (
                  <View
                    key={railStep}
                    style={[
                      styles.stepRailDot,
                      railStep <= step && styles.stepRailDotActive,
                    ]}
                  />
                ))}
              </View>

              <View style={styles.helperLine}>
                <CoveMascot variant="default" size={48} />
                <Text style={styles.helperText}>Quick check-ins keep your care log clear.</Text>
              </View>

              {!backendReady ? (
                <BackendSetupCard
                  title="Setup required"
                  message={setupIssue || undefined}
                  onRetry={onRetrySetup}
                />
              ) : (
                <ScrollView
                  style={styles.contentScroll}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                  contentContainerStyle={styles.content}
                >
                  {step === 0 ? (
                    <Card style={styles.cardSection}>
                      <Text style={styles.stepTitle}>How are you feeling right now?</Text>
                      <View style={styles.optionGrid}>
                        {MOOD_OPTIONS.map((item) => {
                          const selected = mood === item.label;
                          return (
                            <TouchableOpacity
                              key={item.value}
                              style={[styles.choiceChip, selected && styles.choiceChipActive]}
                              onPress={() => setMood(item.label)}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                              accessibilityLabel={`${item.label} mood`}
                            >
                              <Text style={[styles.choiceChipText, selected && styles.choiceChipTextActive]}>
                                {item.emoji} {item.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </Card>
                  ) : null}

                  {step === 1 ? (
                    <Card style={styles.cardSection}>
                      <Text style={styles.stepTitle}>Today’s strain and recovery</Text>

                      <Text style={styles.fieldLabel}>Stress (1-5)</Text>
                      <SegmentRow value={stress} onChange={setStress} />

                      <Text style={styles.fieldLabel}>Sleep hours</Text>
                      <View style={styles.optionGrid}>
                        {SLEEP_PRESETS.map((item) => {
                          const selected = sleep === item;
                          return (
                            <TouchableOpacity
                              key={item}
                              style={[styles.choiceChip, selected && styles.choiceChipActive]}
                              onPress={() => setSleep(item)}
                            >
                              <Text style={[styles.choiceChipText, selected && styles.choiceChipTextActive]}>{item}h</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <Text style={styles.fieldLabel}>Energy (1-5)</Text>
                      <SegmentRow value={energy} onChange={setEnergy} />

                      <Text style={styles.fieldLabel}>Connectedness (1-5)</Text>
                      <SegmentRow value={connectedness} onChange={setConnectedness} />

                      <Text style={styles.fieldLabel}>Coping felt helpful (1-5)</Text>
                      <SegmentRow value={coping} onChange={setCoping} />
                    </Card>
                  ) : null}

                  {step === 2 ? (
                    <Card style={styles.cardSection}>
                      <Text style={styles.stepTitle}>Anything to note for today? (optional)</Text>
                      <TextInput
                        style={styles.noteInput}
                        placeholder="A few words are enough"
                        placeholderTextColor={Colors.text.tertiary}
                        multiline
                        value={note}
                        onChangeText={setNote}
                        accessibilityLabel="Check-in note"
                      />

                      <TouchableOpacity
                        style={styles.breakdownBtn}
                        onPress={() => setShowBreakdown(true)}
                        accessibilityRole="button"
                        accessibilityLabel="How CareScore works"
                      >
                        <Ionicons name="information-circle-outline" size={18} color={Colors.accent.primary} />
                        <Text style={styles.breakdownBtnText}>How we calculate CareScore</Text>
                      </TouchableOpacity>

                      {patternState ? (
                        <View style={styles.patternPreview}>
                          <Text style={styles.patternPreviewTitle}>Today&apos;s CareScore summary</Text>
                          <Text style={styles.patternPreviewLabel}>{patternState.label.replace('-', ' ')}</Text>
                          <Text style={styles.patternPreviewTrend}>
                            Current guidance: {patternState.trend === 'needs-support' ? 'needs support' : patternState.trend}
                          </Text>
                          <Text style={styles.patternPreviewGuidance}>{patternState.guidance}</Text>
                        </View>
                      ) : null}
                    </Card>
                  ) : null}
                </ScrollView>
              )}

              <View style={styles.bottomRow}>
                <Button
                  title={step === 0 ? 'Close' : 'Back'}
                  variant="ghost"
                  onPress={onBackAction}
                  fullWidth={false}
                  style={styles.backBtn}
                />
                <Button
                  title={step === 2 ? (saving ? 'Saving...' : 'Save check-in') : 'Continue'}
                  onPress={onPrimaryAction}
                  disabled={!canContinue || saving || !backendReady}
                  loading={saving}
                  style={styles.primaryBtn}
                />
              </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </View>
      </Modal>

      <Modal visible={showBreakdown} animationType="slide" transparent>
        <View style={styles.sheetOverlay}>
          <View style={styles.breakdownSheet}>
            <View style={styles.breakdownHeader}>
              <Text style={styles.breakdownTitle}>How we calculate CareScore</Text>
              <TouchableOpacity onPress={() => setShowBreakdown(false)}>
                <Ionicons name="close" size={22} color={Colors.text.primary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.breakdownLead}>
              CareScore is based on your check-ins (mood, stress, sleep) and overall patterns.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.breakdownContent}>
              {carePatternExplanation.factors.map((factor) => (
                <Card key={factor.id} style={styles.factorCard}>
                  <Text style={styles.factorTitle}>{factor.title}</Text>
                  <Text style={styles.factorSummary}>{factor.summary}</Text>
                </Card>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <CoveModal
        visible={feedbackModal.visible}
        variant={feedbackModal.variant}
        title={feedbackModal.title}
        message={feedbackModal.message}
        primaryAction={{
          label: feedbackModal.variant === 'success' ? 'Done' : 'Okay',
          onPress: () => {
            const wasSuccess = feedbackModal.variant === 'success';
            setFeedbackModal((prev) => ({ ...prev, visible: false }));
            if (wasSuccess) {
              onSuccess();
              closeModal();
            }
          },
        }}
        onDismiss={() => setFeedbackModal((prev) => ({ ...prev, visible: false }))}
      />
    </>
  );
};

const SegmentRow: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <View style={styles.segmentRow}>
    {[1, 2, 3, 4, 5].map((item) => {
      const selected = value === item;
      return (
        <TouchableOpacity
          key={item}
          onPress={() => onChange(item)}
          style={[styles.segmentItem, selected && styles.segmentItemActive]}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          accessibilityLabel={`Level ${item}`}
        >
          <Text style={[styles.segmentItemText, selected && styles.segmentItemTextActive]}>{item}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.ui.overlay,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  keyboardWrap: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
  },
  sheet: {
    // Solid background avoids the sheet feeling "small" by showing the tab bar behind it.
    backgroundColor: Colors.bg.primary,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    minHeight: 420,
    gap: Spacing.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: Radius.pill,
    backgroundColor: Colors.stroke.soft,
    marginTop: -Spacing.xs,
    marginBottom: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...Typography.title3,
    color: Colors.text.primary,
  },
  editBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.accent.primary + '35',
    backgroundColor: Colors.ui.glass,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  editBadgeText: {
    ...Typography.micro,
    color: Colors.accent.dark,
  },
  stepRail: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  stepRailDot: {
    flex: 1,
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.tertiary,
  },
  stepRailDotActive: {
    backgroundColor: Colors.accent.primary,
  },
  helperLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.ui.glass,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  helperText: {
    ...Typography.caption,
    color: Colors.text.secondary,
    flex: 1,
  },
  contentScroll: {
    flex: 1,
  },
  content: {
    paddingBottom: Spacing.xs,
  },
  cardSection: {
    gap: Spacing.sm,
    borderRadius: Radius.xl,
  },
  stepTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  fieldLabel: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    marginTop: Spacing.xs,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  choiceChip: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.ui.glass,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  choiceChipActive: {
    borderColor: Colors.accent.primary,
    backgroundColor: Colors.accent.soft,
  },
  choiceChipText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  choiceChipTextActive: {
    color: Colors.accent.dark,
    fontWeight: '700',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  segmentItem: {
    flex: 1,
    minHeight: 38,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.ui.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemActive: {
    borderColor: Colors.accent.primary,
    backgroundColor: Colors.accent.soft,
  },
  segmentItemText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  segmentItemTextActive: {
    color: Colors.accent.dark,
    fontWeight: '700',
  },
  noteInput: {
    minHeight: 120,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.medium,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    textAlignVertical: 'top',
    ...Typography.body,
    color: Colors.text.primary,
  },
  breakdownBtn: {
    marginTop: Spacing.xs,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakdownBtnText: {
    ...Typography.captionEmphasis,
    color: Colors.accent.primary,
  },
  patternPreview: {
    marginTop: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.ui.glass,
    padding: Spacing.sm,
  },
  patternPreviewTitle: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
  },
  patternPreviewLabel: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  patternPreviewTrend: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  patternPreviewGuidance: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: Spacing.xs,
  },
  bottomRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  backBtn: {
    minWidth: 110,
  },
  primaryBtn: {
    flex: 1,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.ui.overlay,
  },
  breakdownSheet: {
    maxHeight: '78%',
    backgroundColor: Colors.bg.primary,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  breakdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  breakdownTitle: {
    ...Typography.title3,
    color: Colors.text.primary,
    flex: 1,
  },
  breakdownLead: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginTop: Spacing.sm,
  },
  breakdownContent: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  factorCard: {
    borderRadius: Radius.lg,
    gap: 4,
  },
  factorTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  factorSummary: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
});
