import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../../core/theme';
import { Card } from '../../../core/components';

export const MentalHealthDashboard: React.FC = () => {
  const [freudScore, setFreudScore] = useState(80);
  const [mood, setMood] = useState('Sad');

  return (
    <View style={styles.container}>
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
              <Text style={styles.scoreNumber}>{freudScore}</Text>
            </View>
          </View>
          <Text style={styles.scoreLabel}>Healthy</Text>
        </TouchableOpacity>

        {/* Mood Widget */}
        <TouchableOpacity style={[styles.metricCard, styles.moodCard]} activeOpacity={0.8}>
          <View style={styles.metricCardHeader}>
            <Ionicons name="happy-outline" size={16} color={Colors.text.inverse} />
            <Text style={styles.metricCardTitle}>Mood</Text>
          </View>
          <View style={styles.moodIconContainer}>
            <Text style={styles.moodEmoji}>😞</Text>
          </View>
          <Text style={styles.scoreLabel}>Sad</Text>
        </TouchableOpacity>
      </View>

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
          title="Mindful Hours" 
          subtitle="2.5Hr Today"
          rightElement={<Ionicons name="pulse" size={24} color={Colors.status.success} />}
        />
        
        <TrackerRow 
          icon="moon-outline" 
          iconColor="#8B7AEB" 
          iconBg="#EFEAFE" 
          title="Sleep Quality" 
          subtitle="Inconsistent · 5-10h Avg"
          rightElement={<Text style={styles.trackerScoreText}>90</Text>}
        />

        <TrackerRow 
          icon="journal-outline" 
          iconColor={Colors.status.warning} 
          iconBg={Colors.status.warningSoft} 
          title="Mindful Journal" 
          subtitle="64 Day Streak"
          rightElement={<Ionicons name="flame" size={20} color={Colors.status.warning} />}
        />

        <TrackerRow 
          icon="water-outline" 
          iconColor="#EBCB6B" 
          iconBg="#FDF8E7" 
          title="Stress Level" 
          subtitle="Level 3 (Normal)"
        />

        <TrackerRow 
          icon="radio-button-on-outline" 
          iconColor={Colors.status.danger} 
          iconBg={Colors.status.dangerSoft} 
          title="Mood Tracker" 
          subtitle="Sad → Happy → Neutral"
          noBorder
        />
        
      </Card>

      {/* AI Therapy Chatbot Card (Matches visual style) */}
      <TouchableOpacity activeOpacity={0.8} style={styles.aiCard}>
        <View style={styles.aiLeft}>
          <Text style={styles.aiTitle}>AI Therapy Chatbot</Text>
          <Text style={styles.aiCount}>2,541</Text>
          <Text style={styles.aiSubtitle}>Conversations</Text>
          <View style={styles.aiBadge}>
            <Ionicons name="star" size={10} color={Colors.text.inverse} />
            <Text style={styles.aiBadgeText}>10 left this month</Text>
          </View>
        </View>
        <View style={styles.aiRight}>
          <Ionicons name="chatbubbles" size={60} color={Colors.text.brownLight} style={{ opacity: 0.2, position: 'absolute', right: -10, bottom: -10 }} />
          <View style={styles.aiRobotHead}>
            <View style={styles.aiRobotEye} />
            <View style={styles.aiRobotLine} />
          </View>
        </View>
      </TouchableOpacity>

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

  // AI Chatbot Banner
  aiCard: {
    backgroundColor: Colors.bg.brownDark,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    flexDirection: 'row',
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
  },
  aiLeft: {
    flex: 1,
    gap: 4,
  },
  aiTitle: {
    ...Typography.captionEmphasis,
    color: Colors.text.brownLight,
  },
  aiCount: {
    ...Typography.title1,
    color: Colors.text.inverse,
    fontSize: 28,
  },
  aiSubtitle: {
    ...Typography.body,
    color: Colors.text.brownLight,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    marginTop: Spacing.sm,
  },
  aiBadgeText: {
    ...Typography.caption,
    fontSize: 10,
    color: Colors.text.inverse,
  },
  aiRight: {
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiRobotHead: {
    width: 50,
    height: 40,
    backgroundColor: Colors.text.brownLight,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  aiRobotEye: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.bg.brownDark,
  },
  aiRobotLine: {
    width: 24,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.bg.brownDark,
  },
});
