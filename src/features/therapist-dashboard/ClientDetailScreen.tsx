import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { supabase } from '../../services/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { BackendSetupCard, EmptyState } from '../../core/components';
import { useClientMetricsReadiness } from '../../core/hooks/useClientMetricsReadiness';
import { useAuth } from '../../core/context/AuthContext';

export const ClientDetailScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { isTherapistMode, canUseTherapistMode } = useAuth();
  const { clientId, clientName } = route.params || {};
  const { ready, requiresSetup, issue, refresh } = useClientMetricsReadiness();

  const [metrics, setMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    React.useCallback(() => {
      if (!clientId || !canUseTherapistMode || !isTherapistMode) return;
      
      const fetchMetrics = async () => {
        setLoading(true);
        if (!ready) {
          setLoading(false);
          return;
        }
        const { data, error } = await supabase
          .from('client_metrics')
          .select('*')
          .eq('user_id', clientId)
          .order('created_at', { ascending: false });
        
        if (!error && data) {
          setMetrics(data);
        }
        setLoading(false);
      };

      fetchMetrics();
    }, [canUseTherapistMode, clientId, isTherapistMode, ready])
  );

  const formatDate = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{clientName}'s Notes</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {!canUseTherapistMode || !isTherapistMode ? (
          <EmptyState
            icon="shield-checkmark-outline"
            title="Therapist mode required"
            message="Client notes are available only in therapist mode."
          />
        ) : (
          <>
        <Text style={styles.sectionTitle}>Metric Logs Timeline</Text>

        {requiresSetup && (
          <BackendSetupCard
            title="CareScore Setup Required"
            message={issue || undefined}
            onRetry={refresh}
          />
        )}
        
        {loading && ready ? (
          <ActivityIndicator size="large" color={Colors.accent.primary} style={{ marginTop: Spacing.xl }} />
        ) : !ready ? null : metrics.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyText}>{clientName} hasn't logged any metrics yet.</Text>
          </View>
        ) : (
          metrics.map((log) => (
            <View key={log.id} style={styles.logCard}>
              <View style={styles.logHeader}>
                <Text style={styles.logDate}>{formatDate(log.created_at)}</Text>
                <View style={styles.scoreBadge}>
                  <Text style={styles.scoreText}>CareScore: {log.care_score_snapshot}</Text>
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.dataBadge}>
                  <Ionicons name="happy-outline" size={16} color={Colors.accent.primary} />
                  <Text style={styles.dataText}>{log.mood}</Text>
                </View>
                <View style={styles.dataBadge}>
                  <Ionicons name="time-outline" size={16} color={Colors.accent.primary} />
                  <Text style={styles.dataText}>{log.sleep_hours}h sleep</Text>
                </View>
                <View style={[styles.dataBadge, log.stress_level >= 4 && { backgroundColor: Colors.status.dangerSoft }]}>
                  <Ionicons name="water-outline" size={16} color={log.stress_level >= 4 ? Colors.status.danger : Colors.accent.primary} />
                  <Text style={[styles.dataText, log.stress_level >= 4 && { color: Colors.status.danger }]}>Stress Lvl {log.stress_level}</Text>
                </View>
              </View>

              {!!log.journal_entry && (
                <View style={styles.journalBox}>
                  <Text style={styles.journalLabel}>Journal Entry:</Text>
                  <Text style={styles.journalText}>{log.journal_entry}</Text>
                </View>
              )}
            </View>
          ))
        )}
        </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

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
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.stroke.subtle,
  },
  backBtn: {
    padding: Spacing.xs,
    marginLeft: -Spacing.xs,
  },
  headerTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  scrollContent: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxxl,
  },
  sectionTitle: {
    ...Typography.title2,
    color: Colors.text.primary,
    marginBottom: Spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: Spacing.xxxl,
    gap: Spacing.md,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  logCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  logDate: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  scoreBadge: {
    backgroundColor: Colors.accent.soft,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  scoreText: {
    ...Typography.captionEmphasis,
    color: Colors.accent.primary,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  dataBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.bg.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  dataText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  journalBox: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.bg.primary,
    padding: Spacing.sm,
    borderRadius: Radius.md,
  },
  journalLabel: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    marginBottom: 4,
  },
  journalText: {
    ...Typography.body,
    color: Colors.text.primary,
    fontStyle: 'italic',
  },
});
