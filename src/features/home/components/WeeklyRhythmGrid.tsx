import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography } from '../../../core/theme';

export type WeeklyRhythmDay = {
  label: string;
  careDone: boolean;
  journalDone: boolean;
  isToday: boolean;
};

export const WeeklyRhythmGrid: React.FC<{ days: WeeklyRhythmDay[] }> = ({ days }) => {
  const renderCell = (done: boolean, tone: 'care' | 'journal', isToday: boolean) => {
    const filledStyle = tone === 'care' ? styles.cellCareDone : styles.cellJournalDone;
    const cellStyle = [
      styles.cell,
      done ? filledStyle : styles.cellIdle,
      isToday && styles.cellTodayRing,
    ];

    const iconColor = done
      ? tone === 'care'
        ? Colors.accent.dark
        : Colors.status.warning
      : 'transparent';
    return (
      <View style={cellStyle}>
        <Ionicons name="checkmark" size={9} color={iconColor} />
      </View>
    );
  };

  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        <View style={styles.rowLabelSpacer} />
        <View style={styles.cellsRow}>
          {days.map((day, idx) => (
            <View key={`dow-wrap-${idx}`} style={styles.cellWrap}>
              <Text style={styles.dayLabel}>{day.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Check-in</Text>
        <View style={styles.cellsRow}>
          {days.map((day, idx) => (
            <View key={`care-${idx}`} style={styles.cellWrap}>
              {renderCell(day.careDone, 'care', day.isToday)}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Journal</Text>
        <View style={styles.cellsRow}>
          {days.map((day, idx) => (
            <View key={`journal-${idx}`} style={styles.cellWrap}>
              {renderCell(day.journalDone, 'journal', day.isToday)}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

const LABEL_COL = 68;
const CELL_SIZE = 20;
const CELL_GAP = 8;
const DAYS = 7;
const CELLS_ROW_WIDTH = (CELL_SIZE * DAYS) + (CELL_GAP * (DAYS - 1));

const styles = StyleSheet.create({
  grid: {
    gap: Spacing.xs,
    alignSelf: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
  },
  rowLabelSpacer: {
    width: LABEL_COL,
  },
  rowLabel: {
    width: LABEL_COL,
    ...Typography.caption,
    color: Colors.text.tertiary,
    textTransform: 'none',
    letterSpacing: 0,
    lineHeight: 18,
  },
  dayLabel: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'center',
  },
  cellsRow: {
    width: CELLS_ROW_WIDTH,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: CELL_GAP,
  },
  cellWrap: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellIdle: {
    backgroundColor: Colors.bg.tertiary,
    borderColor: Colors.stroke.medium,
  },
  cellCareDone: {
    backgroundColor: Colors.accent.soft,
    borderColor: Colors.accent.primary + '55',
  },
  cellJournalDone: {
    backgroundColor: Colors.status.warningSoft,
    borderColor: Colors.status.warning + '55',
  },
  cellTodayRing: {
    borderWidth: 2,
  },
});
