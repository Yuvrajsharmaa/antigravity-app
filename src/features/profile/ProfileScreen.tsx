import React from 'react';
import {
  Image,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { Colors, Radius, Spacing, Typography } from '../../core/theme';
import { AppSheet, Avatar, Button, Card, CoveModal, EmptyState, PillChip } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { useTabSafeBottomPadding } from '../../core/hooks/useTabSafeBottomPadding';
import { ActiveTherapistLock, AvailabilitySlot, CoveModalAction, CoveModalVariant } from '../../core/models/types';
import { ensureConversation, fetchActiveTherapistLock, setTherapistLockAction } from '../../core/services/careFlowService';
import {
  createAvailabilitySlot,
  createRecurringAvailabilitySlots,
  deleteAvailabilitySlot,
  fetchTherapistAvailabilitySlots,
  fetchTherapistEditableProfile,
  saveTherapistEditableProfile,
  TherapistEditableProfile,
} from '../../core/services/therapistSelfService';
import { supabase } from '../../services/supabase';

type ProfileTab = 'posts' | 'replies' | 'media' | 'reposts';

const makeHandle = (displayName?: string | null) => {
  if (!displayName) return '';
  return displayName.trim().toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9._]/g, '');
};

const formatRelativeDate = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
};

const formatSlotDate = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
const formatSlotTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const toIsoFromDateAndTime = (dateValue: string, timeValue: string) => {
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hh, mm] = timeValue.split(':').map(Number);
  if (!year || !month || !day || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const next = new Date(year, month - 1, day, hh, mm, 0, 0);
  if (Number.isNaN(next.getTime())) return null;
  return next.toISOString();
};

const weekdayOptions = [
  { id: 0, label: 'Sun' },
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
];

