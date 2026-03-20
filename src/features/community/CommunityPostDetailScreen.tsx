import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppSheet, Avatar, Button, ErrorState, LoadingState } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import {
  createCommunityComment,
  fetchCommunityComments,
  fetchCommunityPostDetail,
  incrementCommunityShareCount,
  reportCommunityPost,
  repostCommunityPost,
  toggleCommunityPostLike,
} from '../../core/services/communityService';
import { Colors, Radius, Spacing, Typography } from '../../core/theme';
import { CommunityComment, CommunityPost, CommunityPostMedia, CommunityTopic } from '../../core/models/types';
import { useTabSafeBottomPadding } from '../../core/hooks/useTabSafeBottomPadding';

const relativeTime = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
};

export const CommunityPostDetailScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { user, profile } = useAuth();
  const tabSafeBottomPadding = useTabSafeBottomPadding(Spacing.md);
  const postId = route?.params?.postId as string;
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [topic, setTopic] = useState<Pick<CommunityTopic, 'id' | 'slug' | 'title'> | null>(null);
  const [postMedia, setPostMedia] = useState<CommunityPostMedia[]>([]);
  const [authorProfile, setAuthorProfile] = useState<{
    id: string;
    display_name: string | null;
    first_name: string | null;
    avatar_url: string | null;
    handle: string | null;
    role: 'user' | 'therapist' | 'admin' | null;
  } | null>(null);
  const [viewerLiked, setViewerLiked] = useState(false);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !postId) return;
    try {
      setError(null);
      const [postRow, commentRows] = await Promise.all([
        fetchCommunityPostDetail(postId, user.id),
        fetchCommunityComments(postId),
      ]);
      setPost(postRow.post);
      setTopic(postRow.topic);
      setPostMedia(postRow.media || []);
      setAuthorProfile((postRow as any).authorProfile || null);
      setViewerLiked(postRow.viewerLiked);
      setComments(commentRows);
    } catch (err: any) {
      setError(err?.message || 'Could not load post.');
    } finally {
      setLoading(false);
    }
  }, [postId, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const submitComment = async () => {
    if (!user?.id || !post || !draft.trim().length || submitting) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const result = await createCommunityComment({
        userId: user.id,
        profile,
        postId: post.id,
        body: draft.trim(),
      });

      if (result.moderation_state === 'blocked') {
        setFeedback('Comment blocked because it included contact-sharing details.');
      } else if (result.moderation_state === 'pending_review') {
        setFeedback('Comment sent for review before it appears publicly.');
      } else {
        setFeedback(null);
      }

      setDraft('');
      await load();
    } catch {
      setFeedback('Could not post comment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleLike = async () => {
    if (!user?.id || !post) return;
    const nextLiked = !viewerLiked;
    const previousLikes = post.likes_count;
    setViewerLiked(nextLiked);
    setPost((prev) => (prev ? { ...prev, likes_count: Math.max(0, prev.likes_count + (nextLiked ? 1 : -1)) } : prev));
    try {
      await toggleCommunityPostLike({
        userId: user.id,
        postId: post.id,
        liked: !nextLiked,
      });
    } catch {
      setViewerLiked(!nextLiked);
      setPost((prev) => (prev ? { ...prev, likes_count: previousLikes } : prev));
    }
  };

  const repost = async () => {
    if (!user?.id || !post) return;
    setPost((prev) => (prev ? { ...prev, reposts_count: prev.reposts_count + 1 } : prev));
    try {
      await repostCommunityPost({ userId: user.id, postId: post.id });
    } catch {
      setPost((prev) => (prev ? { ...prev, reposts_count: Math.max(0, prev.reposts_count - 1) } : prev));
    }
  };

  const sharePost = async () => {
    if (!post) return;
    try {
      await Share.share({ message: `${post.author_alias}: ${post.body}` });
      await incrementCommunityShareCount(post.id);
      setPost((prev) => (prev ? { ...prev, shares_count: prev.shares_count + 1 } : prev));
    } catch {
      // Ignore cancelled share.
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <LoadingState message="Loading post..." style={styles.stateWrap} />
      </SafeAreaView>
    );
  }

  if (error || !post) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ErrorState message={error || 'Post not found.'} onRetry={load} style={styles.stateWrap} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={18} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => setActionSheetVisible(true)}>
          <Ionicons name="ellipsis-horizontal" size={18} color={Colors.text.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={comments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabSafeBottomPadding + 96 }]}
        ListHeaderComponent={(
          <View style={styles.postCard}>
            <View style={styles.topMeta}>
              <View style={styles.authorMeta}>
                <Avatar
                  uri={authorProfile?.avatar_url || null}
                  name={post.author_alias}
                  size={34}
                />
                <View style={styles.authorTextWrap}>
                  <Text style={styles.alias}>{post.author_alias}</Text>
                  {authorProfile?.handle ? <Text style={styles.handleText}>@{authorProfile.handle}</Text> : null}
                </View>
              </View>
              <Text style={styles.time}>{relativeTime(post.created_at)}</Text>
            </View>
            <Text style={styles.topic}>{topic?.title || 'Community'}</Text>
            <Text style={styles.body}>{post.body}</Text>
            {postMedia.length ? (
              <View style={styles.mediaWrap}>
                <Image source={{ uri: postMedia[0].media_url }} style={styles.mediaImage} resizeMode="cover" />
              </View>
            ) : null}
            <View style={styles.postMetaRow}>
              <Text style={styles.metaText}>{post.likes_count} likes</Text>
              <Text style={styles.metaText}>{post.comments_count} comments</Text>
              <Text style={styles.metaText}>{post.reposts_count} reposts</Text>
              {viewerLiked ? (
                <View style={styles.likedBadge}>
                  <Ionicons name="heart" size={12} color={Colors.status.danger} />
                  <Text style={styles.likedBadgeText}>Liked</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={toggleLike}>
                <Ionicons
                  name={viewerLiked ? 'heart' : 'heart-outline'}
                  size={18}
                  color={viewerLiked ? Colors.status.danger : Colors.text.secondary}
                />
                <Text style={styles.actionText}>Like</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={repost}>
                <Ionicons name="repeat-outline" size={18} color={Colors.text.secondary} />
                <Text style={styles.actionText}>Repost</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={sharePost}>
                <Ionicons name="paper-plane-outline" size={18} color={Colors.text.secondary} />
                <Text style={styles.actionText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.commentCard}>
            <View style={styles.commentTop}>
              <Text style={styles.commentAuthor}>{item.author_alias}</Text>
              <Text style={styles.commentTime}>{relativeTime(item.created_at)}</Text>
            </View>
            <Text style={styles.commentBody}>{item.body}</Text>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a supportive reply"
            placeholderTextColor={Colors.text.tertiary}
            multiline
            maxLength={320}
          />
          <Button
            title="Reply"
            variant="primary"
            fullWidth={false}
            onPress={submitComment}
            disabled={!draft.trim().length || submitting}
            loading={submitting}
            style={styles.replyBtn}
          />
        </View>
        {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}
      </KeyboardAvoidingView>

      <AppSheet
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        title="Post options"
      >
        <TouchableOpacity style={styles.sheetRow} onPress={sharePost}>
          <Text style={styles.sheetRowText}>Share post</Text>
          <Ionicons name="share-social-outline" size={18} color={Colors.text.secondary} />
        </TouchableOpacity>
        {post.author_id !== user?.id ? (
          <TouchableOpacity
            style={styles.sheetRow}
            onPress={async () => {
              if (!user?.id || !post?.id) return;
              try {
                await reportCommunityPost({
                  userId: user.id,
                  postId: post.id,
                  reason: 'reported_from_post_detail',
                });
                setFeedback('Thanks. Your report was submitted for review.');
              } catch {
                setFeedback('Unable to submit report right now.');
              } finally {
                setActionSheetVisible(false);
              }
            }}
          >
            <Text style={[styles.sheetRowText, styles.sheetRowDanger]}>Report post</Text>
            <Ionicons name="alert-circle-outline" size={18} color={Colors.status.danger} />
          </TouchableOpacity>
        ) : null}
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
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  postCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.secondary,
    padding: Spacing.md,
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  topMeta: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  authorMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  authorTextWrap: {
    flex: 1,
  },
  alias: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  handleText: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    marginTop: 1,
  },
  time: {
    ...Typography.caption,
    color: Colors.text.tertiary,
  },
  topic: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
  },
  body: {
    ...Typography.body,
    color: Colors.text.primary,
    lineHeight: 23,
  },
  mediaWrap: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    overflow: 'hidden',
  },
  mediaImage: {
    width: '100%',
    aspectRatio: 1.2,
  },
  postMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
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
  metaText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  likedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.status.danger + '45',
    backgroundColor: Colors.status.dangerSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  likedBadgeText: {
    ...Typography.micro,
    color: Colors.status.danger,
    textTransform: 'none',
    letterSpacing: 0,
    lineHeight: 14,
  },
  commentCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.secondary,
    padding: Spacing.sm,
    gap: 4,
  },
  commentTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commentAuthor: {
    ...Typography.captionEmphasis,
    color: Colors.text.primary,
  },
  commentTime: {
    ...Typography.caption,
    color: Colors.text.tertiary,
  },
  commentBody: {
    ...Typography.caption,
    color: Colors.text.secondary,
    lineHeight: 19,
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: Colors.stroke.subtle,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs,
    backgroundColor: Colors.bg.primary,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke.soft,
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    ...Typography.captionEmphasis,
    color: Colors.text.primary,
  },
  replyBtn: {
    minWidth: 88,
  },
  feedbackText: {
    ...Typography.caption,
    color: Colors.status.warning,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
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
  stateWrap: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
});
