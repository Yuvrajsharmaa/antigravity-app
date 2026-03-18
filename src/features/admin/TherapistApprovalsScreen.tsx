import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Button, Card, CoveModal, EmptyState, ErrorState, LoadingState, PillChip } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import {
  fetchTherapistApplications,
  reviewTherapistApplication,
} from '../../core/services/careFlowService';
import {
  CoveModalAction,
  CoveModalVariant,
  TherapistApplication,
  TherapistApplicationStatus,
} from '../../core/models/types';
import { supabase } from '../../services/supabase';
import { Colors, Radius, Spacing, Typography } from '../../core/theme';
import { useTabSafeBottomPadding } from '../../core/hooks/useTabSafeBottomPadding';
import { navigateBackSafe } from '../../navigation/safeBack';

type ApplicationRow = TherapistApplication & {
  applicant_name: string;
  applicant_email: string | null;
  applicant_avatar: string | null;
};

const STATUS_FILTERS: TherapistApplicationStatus[] = ['pending', 'approved', 'rejected'];

export const TherapistApprovalsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, profile } = useAuth();
  const tabSafeBottomPadding = useTabSafeBottomPadding(Spacing.xxl);
  const [filter, setFilter] = useState<TherapistApplicationStatus>('pending');
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
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

  const fetchRows = useCallback(async () => {
    setError(null);
    try {
      const apps = await fetchTherapistApplications({ status: filter });
      if (!apps.length) {
        setRows([]);
        return;
      }

      const userIds = apps.map((app) => app.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, first_name, email, avatar_url')
        .in('id', userIds);
      if (profilesError) throw profilesError;

      const profileMap = new Map((profiles || []).map((item: any) => [item.id, item]));
      const mapped = apps.map((app) => {
        const profile = profileMap.get(app.user_id);
        return {
          ...app,
          applicant_name: profile?.display_name || profile?.first_name || 'Applicant',
          applicant_email: profile?.email || null,
          applicant_avatar: profile?.avatar_url || null,
        };
      });
      setRows(mapped);
    } catch (fetchError: any) {
      setError(fetchError.message || 'Unable to load therapist applications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    if (profile?.role !== 'admin') {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchRows();
  }, [fetchRows, profile?.role]);

  const statusMeta = useMemo(() => {
    if (filter === 'pending') {
      return { title: 'Pending approvals', emptyTitle: 'No pending applications' };
    }
    if (filter === 'approved') {
      return { title: 'Approved applications', emptyTitle: 'No approved applications' };
    }
    return { title: 'Rejected applications', emptyTitle: 'No rejected applications' };
  }, [filter]);

  const onReview = async (row: ApplicationRow, status: 'approved' | 'rejected') => {
    if (!user?.id) return;
    setActionId(row.id);
    try {
      await reviewTherapistApplication({
        applicationId: row.id,
        reviewerId: user.id,
        status,
        rejectionReason:
          status === 'rejected' ? 'Please update profile details and re-submit.' : null,
      });
      await fetchRows();
      showModal(
        'success',
        status === 'approved' ? 'Approved' : 'Rejected',
        status === 'approved'
          ? 'Therapist access has been granted.'
          : 'Application marked as rejected with reviewer note.',
      );
    } catch (reviewError: any) {
      showModal('error', 'Update failed', reviewError.message || 'Unable to update application.');
    } finally {
      setActionId(null);
    }
  };

  const renderRow = ({ item }: { item: ApplicationRow }) => (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Avatar uri={item.applicant_avatar} name={item.applicant_name} size={48} />
        <View style={styles.headerCopy}>
          <Text style={styles.name}>{item.applicant_name}</Text>
          <Text style={styles.meta}>{item.applicant_email || 'No email'}</Text>
          <Text style={styles.meta}>
            {item.years_experience !== null ? `${item.years_experience} yrs` : 'Experience not set'}
          </Text>
        </View>
        <View style={[styles.badge, item.status === 'approved' ? styles.badgeApproved : item.status === 'rejected' ? styles.badgeRejected : styles.badgePending]}>
          <Text style={[styles.badgeText, item.status === 'approved' ? styles.badgeTextApproved : item.status === 'rejected' ? styles.badgeTextRejected : styles.badgeTextPending]}>
            {item.status}
          </Text>
        </View>
      </View>

      <View style={styles.rowDetail}>
        <Text style={styles.detailLabel}>Specialties</Text>
        <Text style={styles.detailValue}>
          {item.specialties?.length ? item.specialties.join(', ') : 'Not provided'}
        </Text>
      </View>
      <View style={styles.rowDetail}>
        <Text style={styles.detailLabel}>Languages</Text>
        <Text style={styles.detailValue}>
          {item.languages?.length ? item.languages.join(', ') : 'Not provided'}
        </Text>
      </View>
      <View style={styles.rowDetail}>
        <Text style={styles.detailLabel}>Style</Text>
        <Text style={styles.detailValue}>{item.communication_style || 'Not provided'}</Text>
      </View>
      {item.rejection_reason ? (
        <View style={styles.rejectionBox}>
          <Text style={styles.rejectionLabel}>Reviewer note</Text>
          <Text style={styles.rejectionText}>{item.rejection_reason}</Text>
        </View>
      ) : null}

      {filter === 'pending' ? (
        <View style={styles.actionsRow}>
          <Button
            title="Reject"
            variant="secondary"
            onPress={() => onReview(item, 'rejected')}
            loading={actionId === item.id}
            fullWidth={false}
            style={styles.actionButton}
          />
          <Button
            title="Approve"
            onPress={() => onReview(item, 'approved')}
            loading={actionId === item.id}
            fullWidth={false}
            style={styles.actionButton}
          />
        </View>
      ) : null}
    </Card>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {profile?.role !== 'admin' ? (
        <View style={styles.stateWrap}>
          <EmptyState
            icon="lock-closed-outline"
            title="Admin access only"
            message="Therapist approvals are available only to admin accounts."
          />
        </View>
      ) : null}
      {profile?.role === 'admin' ? (
        <>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigateBackSafe(navigation, 'ProfileMain')}>
          <Ionicons name="chevron-back" size={20} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Therapist Approvals</Text>
        <View style={styles.backBtnGhost} />
      </View>

      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((item) => (
          <PillChip
            key={item}
            label={item}
            selected={filter === item}
            onPress={() => setFilter(item)}
          />
        ))}
      </View>

      <Text style={styles.sectionTitle}>{statusMeta.title}</Text>

      {loading ? (
        <LoadingState message="Loading applications..." style={styles.stateWrap} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchRows} style={styles.stateWrap} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="briefcase-outline"
          title={statusMeta.emptyTitle}
          message="Therapist applications will appear here for review."
          style={styles.stateWrap}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabSafeBottomPadding }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchRows();
              }}
              tintColor={Colors.accent.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
        </>
      ) : null}
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
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  topBar: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.ui.glass,
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
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    paddingHorizontal: Spacing.xl,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: Spacing.xs,
  },
  stateWrap: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
    paddingBottom: Spacing.xxxxl,
  },
  card: {
    gap: Spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerCopy: {
    flex: 1,
  },
  name: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  meta: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  badge: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 4,
  },
  badgePending: {
    backgroundColor: Colors.status.warningSoft,
  },
  badgeApproved: {
    backgroundColor: Colors.status.successSoft,
  },
  badgeRejected: {
    backgroundColor: Colors.status.dangerSoft,
  },
  badgeText: {
    ...Typography.micro,
    letterSpacing: 0.2,
  },
  badgeTextPending: {
    color: Colors.status.warning,
  },
  badgeTextApproved: {
    color: Colors.status.success,
  },
  badgeTextRejected: {
    color: Colors.status.danger,
  },
  rowDetail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  detailLabel: {
    ...Typography.caption,
    color: Colors.text.tertiary,
  },
  detailValue: {
    ...Typography.captionEmphasis,
    color: Colors.text.primary,
    flex: 1,
    textAlign: 'right',
  },
  rejectionBox: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.tertiary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
  },
  rejectionLabel: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    marginBottom: 2,
  },
  rejectionText: {
    ...Typography.caption,
    color: Colors.text.primary,
    lineHeight: 20,
  },
  actionsRow: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
