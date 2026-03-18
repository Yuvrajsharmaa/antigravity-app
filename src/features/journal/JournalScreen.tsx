import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
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
import {
  Button,
  Card,
  CoveMascot,
  CoveModal,
  EmptyState,
  ErrorState,
  LoadingState,
  PillChip,
  ScreenScaffold,
} from '../../core/components';
import { Colors, Radius, Spacing, Typography } from '../../core/theme';
import { useAuth } from '../../core/context/AuthContext';
import { useCareCalendar } from '../../core/hooks/useCareCalendar';
import { useTabSafeBottomPadding } from '../../core/hooks/useTabSafeBottomPadding';
import { supabase } from '../../services/supabase';
import { createJournalEntry, fetchJournalEntries } from '../../core/services/careFlowService';
import { CoveModalVariant, JournalEntry, JournalEntryType } from '../../core/models/types';
import { navigateBackSafe } from '../../navigation/safeBack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { localDateKey } from '../../core/utils/date';

type FilterType = 'all' | JournalEntryType;
type JournalMode = 'write' | 'history';

type JournalRow = JournalEntry & {
  source: 'journal_entries' | 'legacy_metrics';
};

const FILTER_OPTIONS: Array<{ label: string; value: FilterType }> = [
  { label: 'All', value: 'all' },
  { label: 'Daily', value: 'daily_reflection' },
  { label: 'Post-session', value: 'post_session_reflection' },
];

const PROMPT_CHIPS = [
  'What felt heavy today?',
  'What helped even a little?',
  'One next step for tomorrow',
];

const moodText = (entry: JournalRow) => {
  const parts: string[] = [];
  if (entry.mood) parts.push(`Mood: ${entry.mood}`);
  if (entry.stress_level !== null) parts.push(`Stress: ${entry.stress_level}`);
  if (entry.sleep_hours !== null) parts.push(`Sleep: ${entry.sleep_hours}h`);
  return parts.join(' · ');
};

