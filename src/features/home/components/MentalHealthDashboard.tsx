import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../../core/theme';
import { Card } from '../../../core/components';
import { useAuth } from '../../../core/context/AuthContext';
import { supabase } from '../../../services/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { DailyCheckInModal } from './DailyCheckInModal';

export const MentalHealthDashboard: React.FC = () => {
  const { user } = useAuth();
  const [freudScore, setFreudScore] = useState<number | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [sleep, setSleep] = useState<number>(0);
  const [stress, setStress] = useState<number>(0);
  const [hasJournaled, setHasJournaled] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const fetchTodayMetrics = useCallback(async () => {
    if (!user) return;
    
    // Get start of today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from('client_metrics')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const metric = data[0];
      setFreudScore(metric.freud_score_snapshot);
      setMood(metric.mood);
      setSleep(metric.sleep_hours);
      setStress(metric.stress_level);
      setHasJournaled(!!metric.journal_entry);
    } else {
      setFreudScore(null);
      setMood(null);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchTodayMetrics();
    }, [fetchTodayMetrics])
  );

  const getMoodEmoji = (m: string | null) => {
    switch(m) {
      case 'Happy': return '😊';
      case 'Neutral': return '😐';
      case 'Sad': return '😞';
      case 'Anxious': return '😬';
      case 'Angry': return '😠';
      default: return '☁️';
    }
  };

  return (
    <View style={styles.container}>
      <DailyCheckInModal 
        visible={showModal} 
        onClose={() => setShowModal(false)}
        onSuccess={() => fetchTodayMetrics()}
      />
      {/* Mental Health Metrics Header */}
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>Mental Health Metrics</Text>
        <Ionicons name="ellipsis-horizontal" size={20} color={Colors.text.secondary} />
      </View>

      <View style={styles.metricsRow}>
        {/* Freud Score Widget */}
        <TouchableOpacity style={[styles.metricCard, styles.freudCard]} activeOpacity={0.8}>
          <View style={styles.metricCardHeader}>
            <Ionicons name="heart-half-outline" size={16} color={Colors.text.inverse} />
            <Text style={styles.metricCardTitle}>Freud Score</Text>
          </View>
          <View style={styles.scoreContainer}>
            <View style={styles.scoreCircle}>
              <Text style={styles.scoreNumber}>{freudScore !== null ? freudScore : '-'}</Text>
            </View>
          </View>
          <Text style={styles.scoreLabel}>{freudScore !== null ? 'Logged' : 'Pending'}</Text>
        </TouchableOpacity>

        {/* Mood Widget */}
        <TouchableOpacity style={[styles.metricCard, styles.moodCard]} activeOpacity={0.8} onPress={() => setShowModal(true)}>
          <View style={styles.metricCardHeader}>
            <Ionicons name="happy-outline" size={16} color={Colors.text.inverse} />
            <Text style={styles.metricCardTitle}>Mood</Text>
          </View>
          <View style={styles.moodIconContainer}>
            <Text style={styles.moodEmoji}>{getMoodEmoji(mood)}</Text>
          </View>
          <Text style={styles.scoreLabel}>{mood || 'Log now'}</Text>
        </TouchableOpacity>
      </View>

      {!freudScore && (
        <TouchableOpacity style={styles.logPromptCard} onPress={() => setShowModal(true)}>
          <View style={styles.logPromptIcon}>
            <Ionicons name="add-circle" size={24} color={Colors.accent.primary} />
          </View>
          <View style={styles.logPromptTextContainer}>
            <Text style={styles.logPromptTitle}>Daily Check-in</Text>
            <Text style={styles.logPromptDesc}>Log your mood and mental state for today.</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Mindful Tracker List */}
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>Mindful Tracker</Text>
        <Ionicons name="ellipsis-horizontal" size={20} color={Colors.text.secondary} />
      </View>
      
      <Card style={styles.trackerCard}>
        
        <TrackerRow 
          icon="time-outline" 
          iconColor={Colors.status.success} 
          iconBg={Colors.status.successSoft} 
          title="Sleep Quality" 
          subtitle="Hours of sleep"
          rightElement={<Text style={styles.trackerScoreText}>{sleep > 0 ? `${sleep}h` : '--'}</Text>}
        />

        <TrackerRow 
          icon="journal-outline" 
          iconColor={Colors.status.warning} 
          iconBg={Colors.status.warningSoft} 
          title="Daily Journal" 
          subtitle="Thoughts and reflections"
          rightElement={<Ionicons name={hasJournaled ? "checkmark-circle" : "ellipse-outline"} size={20} color={hasJournaled ? Colors.status.success : Colors.stroke.medium} />}
        />

        <TrackerRow 
          icon="water-outline" 
          iconColor="#EBCB6B" 
          iconBg="#FDF8E7" 
          title="Stress Level" 
          subtitle={`Level ${stress > 0 ? stress : '-'}`}
          noBorder
        />
        
      </Card>

    </View>
  );
};

const TrackerRow = ({ icon, iconColor, iconBg, title, subtitle, rightElement, noBorder = false }: any) => (
  <TouchableOpacity style={[styles.trackerRow, !noBorder && styles.trackerBorder]}>
    <View style={[styles.trackerIconBox, { backgroundColor: iconBg }]}>
      <Ionicons name={icon} size={20} color={iconColor} />
    </View>
    <View style={styles.trackerContent}>
      <Text style={styles.trackerTitle}>{title}</Text>
      <Text style={styles.trackerSubtitle}>{subtitle}</Text>
    </View>
    {rightElement && <View>{rightElement}</View>}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  metricCard: {
    flex: 1,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 180,
  },
  freudCard: {
    backgroundColor: Colors.accent.primary, 
  },
  moodCard: {
    backgroundColor: Colors.status.warning, 
  },
  metricCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  metricCardTitle: {
    ...Typography.captionEmphasis,
    color: Colors.text.inverse,
  },
  scoreContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.text.inverse,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  scoreNumber: {
    ...Typography.title1,
    color: Colors.accent.primary,
  },
  moodIconContainer: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodEmoji: {
    fontSize: 54,
  },
  scoreLabel: {
    ...Typography.bodySemibold,
    color: Colors.text.inverse,
  },
  
  // Tracker Styles
  trackerCard: {
    padding: Spacing.md,
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.xl,
    shadowColor: Colors.stroke.medium,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  trackerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  trackerBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.ui.divider,
  },
  trackerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackerContent: {
    flex: 1,
    gap: 2,
  },
  trackerTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  trackerSubtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  trackerScoreText: {
    ...Typography.bodySemibold,
    color: '#8B7AEB',
  },
  
  logPromptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent.soft,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accent.primary + '30',
    marginTop: Spacing.xs,
  },
  logPromptIcon: {
    marginRight: Spacing.sm,
  },
  logPromptTextContainer: {
    flex: 1,
  },
  logPromptTitle: {
    ...Typography.bodySemibold,
    color: Colors.accent.dark,
  },
  logPromptDesc: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
});
