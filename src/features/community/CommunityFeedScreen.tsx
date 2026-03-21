import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  AppSheet,
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PillChip,
} from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { UICopy } from '../../core/constants/uiCopy';
import { useTabSafeBottomPadding } from '../../core/hooks/useTabSafeBottomPadding';
import { CommunityFeedItem, CommunityFeedSort } from '../../core/models/types';
import {
  fetchCommunityFeed,
  fetchCommunityTopics,
  incrementCommunityShareCount,
  reportCommunityPost,
  repostCommunityPost,
  toggleCommunityFollow,
  toggleCommunityPostLike,
  upsertCommunityDmThread,
} from '../../core/services/communityService';
import { Colors, Radius, Spacing, Typography } from '../../core/theme';
import { supabase } from '../../services/supabase';

const relativeTime = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
};

const toPreferredSlugs = (intentTags: string[]) => {
  const normalized = new Set(intentTags.map((tag) => tag.toLowerCase()));
  const slugs: string[] = [];
  if ([...normalized].some((tag) => tag.includes('stress') || tag.includes('anx'))) slugs.push('stress-and-anxiety');
  if ([...normalized].some((tag) => tag.includes('relationship') || tag.includes('attach'))) slugs.push('relationships');
  if ([...normalized].some((tag) => tag.includes('sleep'))) slugs.push('sleep-and-routine');
  if ([...normalized].some((tag) => tag.includes('grief') || tag.includes('loss'))) slugs.push('grief-and-transition');
  if ([...normalized].some((tag) => tag.includes('work') || tag.includes('burnout'))) slugs.push('work-and-burnout');
  return Array.from(new Set(slugs));
};