export const JournalScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const tabSafeBottomPadding = useTabSafeBottomPadding(Spacing.xxl);

  const [entries, setEntries] = useState<JournalRow[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todayMetricId, setTodayMetricId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [mode, setMode] = useState<JournalMode>('write');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<JournalRow | null>(null);
  const [entryDraft, setEntryDraft] = useState('');
  const [entrySaving, setEntrySaving] = useState(false);
  const [detailKeyboardHeight, setDetailKeyboardHeight] = useState(0);

  const [feedback, setFeedback] = useState<{
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

  const filteredEntries = useMemo(() => {
    const base = filter === 'all'
      ? entries
      : entries.filter((entry) => entry.entry_type === filter);
    if (!selectedDateKey) return base;
    return base.filter((entry) => localDateKey(entry.created_at) === selectedDateKey);
  }, [entries, filter, selectedDateKey]);

  const { month: careMonth } = useCareCalendar(user?.id, calendarMonth);
  const calendarCellSize = useMemo(() => {
    // Size cells based on real viewport width so the calendar feels "large" and readable.
    // Assumes calendar card uses: marginHorizontal=Spacing.xl, padding=Spacing.lg.
    const cardInnerWidth = Math.max(0, viewportWidth - Spacing.xl * 2 - Spacing.lg * 2);
    const gap = Spacing.xs;
    const totalGaps = gap * 6;
    const raw = Math.floor((cardInnerWidth - totalGaps) / 7);
    return Math.max(38, Math.min(48, raw));
  }, [viewportWidth]);

  const calendarCells = useMemo(() => {
    if (!careMonth) return [];
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    // Monday-first offset.
    const offset = (first.getDay() + 6) % 7;
    const blanks = Array.from({ length: offset }).map((_, idx) => ({ kind: 'blank' as const, key: `blank-${idx}` }));
    const todayKey = localDateKey();
    const days = careMonth.days.map((day) => ({
      kind: 'day' as const,
      key: day.date,
      dateKey: day.date,
      dayNumber: Number.parseInt(day.date.slice(8, 10), 10),
      hasJournal: day.hasJournal,
      isToday: day.date === todayKey,
      isSelected: selectedDateKey === day.date,
    }));
    return [...blanks, ...days];
  }, [calendarMonth, careMonth, selectedDateKey]);

  const goPrevMonth = () => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const goNextMonth = () => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));

  const loadJournal = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);

      const [{ data: metricToday, error: metricTodayError }, journalRows, legacyRows] = await Promise.all([
        supabase
          .from('client_metrics')
          .select('id')
          .eq('user_id', user.id)
          .eq('check_in_date', localDateKey())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        fetchJournalEntries(user.id),
        supabase
          .from('client_metrics')
          .select('id, created_at, mood, stress_level, sleep_hours, journal_entry')
          .eq('user_id', user.id)
          .not('journal_entry', 'is', null)
          .order('created_at', { ascending: false }),
      ]);

      if (metricTodayError) throw metricTodayError;
      if (legacyRows.error) throw legacyRows.error;

      setTodayMetricId(metricToday?.id || null);

      const normalizedFromJournal = (journalRows || []).map((row) => ({
        ...row,
        source: 'journal_entries' as const,
      }));

      const normalizedLegacy = ((legacyRows.data || []) as any[])
        .filter((row) => Boolean(row.journal_entry && String(row.journal_entry).trim().length))
        .map((row) => ({
          id: `legacy-${row.id}`,
          user_id: user.id,
          entry_type: 'daily_reflection' as const,
          title: 'Legacy journal entry',
          body: row.journal_entry as string,
          mood: row.mood,
          stress_level: row.stress_level,
          sleep_hours: row.sleep_hours,
          care_score_snapshot: null,
          metric_id: row.id,
          session_id: null,
          created_at: row.created_at,
          updated_at: row.created_at,
          source: 'legacy_metrics' as const,
        }));

      const seenBodies = new Set<string>();
      const merged = [...normalizedFromJournal, ...normalizedLegacy].filter((row) => {
        const key = `${new Date(row.created_at).toISOString().slice(0, 16)}-${row.body.trim()}`;
        if (seenBodies.has(key)) return false;
        seenBodies.add(key);
        return true;
      });

      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setEntries(merged);
    } catch (loadErr: any) {
      const code = `${loadErr?.code || ''}`;
      if (code === '42P01') {
        setError('Journal table is missing. Run the latest Supabase migration to enable Journal v2.');
      } else {
        setError(loadErr.message || 'Unable to load journal right now.');
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadJournal();
  }, [loadJournal]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setDetailKeyboardHeight(event.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setDetailKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const showFeedback = (variant: 'info' | 'success' | 'error' | 'blocking', title: string, message: string) => {
    setFeedback({ visible: true, variant, title, message });
  };

  const saveEntry = async () => {
    if (!user?.id) return;

    const body = draft.trim();
    if (!body) {
      showFeedback('blocking', 'Write first', 'Add a short line before saving.');
      return;
    }

    setSaving(true);
    try {
      await createJournalEntry({
        userId: user.id,
        entryType: 'daily_reflection',
        title: 'Daily journal',
        body,
        metricId: todayMetricId,
      });

      setDraft('');
      setMode('history');
      await loadJournal();
      showFeedback('success', 'Journal saved', 'Your entry is now in history.');
    } catch (saveError: any) {
      showFeedback('error', 'Save failed', saveError.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const applyPrompt = (prompt: string) => {
    setDraft((prev) => (prev.trim().length ? `${prev.trim()}\n\n${prompt}\n` : `${prompt}\n`));
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const openEntry = (entry: JournalRow) => {
    setSelectedEntry(entry);
    setEntryDraft(entry.body);
  };

  const saveEntryChanges = async () => {
    if (!selectedEntry || selectedEntry.source !== 'journal_entries') return;
    const nextBody = entryDraft.trim();
    if (!nextBody) {
      showFeedback('blocking', 'Entry is empty', 'Write a line before saving changes.');
      return;
    }

    setEntrySaving(true);
    const { error: updateError } = await supabase
      .from('journal_entries')
      .update({
        body: nextBody,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedEntry.id);

    setEntrySaving(false);

    if (updateError) {
      showFeedback('error', 'Could not update', updateError.message || 'Please try again.');
      return;
    }

    setSelectedEntry(null);
    await loadJournal();
    showFeedback('success', 'Updated', 'Your journal entry was updated.');
  };

  const deleteEntry = async () => {
    if (!selectedEntry || selectedEntry.source !== 'journal_entries') return;

    setEntrySaving(true);
    const { error: deleteError } = await supabase
      .from('journal_entries')
      .delete()
      .eq('id', selectedEntry.id);

    setEntrySaving(false);

    if (deleteError) {
      showFeedback('error', 'Could not delete', deleteError.message || 'Please try again.');
      return;
    }

    setSelectedEntry(null);
    await loadJournal();
    showFeedback('success', 'Deleted', 'The entry has been removed.');
  };

  const renderEntry = ({ item }: { item: JournalRow }) => (
    <TouchableOpacity activeOpacity={0.86} onPress={() => openEntry(item)}>
      <Card style={styles.entryCard}>
        <View style={styles.entryHeader}>
          <Text style={styles.entryDate}>{formatDate(item.created_at)}</Text>
          <View
            style={[
              styles.typePill,
              item.entry_type === 'post_session_reflection' && styles.typePillSession,
            ]}
          >
            <Text style={styles.typePillText}>
              {item.entry_type === 'post_session_reflection' ? 'Post-session' : 'Daily'}
            </Text>
          </View>
        </View>

        {item.title ? <Text style={styles.entryTitle}>{item.title}</Text> : null}
        <Text style={styles.entryBody} numberOfLines={3}>{item.body}</Text>

        {moodText(item) ? <Text style={styles.entryMeta}>{moodText(item)}</Text> : null}
      </Card>
    </TouchableOpacity>
  );

  const detailSheetMaxHeight = Math.max(
    360,
    Math.min(
      viewportHeight * 0.9,
      viewportHeight - insets.top - Math.max(detailKeyboardHeight - insets.bottom, 0) - Spacing.md,
    ),
  );

  return (
    <ScreenScaffold scroll={false}>
      <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigateBackSafe(navigation, 'HomeMain')}>
          <Ionicons name="chevron-back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Journal</Text>
        <View style={styles.backBtnGhost} />
      </View>

      <View style={styles.modeRow}>
        <TouchableOpacity
          onPress={() => setMode('write')}
          style={[styles.modeTab, mode === 'write' && styles.modeTabActive]}
        >
          <Text style={[styles.modeTabText, mode === 'write' && styles.modeTabTextActive]}>Write</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setMode('history')}
          style={[styles.modeTab, mode === 'history' && styles.modeTabActive]}
        >
          <Text style={[styles.modeTabText, mode === 'history' && styles.modeTabTextActive]}>History</Text>
        </TouchableOpacity>
      </View>

      {mode === 'write' ? (
        <>
          <Card style={styles.composeCard}>
            <View style={styles.composeHero}>
              <CoveMascot variant="listening" size={56} />
              <Text style={styles.composeTitle}>Today&apos;s entry</Text>
            </View>

            <Text style={styles.composeSubtitle}>Write briefly. Keep it honest and practical.</Text>

            <View style={styles.promptRow}>
              {PROMPT_CHIPS.map((prompt) => (
                <PillChip
                  key={prompt}
                  label={prompt}
                  selected={false}
                  onPress={() => applyPrompt(prompt)}
                />
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Write what felt important today"
              placeholderTextColor={Colors.text.tertiary}
              multiline
              value={draft}
              onChangeText={setDraft}
            />

            <Button
              title={saving ? 'Saving...' : 'Save journal'}
              onPress={saveEntry}
              loading={saving}
              disabled={saving}
            />
          </Card>

          {entries.length > 0 ? (
            <TouchableOpacity style={styles.historyJump} onPress={() => setMode('history')}>
              <Text style={styles.historyJumpText}>View recent entries</Text>
              <Ionicons name="arrow-forward" size={16} color={Colors.accent.primary} />
            </TouchableOpacity>
          ) : null}
        </>
      ) : (
        <>
          <Card style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity style={styles.calendarNavBtn} onPress={goPrevMonth} accessibilityRole="button">
                <Ionicons name="chevron-back" size={18} color={Colors.text.primary} />
              </TouchableOpacity>
              <Text style={styles.calendarMonthLabel}>{careMonth?.monthLabel || 'Calendar'}</Text>
              <TouchableOpacity style={styles.calendarNavBtn} onPress={goNextMonth} accessibilityRole="button">
                <Ionicons name="chevron-forward" size={18} color={Colors.text.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarWeekRow}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label) => (
                <Text key={label} style={[styles.calendarWeekLabel, { width: calendarCellSize }]}>{label}</Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarCells.map((cell) => {
                if (cell.kind === 'blank') {
                  return (
                    <View
                      key={cell.key}
                      style={[styles.calendarBlank, { width: calendarCellSize, height: calendarCellSize + 4 }]}
                    />
                  );
                }
                return (
                  <TouchableOpacity
                    key={cell.key}
                    style={[
                      styles.calendarCell,
                      { width: calendarCellSize, height: calendarCellSize + 4 },
                      cell.isToday && styles.calendarCellToday,
                      cell.isSelected && styles.calendarCellSelected,
                    ]}
                    onPress={() => setSelectedDateKey((prev) => (prev === cell.dateKey ? null : cell.dateKey))}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${cell.dateKey}`}
                  >
                    <Text style={styles.calendarDayText}>{cell.dayNumber}</Text>
                    {cell.hasJournal ? <View style={styles.calendarDot} /> : <View style={styles.calendarDotSpacer} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.calendarFooterRow}>
              <View style={styles.calendarLegend}>
                <View style={styles.calendarDotLegend} />
                <Text style={styles.calendarFooterHint}>Journal entry</Text>
              </View>
              <TouchableOpacity
                style={styles.calendarClearBtn}
                onPress={() => setSelectedDateKey(null)}
                disabled={!selectedDateKey}
              >
                <Text style={[styles.calendarClearText, !selectedDateKey && styles.calendarClearTextDisabled]}>
                  Clear day
                </Text>
              </TouchableOpacity>
            </View>
          </Card>

          <View style={styles.filterRow}>
            {FILTER_OPTIONS.map((option) => (
              <PillChip
                key={option.value}
                label={option.label}
                selected={filter === option.value}
                onPress={() => setFilter(option.value)}
              />
            ))}
          </View>

          {loading ? (
            <LoadingState message="Loading journal..." style={styles.stateSpacing} />
          ) : error ? (
            <ErrorState message={error} onRetry={loadJournal} style={styles.stateSpacing} />
          ) : filteredEntries.length === 0 ? (
            <EmptyState
              icon="journal-outline"
              title="No journal entries yet"
              message="Your entries will appear here once you save your first note."
              style={styles.stateSpacing}
            />
          ) : (
            <FlatList
              data={filteredEntries}
              keyExtractor={(item) => item.id}
              renderItem={renderEntry}
              contentContainerStyle={[styles.listContent, { paddingBottom: tabSafeBottomPadding }]}
              ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}

      <Modal
        visible={Boolean(selectedEntry)}
        transparent
        animationType="slide"
        onRequestClose={() => {
          Keyboard.dismiss();
          setSelectedEntry(null);
        }}
      >
        <View style={styles.detailOverlay}>
          <Pressable
            style={styles.detailBackdrop}
            onPress={() => {
              Keyboard.dismiss();
              setSelectedEntry(null);
            }}
          />
          <View style={styles.detailKeyboardWrap}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View
            style={[
              styles.detailSheet,
              {
                maxHeight: detailSheetMaxHeight,
                marginTop: insets.top + Spacing.md,
                paddingBottom:
                  Math.max(insets.bottom, Spacing.lg)
                  + (Platform.OS === 'android' ? Math.min(detailKeyboardHeight, 100) : 0),
              },
            ]}
          >
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Entry detail</Text>
              <View style={styles.detailHeaderActions}>
                <TouchableOpacity onPress={Keyboard.dismiss} style={styles.keyboardDoneBtn}>
                  <Text style={styles.keyboardDoneText}>Done</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    Keyboard.dismiss();
                    setSelectedEntry(null);
                  }}
                >
                  <Ionicons name="close" size={22} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>
            </View>

            {selectedEntry ? (
              <ScrollView
                style={styles.detailScroll}
                contentContainerStyle={styles.detailScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.detailDate}>{formatDate(selectedEntry.created_at)}</Text>
                <TextInput
                  style={styles.detailInput}
                  multiline
                  value={entryDraft}
                  onChangeText={setEntryDraft}
                  editable={selectedEntry.source === 'journal_entries'}
                />

                {selectedEntry.source === 'journal_entries' ? (
                  <View style={styles.detailActions}>
                    <Button
                      title="Delete"
                      variant="danger"
                      onPress={deleteEntry}
                      loading={entrySaving}
                      fullWidth={false}
                      style={styles.detailBtn}
                    />
                    <Button
                      title="Save changes"
                      onPress={saveEntryChanges}
                      loading={entrySaving}
                      fullWidth={false}
                      style={styles.detailBtn}
                    />
                  </View>
                ) : (
                  <Text style={styles.legacyHint}>Legacy entries are read-only.</Text>
                )}
              </ScrollView>
            ) : null}
          </View>
          </TouchableWithoutFeedback>
          </View>
        </View>
      </Modal>

      <CoveModal
        visible={feedback.visible}
        variant={feedback.variant}
        title={feedback.title}
        message={feedback.message}
        primaryAction={{
          label: 'Okay',
          onPress: () => setFeedback((prev) => ({ ...prev, visible: false })),
        }}
        onDismiss={() => setFeedback((prev) => ({ ...prev, visible: false }))}
      />
      </View>
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnGhost: {
    width: 40,
    height: 40,
  },
  title: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  modeRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xs,
    backgroundColor: Colors.bg.tertiary,
    borderRadius: Radius.lg,
    padding: 4,
    gap: 4,
  },
  modeTab: {
    flex: 1,
    borderRadius: Radius.md,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTabActive: {
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  modeTabText: {
    ...Typography.body,
    color: Colors.text.secondary,
  },
  modeTabTextActive: {
    color: Colors.text.primary,
    fontWeight: '700',
  },
  composeCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  composeHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  composeTitle: {
    ...Typography.title3,
    color: Colors.text.primary,
  },
  composeSubtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  promptRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  input: {
    minHeight: 140,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.stroke.medium,
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    textAlignVertical: 'top',
    ...Typography.body,
    color: Colors.text.primary,
  },
  historyJump: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyJumpText: {
    ...Typography.bodyEmphasis,
    color: Colors.accent.primary,
  },
  calendarCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarNavBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthLabel: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  calendarWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  calendarWeekLabel: {
    ...Typography.micro,
    color: Colors.text.tertiary,
    width: 34,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  calendarBlank: {
    width: 34,
    height: 38,
  },
  calendarCell: {
    width: 34,
    height: 38,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.ui.glass,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  calendarCellToday: {
    borderColor: Colors.accent.primary,
  },
  calendarCellSelected: {
    backgroundColor: Colors.accent.soft,
    borderColor: Colors.accent.primary,
  },
  calendarDayText: {
    ...Typography.micro,
    color: Colors.text.primary,
  },
  calendarDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.status.warning,
  },
  calendarDotSpacer: {
    width: 6,
    height: 6,
  },
  calendarFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calendarDotLegend: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.status.warning,
  },
  calendarFooterHint: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  calendarClearBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  calendarClearText: {
    ...Typography.captionEmphasis,
    color: Colors.accent.primary,
  },
  calendarClearTextDisabled: {
    color: Colors.text.tertiary,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  stateSpacing: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxxl,
  },
  entryCard: {
    gap: Spacing.xs,
    borderRadius: Radius.xl,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryDate: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  typePill: {
    borderRadius: Radius.pill,
    backgroundColor: Colors.semanticSoft.insight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  typePillSession: {
    backgroundColor: Colors.semanticSoft.warning,
  },
  typePillText: {
    ...Typography.micro,
    color: Colors.text.secondary,
  },
  entryTitle: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
  },
  entryBody: {
    ...Typography.body,
    color: Colors.text.primary,
    lineHeight: 24,
  },
  entryMeta: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  detailOverlay: {
    flex: 1,
    backgroundColor: Colors.ui.overlay,
  },
  detailBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  detailKeyboardWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  detailSheet: {
    backgroundColor: Colors.bg.secondary,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
  },
  detailScroll: {
    flexGrow: 0,
  },
  detailScrollContent: {
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  keyboardDoneBtn: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: Colors.bg.tertiary,
  },
  keyboardDoneText: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
  },
  detailTitle: {
    ...Typography.title3,
    color: Colors.text.primary,
  },
  detailDate: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  detailInput: {
    minHeight: 160,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.tertiary,
    padding: Spacing.sm,
    textAlignVertical: 'top',
    ...Typography.body,
    color: Colors.text.primary,
  },
  detailActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  detailBtn: {
    flex: 1,
  },
  legacyHint: {
    ...Typography.caption,
    color: Colors.text.tertiary,
  },
});