const defaultTherapistForm: TherapistEditableProfile = {
  firstName: '',
  displayName: '',
  handle: '',
  bio: '',
  links: [],
  headline: '',
  specialties: [],
  languages: [],
  yearsExperience: 0,
  sessionFeeInr: 0,
  chatFeeInr: null,
  standoutQuote: '',
  standoutPrompt: '',
  allowCommunityDmRequests: true,
};

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const {
    profile,
    user,
    signOut,
    isTherapistMode,
    canUseTherapistMode,
    toggleTherapistMode,
    refreshProfile,
  } = useAuth();
  const tabSafeBottomPadding = useTabSafeBottomPadding(Spacing.lg);
  const [activeLock, setActiveLock] = React.useState<ActiveTherapistLock | null>(null);
  const [activeTab, setActiveTab] = React.useState<ProfileTab>('posts');
  const [settingsVisible, setSettingsVisible] = React.useState(false);
  const [loadingContent, setLoadingContent] = React.useState(true);
  const [threads, setThreads] = React.useState<any[]>([]);
  const [replies, setReplies] = React.useState<any[]>([]);
  const [mediaItems, setMediaItems] = React.useState<any[]>([]);
  const [reposts, setReposts] = React.useState<any[]>([]);
  const [activityCounts, setActivityCounts] = React.useState({
    posts: 0,
    replies: 0,
    media: 0,
    reposts: 0,
  });
  const [followerCount, setFollowerCount] = React.useState(0);
  const [followingCount, setFollowingCount] = React.useState(0);
  const [professionalKpis, setProfessionalKpis] = React.useState<{
    posts: number;
    replies: number;
    upcomingSessions: number;
    pendingIntros: number;
  }>({
    posts: 0,
    replies: 0,
    upcomingSessions: 0,
    pendingIntros: 0,
  });

  const [therapistForm, setTherapistForm] = React.useState<TherapistEditableProfile>(defaultTherapistForm);
  const [specialtiesCsv, setSpecialtiesCsv] = React.useState('');
  const [languagesCsv, setLanguagesCsv] = React.useState('');
  const [linksCsv, setLinksCsv] = React.useState('');
  const [profileSaving, setProfileSaving] = React.useState(false);

  const [slots, setSlots] = React.useState<AvailabilitySlot[]>([]);
  const [slotLoading, setSlotLoading] = React.useState(false);
  const [slotDate, setSlotDate] = React.useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [slotStartTime, setSlotStartTime] = React.useState('09:00');
  const [slotEndTime, setSlotEndTime] = React.useState('09:30');
  const [slotType, setSlotType] = React.useState<'video' | 'chat'>('video');
  const [recurringWeekday, setRecurringWeekday] = React.useState(new Date().getDay());
  const [recurringStartTime, setRecurringStartTime] = React.useState('10:00');
  const [recurringEndTime, setRecurringEndTime] = React.useState('10:30');
  const [recurringWeeks, setRecurringWeeks] = React.useState('6');

  const [modalState, setModalState] = React.useState<{
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

  const isTherapistProfile = profile?.role === 'therapist' || profile?.role === 'admin';

  const navigateTab = React.useCallback((tabName: string, params?: Record<string, any>) => {
    const parentNav = navigation.getParent?.();
    if (parentNav?.navigate) {
      parentNav.navigate(tabName, params);
      return;
    }
    navigation.navigate(tabName, params);
  }, [navigation]);

  const showModal = React.useCallback(
    (
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
    },
    [],
  );

  const loadActiveLock = React.useCallback(async () => {
    if (!user?.id || isTherapistMode) {
      setActiveLock(null);
      return;
    }
    try {
      const lock = await fetchActiveTherapistLock(user.id);
      setActiveLock(lock);
    } catch {
      setActiveLock(null);
    }
  }, [isTherapistMode, user?.id]);

  const loadProfileSocial = React.useCallback(async () => {
    if (!user?.id) return;
    setLoadingContent(true);
    try {
      const [
        threadsResult,
        repliesResult,
        mediaResult,
        repostResult,
        followerResult,
        followingResult,
        postCountResult,
        replyCountResult,
        mediaCountResult,
        repostCountResult,
      ] = await Promise.all([
        supabase
          .from('community_posts')
          .select('id,body,likes_count,comments_count,reposts_count,shares_count,created_at')
          .eq('author_id', user.id)
          .eq('moderation_state', 'approved')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('community_comments')
          .select('id,body,created_at,post_id')
          .eq('author_id', user.id)
          .eq('moderation_state', 'approved')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('community_post_media')
          .select('id,media_type,media_url,created_at,post_id')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('community_reposts')
          .select('id,created_at,post_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('community_follows')
          .select('follower_id', { head: true, count: 'exact' })
          .eq('followee_id', user.id),
        supabase
          .from('community_follows')
          .select('followee_id', { head: true, count: 'exact' })
          .eq('follower_id', user.id),
        supabase
          .from('community_posts')
          .select('id', { head: true, count: 'exact' })
          .eq('author_id', user.id)
          .eq('moderation_state', 'approved'),
        supabase
          .from('community_comments')
          .select('id', { head: true, count: 'exact' })
          .eq('author_id', user.id)
          .eq('moderation_state', 'approved'),
        supabase
          .from('community_post_media')
          .select('id', { head: true, count: 'exact' })
          .eq('created_by', user.id),
        supabase
          .from('community_reposts')
          .select('id', { head: true, count: 'exact' })
          .eq('user_id', user.id),
      ]);

      setThreads(threadsResult.data || []);
      setReplies(repliesResult.data || []);
      setMediaItems(mediaResult.data || []);
      setReposts(repostResult.data || []);
      setFollowerCount(followerResult.count || 0);
      setFollowingCount(followingResult.count || 0);
      setActivityCounts({
        posts: postCountResult.count || 0,
        replies: replyCountResult.count || 0,
        media: mediaCountResult.count || 0,
        reposts: repostCountResult.count || 0,
      });

      if (isTherapistProfile) {
        const nowIso = new Date().toISOString();
        const [upcomingCount, pendingIntroCount] = await Promise.all([
          supabase
            .from('bookings')
            .select('id', { head: true, count: 'exact' })
            .eq('therapist_id', user.id)
            .in('status', ['pending_payment', 'confirmed'])
            .gte('scheduled_start_at', nowIso),
          supabase
            .from('therapist_match_requests')
            .select('id', { head: true, count: 'exact' })
            .eq('therapist_id', user.id)
            .eq('status', 'pending'),
        ]);

        setProfessionalKpis({
          posts: postCountResult.count || 0,
          replies: replyCountResult.count || 0,
          upcomingSessions: upcomingCount.count || 0,
          pendingIntros: pendingIntroCount.count || 0,
        });
      } else {
        setProfessionalKpis({
          posts: 0,
          replies: 0,
          upcomingSessions: 0,
          pendingIntros: 0,
        });
      }
    } finally {
      setLoadingContent(false);
    }
  }, [isTherapistProfile, user?.id]);

  React.useEffect(() => {
    loadActiveLock();
    loadProfileSocial();
  }, [loadActiveLock, loadProfileSocial]);

  const loadTherapistSettings = React.useCallback(async () => {
    if (!user?.id || !isTherapistProfile) return;
    setSlotLoading(true);
    try {
      const profileData = await fetchTherapistEditableProfile(user.id);
      setTherapistForm(profileData);
      setSpecialtiesCsv(profileData.specialties.join(', '));
      setLanguagesCsv(profileData.languages.join(', '));
      setLinksCsv((profileData.links || []).join(', '));

      const now = new Date();
      const to = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
      const availability = await fetchTherapistAvailabilitySlots({
        therapistId: user.id,
        fromIso: now.toISOString(),
        toIso: to.toISOString(),
      });
      setSlots(availability);
    } catch (err: any) {
      showModal('error', 'Unable to load settings', err?.message || 'Please try again.');
    } finally {
      setSlotLoading(false);
    }
  }, [isTherapistProfile, showModal, user?.id]);

  React.useEffect(() => {
    if (settingsVisible) {
      loadTherapistSettings();
    }
  }, [loadTherapistSettings, settingsVisible]);

  const handleSignOut = () => {
    showModal(
      'confirm',
      'Sign out?',
      'You can sign back in anytime.',
      {
        label: 'Sign out',
        onPress: async () => {
          setModalState((prev) => ({ ...prev, visible: false }));
          await signOut();
        },
      },
      {
        label: 'Cancel',
        onPress: () => setModalState((prev) => ({ ...prev, visible: false })),
      },
    );
  };

  const handleRestartOnboarding = () => {
    if (!profile?.id) return;
    showModal(
      'confirm',
      'View onboarding again?',
      'This reopens onboarding from the start.',
      {
        label: 'Restart',
        onPress: async () => {
          try {
            const onboardingStepKeys = ['client', 'therapist'].flatMap((flow) => [
              `care_space_onboarding_step_v4_${profile.id}_${flow}`,
              `care_space_onboarding_step_v3_${profile.id}_${flow}`,
              `care_space_onboarding_step_v2_${profile.id}_${flow}`,
              `care_space_onboarding_step_${profile.id}_${flow}`,
            ]);

            const { error } = await supabase
              .from('profiles')
              .update({
                onboarding_completed: false,
                updated_at: new Date().toISOString(),
              })
              .eq('id', profile.id);

            if (error) throw error;
            await AsyncStorage.multiRemove(onboardingStepKeys);
            setModalState((prev) => ({ ...prev, visible: false }));
            await refreshProfile();
          } catch (err: any) {
            showModal('error', 'Unable to reopen onboarding', err?.message || 'Please try again.');
          }
        },
      },
      {
        label: 'Cancel',
        onPress: () => setModalState((prev) => ({ ...prev, visible: false })),
      },
    );
  };

  const shareProfile = async () => {
    const handle = profile?.handle || makeHandle(profile?.display_name || profile?.first_name) || 'member';
    await Share.share({
      message: `Connect with me on Care Space community: @${handle}`,
    });
  };

  const openLockedChat = async () => {
    if (!user?.id || !activeLock?.therapist_id) return;
    try {
      const conversationId = await ensureConversation({
        userId: user.id,
        therapistId: activeLock.therapist_id,
      });
      navigateTab('MessagesTab', {
        screen: 'Chat',
        params: {
          conversationId,
          therapistName: activeLock.therapist_name,
          therapistAvatar: activeLock.therapist_avatar,
          therapistId: activeLock.therapist_id,
        },
      });
    } catch (err: any) {
      showModal('error', 'Unable to open chat', err?.message || 'Please try again.');
    }
  };

  const keepExploringTherapists = async () => {
    if (!user?.id || !activeLock?.therapist_id) return;
    try {
      await setTherapistLockAction({
        userId: user.id,
        therapistId: activeLock.therapist_id,
        action: 'keep_exploring',
        switchReason: 'User reopened therapist exploration from profile',
      });
      await loadActiveLock();
    } catch (err: any) {
      showModal('error', 'Unable to update', err?.message || 'Please try again.');
    }
  };

  const persistTherapistSettings = async () => {
    if (!user?.id) return;
    setProfileSaving(true);
    try {
      await saveTherapistEditableProfile({
        userId: user.id,
        payload: {
          ...therapistForm,
          specialties: specialtiesCsv.split(',').map((v) => v.trim()).filter(Boolean),
          languages: languagesCsv.split(',').map((v) => v.trim()).filter(Boolean),
          links: linksCsv.split(',').map((v) => v.trim()).filter(Boolean),
        },
      });
      showModal('success', 'Saved', 'Professional profile updated.');
      await refreshProfile();
    } catch (err: any) {
      showModal('error', 'Save failed', err?.message || 'Please try again.');
    } finally {
      setProfileSaving(false);
    }
  };

  const addOneOffSlot = async () => {
    if (!user?.id) return;
    const startIso = toIsoFromDateAndTime(slotDate, slotStartTime);
    const endIso = toIsoFromDateAndTime(slotDate, slotEndTime);
    if (!startIso || !endIso || new Date(endIso) <= new Date(startIso)) {
      showModal('blocking', 'Invalid slot', 'Enter a valid date and time range.');
      return;
    }
    try {
      await createAvailabilitySlot({
        therapistId: user.id,
        startAtIso: startIso,
        endAtIso: endIso,
        slotType,
      });
      await loadTherapistSettings();
    } catch (err: any) {
      showModal('error', 'Unable to add slot', err?.message || 'Please try again.');
    }
  };

  const addRecurringSlots = async () => {
    if (!user?.id) return;
    const weeks = Number(recurringWeeks);
    if (!Number.isFinite(weeks) || weeks < 1 || weeks > 16) {
      showModal('blocking', 'Invalid weeks', 'Enter 1 to 16 weeks.');
      return;
    }
    try {
      const created = await createRecurringAvailabilitySlots({
        therapistId: user.id,
        weekday: recurringWeekday,
        startTime: recurringStartTime,
        endTime: recurringEndTime,
        weeksAhead: weeks,
        slotType,
      });
      showModal('success', 'Recurring slots added', `${created} slots created.`);
      await loadTherapistSettings();
    } catch (err: any) {
      showModal('error', 'Unable to add recurring slots', err?.message || 'Please try again.');
    }
  };

  const removeSlot = async (slotId: string) => {
    if (!user?.id) return;
    try {
      await deleteAvailabilitySlot({ slotId, therapistId: user.id });
      setSlots((prev) => prev.filter((slot) => slot.id !== slotId));
    } catch (err: any) {
      showModal('error', 'Unable to remove slot', err?.message || 'Please try again.');
    }
  };

  const profileName = profile?.display_name || profile?.first_name || 'Member';
  const profileHandle = profile?.handle || makeHandle(profileName) || 'member';

  const tabItems = [
    { id: 'posts' as const, label: 'Posts', count: activityCounts.posts },
    { id: 'replies' as const, label: 'Replies', count: activityCounts.replies },
    { id: 'media' as const, label: 'Media', count: activityCounts.media },
    { id: 'reposts' as const, label: 'Reposts', count: activityCounts.reposts },
  ];

  const renderTabContent = () => {
    if (loadingContent) {
      return (
        <View style={styles.stateWrap}>
          <Text style={styles.stateText}>Loading profile activity...</Text>
        </View>
      );
    }

    if (activeTab === 'posts') {
      if (!threads.length) {
        return (
          <EmptyState
            icon="sparkles-outline"
            title="No posts yet"
            message="Write your first post to start community conversations."
            actionLabel="Open community"
            onAction={() => navigateTab('CommunityTab', { screen: 'CreatePost' })}
            style={styles.stateWrap}
          />
        );
      }
      return (
        <View style={styles.feedList}>
          {threads.map((item) => (
            <View key={item.id} style={styles.feedRow}>
              <Avatar uri={profile?.avatar_url || null} name={profileName} size={42} />
              <View style={styles.feedBody}>
                <View style={styles.feedMetaRow}>
                  <Text style={styles.feedAuthor}>{profileHandle}</Text>
                  <Text style={styles.feedTime}>{formatRelativeDate(item.created_at)}</Text>
                </View>
                <Text style={styles.feedText} numberOfLines={4}>{item.body}</Text>
                <Text style={styles.feedStats}>
                  {item.likes_count} likes · {item.comments_count} replies · {item.reposts_count} reposts
                </Text>
              </View>
            </View>
          ))}
        </View>
      );
    }

    if (activeTab === 'replies') {
      if (!replies.length) {
        return <Text style={styles.emptyInline}>No replies yet.</Text>;
      }
      return (
        <View style={styles.feedList}>
          {replies.map((reply) => (
            <View key={reply.id} style={styles.replyRow}>
              <Text style={styles.replyBody} numberOfLines={3}>{reply.body}</Text>
              <Text style={styles.replyTime}>{formatRelativeDate(reply.created_at)}</Text>
            </View>
          ))}
        </View>
      );
    }

    if (activeTab === 'media') {
      if (!mediaItems.length) {
        return <Text style={styles.emptyInline}>No media yet.</Text>;
      }
      return (
        <View style={styles.mediaGrid}>
          {mediaItems.map((media) => (
            <View key={media.id} style={styles.mediaGridItem}>
              <Image source={{ uri: media.media_url }} style={styles.mediaGridImage} resizeMode="cover" />
            </View>
          ))}
        </View>
      );
    }

    if (!reposts.length) {
      return <Text style={styles.emptyInline}>No reposts yet.</Text>;
    }
    return (
      <View style={styles.feedList}>
        {reposts.map((item) => (
          <View key={item.id} style={styles.replyRow}>
            <Text style={styles.replyBody}>Reposted a post</Text>
            <Text style={styles.replyTime}>{formatRelativeDate(item.created_at)}</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabSafeBottomPadding + Spacing.xl }]}
      >
        <View style={styles.topBar}>
          <Text style={styles.screenTitle}>Profile</Text>
          <View style={styles.topActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Notifications')}>
              <Ionicons name="notifications-outline" size={20} color={Colors.text.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setSettingsVisible(true)}>
              <Ionicons name="menu-outline" size={22} color={Colors.text.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.heroWrap}>
          <Avatar uri={profile?.avatar_url || null} name={profileName} size={82} />
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroName}>{profileName}</Text>
            <Text style={styles.heroHandle}>@{profileHandle}</Text>
            <Text style={styles.heroBio} numberOfLines={3}>
              {profile?.bio || 'Share your journey and support others in community.'}
            </Text>
            <Text style={styles.heroStats}>{followerCount} followers · {followingCount} following</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{activityCounts.posts}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{followerCount}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{followingCount}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
        </View>

        <View style={styles.profileActionsRow}>
          <Button
            title="Edit profile"
            variant="secondary"
            fullWidth={false}
            style={{ flex: 1 }}
            onPress={() => navigation.navigate('EditProfile')}
          />
          <Button
            title="Share profile"
            variant="secondary"
            fullWidth={false}
            style={{ flex: 1 }}
            onPress={shareProfile}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.highlightsScroll}
          contentContainerStyle={styles.highlightsRow}
        >
          <View style={styles.highlightAdd}>
            <View style={styles.highlightAddCircle}>
              <Ionicons name="add" size={20} color={Colors.text.secondary} />
            </View>
            <Text style={styles.highlightLabel}>New</Text>
          </View>
          {mediaItems.slice(0, 8).map((media, index) => (
            <View key={media.id || `media-${index}`} style={styles.highlightItem}>
              <Image source={{ uri: media.media_url }} style={styles.highlightImage} resizeMode="cover" />
              <Text style={styles.highlightLabel}>{formatRelativeDate(media.created_at)}</Text>
            </View>
          ))}
        </ScrollView>

        {isTherapistProfile ? (
          <Card style={styles.professionalCard}>
            <Text style={styles.professionalTitle}>Professional dashboard</Text>
            <Text style={styles.professionalSubtitle}>Live activity across your community and therapy workflows.</Text>
            <View style={styles.professionalKpiRow}>
              <View style={styles.professionalKpiCell}>
                <Text style={styles.professionalKpiValue}>{professionalKpis.posts}</Text>
                <Text style={styles.professionalKpiLabel}>Posts</Text>
              </View>
              <View style={styles.professionalKpiCell}>
                <Text style={styles.professionalKpiValue}>{professionalKpis.replies}</Text>
                <Text style={styles.professionalKpiLabel}>Replies</Text>
              </View>
              <View style={styles.professionalKpiCell}>
                <Text style={styles.professionalKpiValue}>{professionalKpis.upcomingSessions}</Text>
                <Text style={styles.professionalKpiLabel}>Sessions</Text>
              </View>
              <View style={styles.professionalKpiCell}>
                <Text style={styles.professionalKpiValue}>{professionalKpis.pendingIntros}</Text>
                <Text style={styles.professionalKpiLabel}>Intro requests</Text>
              </View>
            </View>
          </Card>
        ) : null}

        {!isTherapistMode ? (
          <Card style={styles.lockCard}>
            <Text style={styles.lockTitle}>Therapy connection</Text>
            {activeLock ? (
              <>
                <View style={styles.lockHeader}>
                  <Avatar uri={activeLock.therapist_avatar} name={activeLock.therapist_name} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lockName}>{activeLock.therapist_name}</Text>
                    <Text style={styles.lockMeta}>{activeLock.therapist_headline || 'Primary therapist'}</Text>
                  </View>
                </View>
                <View style={styles.lockActions}>
                  <Button title="Message" size="sm" fullWidth={false} style={{ flex: 1 }} onPress={openLockedChat} />
                  <Button
                    title="Change"
                    size="sm"
                    variant="secondary"
                    fullWidth={false}
                    style={{ flex: 1 }}
                    onPress={keepExploringTherapists}
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.lockMeta}>No therapist locked yet. Explore matches to send an intro.</Text>
                <Button
                  title="Find therapist"
                  onPress={() => navigateTab('CareTab', { screen: 'TherapistMatch' })}
                />
              </>
            )}
          </Card>
        ) : null}

        <View style={styles.tabRow}>
          {tabItems.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tabBtn, selected && styles.tabBtnSelected]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {renderTabContent()}

        <View style={styles.footerWrap}>
          <Button
            title="Sign out"
            onPress={handleSignOut}
            variant="danger"
            icon={<Ionicons name="log-out-outline" size={18} color={Colors.text.inverse} />}
          />
          <Text style={styles.version}>Care Space v1.1.0</Text>
        </View>
      </ScrollView>

      <AppSheet
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        side="right"
        title="Settings"
        subtitle="Account, therapy tools, and safety controls"
        showHandle={false}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.sheetContent}
        >
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => {
              setSettingsVisible(false);
              navigation.navigate('EditProfile');
            }}
          >
            <Ionicons name="person-outline" size={18} color={Colors.text.secondary} />
            <Text style={styles.settingLabel}>Edit profile</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => {
              setSettingsVisible(false);
              navigation.navigate('Notifications');
            }}
          >
            <Ionicons name="notifications-outline" size={18} color={Colors.text.secondary} />
            <Text style={styles.settingLabel}>Notifications</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => {
              setSettingsVisible(false);
              handleRestartOnboarding();
            }}
          >
            <Ionicons name="refresh-outline" size={18} color={Colors.text.secondary} />
            <Text style={styles.settingLabel}>View onboarding again</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} />
          </TouchableOpacity>

          {canUseTherapistMode ? (
            <View style={styles.modeRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flex: 1 }}>
                <Ionicons name="medical-outline" size={18} color={Colors.accent.primary} />
                <Text style={styles.settingLabel}>Therapist dashboard mode</Text>
              </View>
              <Switch
                value={isTherapistMode}
                onValueChange={toggleTherapistMode}
                trackColor={{ false: Colors.stroke.medium, true: Colors.accent.primary }}
              />
            </View>
          ) : null}

          {isTherapistProfile ? (
            <>
              <View style={styles.formSection}>
                <Text style={styles.sheetSectionTitle}>Professional profile</Text>
                <Text style={styles.sheetSectionHint}>This information appears on your profile and match cards.</Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Headline</Text>
                  <TextInput
                    style={styles.sheetInput}
                    value={therapistForm.headline}
                    onChangeText={(headline) => setTherapistForm((prev) => ({ ...prev, headline }))}
                    placeholder="Clinical Psychologist · CBT Specialist"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Professional bio</Text>
                  <TextInput
                    style={[styles.sheetInput, styles.sheetInputMultiline]}
                    multiline
                    value={therapistForm.bio}
                    onChangeText={(bio) => setTherapistForm((prev) => ({ ...prev, bio }))}
                    placeholder="Share your approach in 2-4 lines."
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Specialties</Text>
                  <TextInput
                    style={styles.sheetInput}
                    value={specialtiesCsv}
                    onChangeText={setSpecialtiesCsv}
                    placeholder="anxiety, stress, trauma"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                  <Text style={styles.fieldHint}>Comma-separated. Keep to your top areas.</Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Languages</Text>
                  <TextInput
                    style={styles.sheetInput}
                    value={languagesCsv}
                    onChangeText={setLanguagesCsv}
                    placeholder="English, Hindi"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.feesRow}>
                  <View style={styles.feeField}>
                    <Text style={styles.fieldLabel}>Session fee (INR)</Text>
                    <TextInput
                      style={styles.sheetInput}
                      keyboardType="numeric"
                      value={String(therapistForm.sessionFeeInr || 0)}
                      onChangeText={(value) => setTherapistForm((prev) => ({ ...prev, sessionFeeInr: Number(value) || 0 }))}
                      placeholder="900"
                      placeholderTextColor={Colors.text.tertiary}
                    />
                  </View>
                  <View style={styles.feeField}>
                    <Text style={styles.fieldLabel}>Chat fee (optional)</Text>
                    <TextInput
                      style={styles.sheetInput}
                      keyboardType="numeric"
                      value={therapistForm.chatFeeInr ? String(therapistForm.chatFeeInr) : ''}
                      onChangeText={(value) => setTherapistForm((prev) => ({ ...prev, chatFeeInr: value.trim() ? Number(value) || 0 : null }))}
                      placeholder="450"
                      placeholderTextColor={Colors.text.tertiary}
                    />
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Profile links</Text>
                  <TextInput
                    style={styles.sheetInput}
                    value={linksCsv}
                    onChangeText={setLinksCsv}
                    placeholder="https://your-website.com, https://linkedin.com/in/..."
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Standout quote</Text>
                  <TextInput
                    style={styles.sheetInput}
                    value={therapistForm.standoutQuote}
                    onChangeText={(standoutQuote) => setTherapistForm((prev) => ({ ...prev, standoutQuote }))}
                    placeholder="One calming sentence clients remember."
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Intro prompt suggestion</Text>
                  <TextInput
                    style={styles.sheetInput}
                    value={therapistForm.standoutPrompt}
                    onChangeText={(standoutPrompt) => setTherapistForm((prev) => ({ ...prev, standoutPrompt }))}
                    placeholder="What would you like help with first?"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.modeRow}>
                  <View style={styles.modeTextBlock}>
                    <Text style={styles.settingLabel}>Allow community DM requests</Text>
                    <Text style={styles.modeHint}>When off, new requests land as declined.</Text>
                  </View>
                  <Switch
                    value={therapistForm.allowCommunityDmRequests}
                    onValueChange={(allowCommunityDmRequests) => setTherapistForm((prev) => ({ ...prev, allowCommunityDmRequests }))}
                    trackColor={{ false: Colors.stroke.medium, true: Colors.accent.primary }}
                  />
                </View>
              </View>
              <Button
                title="Save professional profile"
                onPress={persistTherapistSettings}
                loading={profileSaving}
                disabled={profileSaving}
              />

              <View style={styles.formSection}>
                <Text style={styles.sheetSectionTitle}>Availability</Text>
                <Text style={styles.sheetSectionHint}>Add one-off slots or recurring weekly windows.</Text>

                {slotLoading ? <Text style={styles.emptyInline}>Loading slots...</Text> : null}
                <View style={styles.slotTypeRow}>
                  <PillChip label="Video" selected={slotType === 'video'} onPress={() => setSlotType('video')} />
                  <PillChip label="Chat" selected={slotType === 'chat'} onPress={() => setSlotType('chat')} />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>One-off slot date</Text>
                  <TextInput
                    style={styles.sheetInput}
                    value={slotDate}
                    onChangeText={setSlotDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.inlineInputs}>
                  <View style={styles.inlineField}>
                    <Text style={styles.fieldLabel}>Start</Text>
                    <TextInput
                      style={[styles.sheetInput, styles.inlineInput]}
                      value={slotStartTime}
                      onChangeText={setSlotStartTime}
                      placeholder="HH:MM"
                      placeholderTextColor={Colors.text.tertiary}
                    />
                  </View>
                  <View style={styles.inlineField}>
                    <Text style={styles.fieldLabel}>End</Text>
                    <TextInput
                      style={[styles.sheetInput, styles.inlineInput]}
                      value={slotEndTime}
                      onChangeText={setSlotEndTime}
                      placeholder="HH:MM"
                      placeholderTextColor={Colors.text.tertiary}
                    />
                  </View>
                </View>
                <Button title="Add one-off slot" onPress={addOneOffSlot} variant="secondary" />

                <Text style={styles.sheetSectionSubTitle}>Recurring weekly block</Text>
                <View style={styles.weekdayWrap}>
                  {weekdayOptions.map((option) => (
                    <PillChip
                      key={option.id}
                      label={option.label}
                      selected={recurringWeekday === option.id}
                      onPress={() => setRecurringWeekday(option.id)}
                    />
                  ))}
                </View>

                <View style={styles.inlineInputs}>
                  <View style={styles.inlineField}>
                    <Text style={styles.fieldLabel}>Start</Text>
                    <TextInput
                      style={[styles.sheetInput, styles.inlineInput]}
                      value={recurringStartTime}
                      onChangeText={setRecurringStartTime}
                      placeholder="HH:MM"
                      placeholderTextColor={Colors.text.tertiary}
                    />
                  </View>
                  <View style={styles.inlineField}>
                    <Text style={styles.fieldLabel}>End</Text>
                    <TextInput
                      style={[styles.sheetInput, styles.inlineInput]}
                      value={recurringEndTime}
                      onChangeText={setRecurringEndTime}
                      placeholder="HH:MM"
                      placeholderTextColor={Colors.text.tertiary}
                    />
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Weeks ahead</Text>
                  <TextInput
                    style={styles.sheetInput}
                    keyboardType="numeric"
                    value={recurringWeeks}
                    onChangeText={setRecurringWeeks}
                    placeholder="1-16"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>
                <Button title="Add recurring slots" onPress={addRecurringSlots} variant="secondary" />

                <Text style={styles.sheetSectionSubTitle}>Upcoming slots</Text>
                {slots.length === 0 ? (
                  <Text style={styles.emptyInline}>No slots yet. Add one-off or recurring slots above.</Text>
                ) : (
                  <View style={styles.slotList}>
                    {slots.slice(0, 24).map((slot) => (
                      <View key={slot.id} style={styles.slotRow}>
                        <View style={styles.slotMetaWrap}>
                          <Text style={styles.slotMain}>
                            {formatSlotDate(slot.start_at)} · {formatSlotTime(slot.start_at)} - {formatSlotTime(slot.end_at)}
                          </Text>
                          <Text style={styles.slotSub}>{slot.slot_type === 'video' ? 'Video' : 'Chat'}</Text>
                        </View>
                        <TouchableOpacity onPress={() => removeSlot(slot.id)} style={styles.slotDeleteBtn}>
                          <Ionicons name="trash-outline" size={18} color={Colors.status.danger} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </>
          ) : null}
        </ScrollView>
      </AppSheet>

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
  scrollContent: {
    paddingHorizontal: Spacing.xl,
  },
  topBar: {
    paddingTop: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  screenTitle: {
    ...Typography.title1,
    color: Colors.text.primary,
  },
  topActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.stroke.soft,
    backgroundColor: Colors.bg.secondary,
  },
  heroWrap: {
    marginTop: Spacing.lg,
    flexDirection: 'row',
    gap: Spacing.md,
  },
  heroTextWrap: {
    flex: 1,
  },
  heroName: {
    ...Typography.title2,
    color: Colors.text.primary,
  },
  heroHandle: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  heroBio: {
    ...Typography.body,
    color: Colors.text.primary,
    marginTop: Spacing.xs,
    lineHeight: 23,
  },
  heroStats: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    marginTop: Spacing.xs,
  },
  statsRow: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  statCell: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
  },
  statValue: {
    ...Typography.title3,
    color: Colors.text.primary,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  profileActionsRow: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  highlightsScroll: {
    marginTop: Spacing.md,
    marginHorizontal: -Spacing.xl,
  },
  highlightsRow: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  highlightAdd: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  highlightAddCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Colors.stroke.soft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.secondary,
  },
  highlightItem: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  highlightImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Colors.stroke.soft,
  },
  highlightLabel: {
    ...Typography.micro,
    color: Colors.text.secondary,
    textTransform: 'none',
    letterSpacing: 0,
    maxWidth: 72,
    textAlign: 'center',
  },
  professionalCard: {
    marginTop: Spacing.lg,
    gap: Spacing.xs,
  },
  professionalTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  professionalSubtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  professionalKpiRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  professionalKpiCell: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    borderRadius: Radius.md,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
    backgroundColor: Colors.bg.tertiary,
  },
  professionalKpiValue: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  professionalKpiLabel: {
    ...Typography.micro,
    color: Colors.text.secondary,
    textTransform: 'none',
    letterSpacing: 0,
  },
  lockCard: {
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  lockTitle: {
    ...Typography.captionEmphasis,
    color: Colors.text.primary,
  },
  lockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  lockName: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  lockMeta: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  lockActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  tabRow: {
    marginTop: Spacing.xl,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.stroke.subtle,
  },
  tabBtn: {
    paddingBottom: Spacing.sm,
    marginRight: Spacing.lg,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnSelected: {
    borderBottomColor: Colors.text.primary,
  },
  tabText: {
    ...Typography.bodySemibold,
    color: Colors.text.tertiary,
  },
  tabTextSelected: {
    color: Colors.text.primary,
  },
  feedList: {
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  mediaGrid: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  mediaGridItem: {
    width: '31.8%',
    aspectRatio: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.secondary,
  },
  mediaGridImage: {
    width: '100%',
    height: '100%',
  },
  feedRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.stroke.subtle,
  },
  feedBody: {
    flex: 1,
    gap: 2,
  },
  feedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feedAuthor: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  feedTime: {
    ...Typography.caption,
    color: Colors.text.tertiary,
  },
  feedText: {
    ...Typography.body,
    color: Colors.text.primary,
    lineHeight: 23,
  },
  feedStats: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 4,
  },
  replyRow: {
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.stroke.subtle,
  },
  replyBody: {
    ...Typography.body,
    color: Colors.text.primary,
  },
  replyTime: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    marginTop: 4,
  },
  emptyInline: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: Spacing.md,
  },
  stateWrap: {
    marginTop: Spacing.lg,
  },
  stateText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  footerWrap: {
    marginTop: Spacing.xxl,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  version: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'center',
  },
  sheetContent: {
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  settingLabel: {
    ...Typography.body,
    color: Colors.text.primary,
    flex: 1,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  sheetSectionTitle: {
    ...Typography.title3,
    color: Colors.text.primary,
  },
  sheetSectionHint: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  sheetSectionSubTitle: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    marginTop: Spacing.xs,
  },
  formSection: {
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bg.secondary,
    padding: Spacing.sm,
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    ...Typography.captionEmphasis,
    color: Colors.text.primary,
  },
  fieldHint: {
    ...Typography.caption,
    color: Colors.text.tertiary,
  },
  feesRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  feeField: {
    flex: 1,
    gap: 6,
  },
  modeTextBlock: {
    flex: 1,
    gap: 2,
  },
  modeHint: {
    ...Typography.caption,
    color: Colors.text.tertiary,
  },
  sheetInput: {
    borderWidth: 1,
    borderColor: Colors.stroke.soft,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    ...Typography.captionEmphasis,
    color: Colors.text.primary,
  },
  sheetInputMultiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  slotTypeRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  inlineInputs: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  inlineField: {
    flex: 1,
    gap: 6,
  },
  inlineInput: {
    flex: 1,
  },
  weekdayWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  slotList: {
    gap: Spacing.xs,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.bg.secondary,
  },
  slotMetaWrap: {
    flex: 1,
    paddingRight: Spacing.xs,
  },
  slotDeleteBtn: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xxs,
  },
  slotMain: {
    ...Typography.captionEmphasis,
    color: Colors.text.primary,
  },
  slotSub: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
  },
});