export const CommunityFeedScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, profile } = useAuth();
  const tabSafeBottomPadding = useTabSafeBottomPadding(Spacing.xxl);
  const [feed, setFeed] = useState<CommunityFeedItem[]>([]);
  const [topics, setTopics] = useState<Array<{ id: string; slug: string; title: string }>>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [preferredSlugs, setPreferredSlugs] = useState<string[]>([]);
  const [sort, setSort] = useState<CommunityFeedSort>('top');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const likeAnimRef = useRef<Record<string, Animated.Value>>({});

  const [activePost, setActivePost] = useState<CommunityFeedItem | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [messageSheetVisible, setMessageSheetVisible] = useState(false);
  const [messageDraft, setMessageDraft] = useState('Hey, your post resonated with me. Open to chat?');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!actionFeedback) return undefined;
    const timeout = setTimeout(() => setActionFeedback(null), 2400);
    return () => clearTimeout(timeout);
  }, [actionFeedback]);

  const getAnim = (postId: string) => {
    if (!likeAnimRef.current[postId]) {
      likeAnimRef.current[postId] = new Animated.Value(1);
    }
    return likeAnimRef.current[postId];
  };

  const loadPreferences = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('user_preferences')
      .select('intent_tags')
      .eq('user_id', user.id)
      .maybeSingle();
    const tags = (data?.intent_tags || []) as string[];
    setPreferredSlugs(toPreferredSlugs(tags));
  }, [user?.id]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      setError(null);
      const [topicRows, feedRows] = await Promise.all([
        fetchCommunityTopics(),
        fetchCommunityFeed({
          userId: user.id,
          preferredTopicSlugs: preferredSlugs,
          topicId: selectedTopicId,
          limit: 28,
          sort,
        }),
      ]);
      setTopics(topicRows.map((item) => ({ id: item.id, slug: item.slug, title: item.title })));
      setFeed(feedRows);
    } catch (err: any) {
      setError(err?.message || 'Could not load community right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [preferredSlugs, selectedTopicId, sort, user?.id]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  useEffect(() => {
    load();
  }, [load]);

  const onLike = async (item: CommunityFeedItem) => {
    if (!user?.id) return;
    const anim = getAnim(item.post.id);
    Animated.sequence([
      Animated.spring(anim, { toValue: 1.15, useNativeDriver: true, speed: 28, bounciness: 7 }),
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 7 }),
    ]).start();

    const nextLiked = !item.viewerLiked;
    setFeed((prev) => prev.map((row) => (
      row.post.id === item.post.id
        ? {
          ...row,
          viewerLiked: nextLiked,
          post: {
            ...row.post,
            likes_count: Math.max(0, row.post.likes_count + (nextLiked ? 1 : -1)),
          },
        }
        : row
    )));

    try {
      await toggleCommunityPostLike({
        userId: user.id,
        postId: item.post.id,
        liked: item.viewerLiked,
      });
    } catch {
      setFeed((prev) => prev.map((row) => (
        row.post.id === item.post.id
          ? {
            ...row,
            viewerLiked: item.viewerLiked,
            post: {
              ...row.post,
              likes_count: item.post.likes_count,
            },
          }
          : row
      )));
    }
  };

  const onFollowToggle = async () => {
    if (!user?.id || !activePost) return;
    if (activePost.post.author_id === user.id) return;
    try {
      await toggleCommunityFollow({
        followerId: user.id,
        followeeId: activePost.post.author_id,
        following: Boolean(activePost.viewerFollowingAuthor),
      });
      setFeed((prev) => prev.map((row) => (
        row.post.id === activePost.post.id
          ? { ...row, viewerFollowingAuthor: !activePost.viewerFollowingAuthor }
          : row
      )));
      setActivePost((prev) => (prev ? { ...prev, viewerFollowingAuthor: !prev.viewerFollowingAuthor } : prev));
      setActionFeedback(activePost.viewerFollowingAuthor ? 'Unfollowed member.' : 'Following member.');
      setActionSheetVisible(false);
    } catch (err: any) {
      setError(err?.message || 'Unable to update follow state.');
    }
  };

  const onRepost = async (item: CommunityFeedItem) => {
    if (!user?.id) return;
    try {
      await repostCommunityPost({ userId: user.id, postId: item.post.id });
      setFeed((prev) => prev.map((row) => (
        row.post.id === item.post.id
          ? { ...row, post: { ...row.post, reposts_count: row.post.reposts_count + 1 } }
          : row
      )));
      setActionFeedback('Reposted to your profile.');
    } catch {
      // Keep UI stable.
    }
  };

  const onShare = async (item: CommunityFeedItem) => {
    try {
      await Share.share({
        message: `${item.post.author_alias}: ${item.post.body}`,
      });
      await incrementCommunityShareCount(item.post.id);
      setFeed((prev) => prev.map((row) => (
        row.post.id === item.post.id
          ? { ...row, post: { ...row.post, shares_count: row.post.shares_count + 1 } }
          : row
      )));
      setActionFeedback('Share sheet opened.');
    } catch {
      // No-op.
    }
  };

  const sendMessageRequest = async () => {
    if (!user?.id || !activePost || !messageDraft.trim() || sendingMessage) return;
    setSendingMessage(true);
    try {
      await upsertCommunityDmThread({
        senderId: user.id,
        receiverId: activePost.post.author_id,
        firstMessage: messageDraft.trim(),
      });
      setMessageSheetVisible(false);
      setActionSheetVisible(false);
      setActionFeedback('Message request sent.');
      navigation.navigate('MessagesTab', { screen: 'MessagesList' });
    } catch (err: any) {
      setError(err?.message || 'Unable to send message request.');
    } finally {
      setSendingMessage(false);
    }
  };

  const title = useMemo(
    () => (profile?.role === 'therapist' || profile?.role === 'admin' ? 'Professional community' : 'Community'),
    [profile?.role],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{UICopy.home.communitySubtitle}</Text>
        </View>
        <TouchableOpacity
          style={styles.composeBtn}
          onPress={() => navigation.navigate('CreatePost')}
          accessibilityRole="button"
          accessibilityLabel="Create post"
        >
          <Ionicons name="create-outline" size={18} color={Colors.text.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        <PillChip label="Top" selected={sort === 'top'} onPress={() => setSort('top')} />
        <PillChip label="Recent" selected={sort === 'recent'} onPress={() => setSort('recent')} />
      </View>

      <ScrollView
        horizontal
        style={styles.topicScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.topicRow}
      >
        {[{ id: 'all', title: 'All' }, ...topics].map((item) => {
          const selected = item.id === 'all' ? selectedTopicId === null : selectedTopicId === item.id;
          return (
            <PillChip
              key={item.id}
              label={item.title}
              selected={selected}
              style={styles.topicChip}
              onPress={() => setSelectedTopicId(item.id === 'all' ? null : item.id)}
            />
          );
        })}
      </ScrollView>

      {actionFeedback ? <Text style={styles.actionFeedback}>{actionFeedback}</Text> : null}

      {loading ? (
        <LoadingState message="Loading community..." style={styles.stateWrap} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} style={styles.stateWrap} />
      ) : feed.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No posts yet"
          message="Start with one post about what you are feeling today."
          actionLabel="Write first post"
          onAction={() => navigation.navigate('CreatePost')}
          style={styles.stateWrap}
        />
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(item) => item.post.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabSafeBottomPadding }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={Colors.accent.primary}
            />
          }
          renderItem={({ item }) => {
            const likeAnim = getAnim(item.post.id);
            return (
              <View style={styles.threadRow}>
                <TouchableOpacity
                  onPress={() => {
                    setActivePost(item);
                    setActionSheetVisible(true);
                  }}
                >
                  <Avatar
                    uri={item.authorProfile?.avatar_url || null}
                    name={item.post.author_alias}
                    size={42}
                  />
                </TouchableOpacity>
                <View style={styles.threadBody}>
                  <View style={styles.threadMetaRow}>
                    <View style={styles.threadAuthorWrap}>
                      <Text style={styles.threadAuthor}>{item.post.author_alias}</Text>
                      {item.post.role_badge !== 'member' ? (
                        <View style={styles.verifiedDot}>
                          <Ionicons name="checkmark-circle" size={14} color={Colors.accent.primary} />
                        </View>
                      ) : null}
                      <Text style={styles.threadTime}>{relativeTime(item.post.created_at)}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        setActivePost(item);
                        setActionSheetVisible(true);
                      }}
                    >
                      <Ionicons name="ellipsis-horizontal" size={18} color={Colors.text.tertiary} />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.topicText}>#{item.topic.title}</Text>
                  <Text style={styles.bodyText}>{item.post.body}</Text>

                  {item.media?.length ? (
                    <View style={styles.mediaWrap}>
                      {item.media.slice(0, 1).map((media) => (
                        <Image key={media.id} source={{ uri: media.media_url }} style={styles.mediaImage} resizeMode="cover" />
                      ))}
                    </View>
                  ) : null}

                  <View style={styles.actionRow}>
                    <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => onLike(item)}>
                        <Ionicons
                          name={item.viewerLiked ? 'heart' : 'heart-outline'}
                          size={19}
                          color={item.viewerLiked ? Colors.status.danger : Colors.text.secondary}
                        />
                        <Text style={styles.actionText}>{item.post.likes_count}</Text>
                      </TouchableOpacity>
                    </Animated.View>

                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => navigation.navigate('PostDetail', { postId: item.post.id })}
                    >
                      <Ionicons name="chatbubble-outline" size={18} color={Colors.text.secondary} />
                      <Text style={styles.actionText}>{item.post.comments_count}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={() => onRepost(item)}>
                      <Ionicons name="repeat-outline" size={19} color={Colors.text.secondary} />
                      <Text style={styles.actionText}>{item.post.reposts_count}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={() => onShare(item)}>
                      <Ionicons name="paper-plane-outline" size={19} color={Colors.text.secondary} />
                      <Text style={styles.actionText}>{item.post.shares_count}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.threadSeparator} />}
        />
      )}

      <AppSheet
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        title="Post options"
        subtitle={activePost ? `From ${activePost.post.author_alias}` : undefined}
      >
        {activePost?.post.author_id !== user?.id ? (
          <TouchableOpacity
            style={styles.sheetRow}
            onPress={() => {
              if (!activePost) return;
              setMessageSheetVisible(true);
            }}
          >
            <Text style={styles.sheetRowText}>Message</Text>
            <Ionicons name="chatbubble-outline" size={18} color={Colors.text.secondary} />
          </TouchableOpacity>
        ) : null}

        {activePost?.post.author_id !== user?.id ? (
          <TouchableOpacity style={styles.sheetRow} onPress={onFollowToggle}>
            <Text style={styles.sheetRowText}>
              {activePost?.viewerFollowingAuthor ? 'Unfollow' : 'Follow'}
            </Text>
            <Ionicons
              name={activePost?.viewerFollowingAuthor ? 'person-remove-outline' : 'person-add-outline'}
              size={18}
              color={Colors.text.secondary}
            />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.sheetRow}
          onPress={async () => {
            if (!activePost) return;
            await onShare(activePost);
            setActionSheetVisible(false);
          }}
        >
          <Text style={styles.sheetRowText}>Share post</Text>
          <Ionicons name="share-social-outline" size={18} color={Colors.text.secondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sheetRow}
          onPress={async () => {
            if (!user?.id || !activePost) return;
            try {
              await reportCommunityPost({
                userId: user.id,
                postId: activePost.post.id,
                reason: 'reported_from_mobile_sheet',
              });
              setActionFeedback('Report submitted for review.');
            } catch {
              setError('Unable to submit report right now.');
            } finally {
              setActionSheetVisible(false);
            }
          }}
        >
          <Text style={[styles.sheetRowText, styles.sheetRowDanger]}>Report</Text>
          <Ionicons name="alert-circle-outline" size={18} color={Colors.status.danger} />
        </TouchableOpacity>
      </AppSheet>

      <AppSheet
        visible={messageSheetVisible}
        onClose={() => setMessageSheetVisible(false)}
        title={activePost ? `Message ${activePost.post.author_alias}` : 'Message'}
        subtitle="If they do not follow you, this goes to DM requests."
      >
        <TextInput
          style={styles.messageInput}
          multiline
          maxLength={500}
          value={messageDraft}
          onChangeText={setMessageDraft}
          placeholder="Write a respectful first message"
          placeholderTextColor={Colors.text.tertiary}
        />
        <View style={styles.messageActions}>
          <Button
            title="Cancel"
            variant="secondary"
            fullWidth={false}
            style={{ flex: 1 }}
            onPress={() => setMessageSheetVisible(false)}
          />
          <Button
            title="Send request"
            fullWidth={false}
            style={{ flex: 1 }}
            onPress={sendMessageRequest}
            loading={sendingMessage}
            disabled={!messageDraft.trim() || sendingMessage}
          />
        </View>
      </AppSheet>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    ...Typography.title1,
    color: Colors.text.primary,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  composeBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke.soft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.secondary,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxs,
  },
  topicScroll: {
    flexGrow: 0,
    maxHeight: 44,
  },
  topicRow: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
    alignItems: 'center',
    minHeight: 36,
  },
  topicChip: {
    maxWidth: 170,
  },
  actionFeedback: {
    ...Typography.caption,
    color: Colors.text.secondary,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xs,
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  threadRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  threadBody: {
    flex: 1,
    gap: 3,
  },
  threadMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  threadAuthorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  threadAuthor: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  verifiedDot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  threadTime: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    marginLeft: 4,
  },
  topicText: {
    ...Typography.caption,
    color: Colors.text.tertiary,
  },
  bodyText: {
    ...Typography.body,
    color: Colors.text.primary,
    lineHeight: 24,
  },
  mediaWrap: {
    marginTop: Spacing.xs,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    overflow: 'hidden',
  },
  mediaImage: {
    width: '100%',
    aspectRatio: 1.4,
  },
  actionRow: {
    marginTop: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  threadSeparator: {
    height: 1,
    backgroundColor: Colors.stroke.subtle,
    marginLeft: 52,
  },
  stateWrap: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
  sheetRow: {
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetRowText: {
    ...Typography.bodyEmphasis,
    color: Colors.text.primary,
  },
  sheetRowDanger: {
    color: Colors.status.danger,
  },
  messageInput: {
    borderWidth: 1,
    borderColor: Colors.stroke.soft,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bg.secondary,
    minHeight: 120,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    ...Typography.body,
    color: Colors.text.primary,
    textAlignVertical: 'top',
  },
  messageActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
});
