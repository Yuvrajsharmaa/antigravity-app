import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing, Typography } from '../../../core/theme';

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

    const iconColor = done ? Colors.text.inverse : 'transparent';
    return (
      <View style={cellStyle}>
        <Ionicons name="checkmark" size={14} color={iconColor} />
      </View>
    );
  };

  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        <View style={styles.rowLabelSpacer} />
        {days.map((day, idx) => (
          <Text key={`dow-${idx}`} style={styles.dayLabel}>
            {day.label}
          </Text>
        ))}
      </View>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Care</Text>
        {days.map((day, idx) => (
          <View key={`care-${idx}`} style={styles.cellWrap}>
            {renderCell(day.careDone, 'care', day.isToday)}
          </View>
        ))}
      </View>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Journal</Text>
        {days.map((day, idx) => (
          <View key={`journal-${idx}`} style={styles.cellWrap}>
            {renderCell(day.journalDone, 'journal', day.isToday)}
          </View>
        ))}
      </View>
    </View>
  );
};

const LABEL_COL = 56;

const styles = StyleSheet.create({
  grid: {
    gap: Spacing.xs,
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
    ...Typography.micro,
    color: Colors.text.tertiary,
  },
  dayLabel: {
    flex: 1,
    ...Typography.micro,
    color: Colors.text.tertiary,
    textAlign: 'center',
  },
  cellWrap: {
    flex: 1,
    alignItems: 'center',
  },
  cell: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 44,
  },
  cellIdle: {
    backgroundColor: Colors.bg.secondary,
    borderColor: Colors.stroke.medium,
  },
  cellCareDone: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.dark,
  },
  cellJournalDone: {
    backgroundColor: Colors.status.warning,
    borderColor: Colors.status.warning,
  },
  cellTodayRing: {
    borderWidth: 2,
    borderColor: Colors.accent.dark,
  },
});
