import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../services/supabase';
import {
  CommunityComment,
  CommunityDmMessage,
  CommunityDmThread,
  CommunityFeedItem,
  CommunityFeedSort,
  CommunityModerationState,
  CommunityPost,
  CommunityPostMedia,
  CommunityTopic,
  Profile,
} from '../models/types';
import { moderateMessage } from '../utils/moderation';

const COMMUNITY_MEDIA_BUCKET = 'avatars';

type FeedOptions = {
  userId: string;
  preferredTopicSlugs?: string[];
  topicId?: string | null;
  limit?: number;
  sort?: CommunityFeedSort;
};

type CommunityPostMediaInput = {
  mediaType: 'image' | 'gif';
  mediaUrl: string;
  mediaThumbUrl?: string | null;
  width?: number | null;
  height?: number | null;
  sortIndex?: number;
};

const rankByRecency = (createdAt: string) => {
  const ageHours = Math.max(1, (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60));
  return 100 / ageHours;
};

export const getCommunityAlias = (profile: Profile | null, userId: string) => {
  if (profile?.role === 'admin') return `Care Team`;
  if (profile?.role === 'therapist') return `Dr. ${profile.display_name || profile.first_name || 'Therapist'}`;
  const shortId = userId.replace(/-/g, '').slice(0, 6).toUpperCase();
  const name = profile?.display_name || profile?.first_name;
  return name ? `${name}` : `Member ${shortId}`;
};

export const getCommunityRoleBadge = (profile: Profile | null): 'member' | 'therapist' | 'admin' => {
  if (profile?.role === 'therapist') return 'therapist';
  if (profile?.role === 'admin') return 'admin';
  return 'member';
};

const evaluateModeration = (body: string): {
  state: CommunityModerationState;
  reason: string | null;
  crisisFlag: boolean;
} => {
  const result = moderateMessage(body);
  if (result.isBlocked) {
    return {
      state: 'blocked',
      reason: result.reason || 'blocked_content',
      crisisFlag: false,
    };
  }

  if (result.isCrisis) {
    return {
      state: 'pending_review',
      reason: result.reason || 'crisis_keyword',
      crisisFlag: true,
    };
  }

  return {
    state: 'approved',
    reason: null,
    crisisFlag: false,
  };
};

const fetchMediaByPostIds = async (postIds: string[]) => {
  if (!postIds.length) return new Map<string, CommunityPostMedia[]>();
  const { data, error } = await supabase
    .from('community_post_media')
    .select('id,post_id,comment_id,media_type,media_url,media_thumb_url,width,height,sort_index,created_by,created_at')
    .in('post_id', postIds)
    .order('sort_index', { ascending: true });
  if (error) throw error;
  const map = new Map<string, CommunityPostMedia[]>();
  for (const row of (data || []) as CommunityPostMedia[]) {
    if (!row.post_id) continue;
    const list = map.get(row.post_id) || [];
    list.push(row);
    map.set(row.post_id, list);
  }
  return map;
};

export const pickCommunityImage = async (): Promise<ImagePicker.ImagePickerAsset | null> => {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo permission is required to add media.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 0.86,
  });

  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0];
};

export const uploadCommunityImage = async ({
  userId,
  uri,
  fileExt = 'jpg',
}: {
  userId: string;
  uri: string;
  fileExt?: string;
}) => {
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  const ext = fileExt.toLowerCase() === 'png' ? 'png' : 'jpg';
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const path = `${userId}/community/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(COMMUNITY_MEDIA_BUCKET)
    .upload(path, arrayBuffer, {
      contentType,
      upsert: false,
    });

  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from(COMMUNITY_MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
};

export const fetchCommunityTopics = async (): Promise<CommunityTopic[]> => {
  const { data, error } = await supabase
    .from('community_topics')
    .select('id,slug,title,description,is_active,created_at')
    .eq('is_active', true)
    .order('title', { ascending: true });

  if (error) throw error;
  return (data || []) as CommunityTopic[];
};

export const fetchCommunityFeed = async ({
  userId,
  preferredTopicSlugs = [],
  topicId,
  limit = 20,
  sort = 'top',
}: FeedOptions): Promise<CommunityFeedItem[]> => {
  const postsQuery = supabase
    .from('community_posts')
    .select(`
      id,author_id,author_alias,role_badge,topic_id,body,moderation_state,moderation_reason,crisis_flag,
      likes_count,comments_count,reposts_count,shares_count,created_at,updated_at,
      topic:community_topics!inner(id,slug,title)
    `)
    .eq('moderation_state', 'approved')
    .order('created_at', { ascending: false })
    .limit(Math.max(limit * 3, 40));

  const filteredQuery = topicId ? postsQuery.eq('topic_id', topicId) : postsQuery;
  const { data: posts, error: postsError } = await filteredQuery;
  if (postsError) throw postsError;

  const postIds = (posts || []).map((item: any) => item.id);
  const authorIds = Array.from(new Set((posts || []).map((item: any) => item.author_id).filter(Boolean)));

  const [likesResult, mediaMap, followingResult] = await Promise.all([
    postIds.length > 0
      ? supabase
          .from('community_reactions')
          .select('post_id')
          .eq('user_id', userId)
          .in('post_id', postIds)
      : Promise.resolve({ data: null, error: null } as any),
    fetchMediaByPostIds(postIds),
    authorIds.length > 0
      ? supabase
          .from('community_follows')
          .select('followee_id')
          .eq('follower_id', userId)
          .in('followee_id', authorIds)
      : Promise.resolve({ data: null, error: null } as any),
  ]);

  const authorProfileMap = new Map<string, {
    id: string;
    display_name: string | null;
    first_name: string | null;
    avatar_url: string | null;
    handle: string | null;
    role: 'user' | 'therapist' | 'admin' | null;
  }>();
  if (authorIds.length > 0) {
    const { data: authorRows, error: authorError } = await supabase
      .from('profiles')
      .select('id,display_name,first_name,avatar_url,handle,role')
      .in('id', authorIds);
    if (authorError) throw authorError;
    for (const row of authorRows || []) {
      authorProfileMap.set(row.id, row as any);
    }
  }

  const likedPostIds = new Set((likesResult.data || []).map((item: any) => item.post_id));
  const followedAuthorIds = new Set((followingResult.data || []).map((item: any) => item.followee_id));
  const preferred = new Set(preferredTopicSlugs.map((slug) => slug.toLowerCase()));

  const feed = (posts || []).map((item: any) => {
    const topic = item.topic || {};
    const topicBoost = preferred.has(String(topic.slug || '').toLowerCase()) ? 35 : 0;
    const therapistBoost = item.role_badge === 'therapist' ? 10 : 0;
    const engagementBoost = Math.min(25, (item.likes_count || 0) + (item.comments_count || 0) * 1.5);
    const recencyScore = rankByRecency(item.created_at);
    const rankScore = recencyScore + topicBoost + therapistBoost + engagementBoost;

    return {
      post: item as CommunityPost,
      topic: {
        id: topic.id,
        slug: topic.slug,
        title: topic.title,
      },
      viewerLiked: likedPostIds.has(item.id),
      viewerFollowingAuthor: followedAuthorIds.has(item.author_id),
      authorProfile: authorProfileMap.get(item.author_id) || null,
      media: mediaMap.get(item.id) || [],
      rankScore,
    } as CommunityFeedItem;
  });

  const sorted = sort === 'recent'
    ? feed.sort((a, b) => new Date(b.post.created_at).getTime() - new Date(a.post.created_at).getTime())
    : feed.sort((a, b) => b.rankScore - a.rankScore);

  return sorted.slice(0, limit);
};

export const fetchCommunityPulse = async (
  userId: string,
  preferredTopicSlugs: string[] = [],
): Promise<CommunityFeedItem[]> => fetchCommunityFeed({
  userId,
  preferredTopicSlugs,
  limit: 2,
  sort: 'top',
});

export const createCommunityPost = async ({
  userId,
  profile,
  topicId,
  body,
  media = [],
}: {
  userId: string;
  profile: Profile | null;
  topicId: string;
  body: string;
  media?: CommunityPostMediaInput[];
}) => {
  const moderation = evaluateModeration(body);
  const { data, error } = await supabase
    .from('community_posts')
    .insert({
      author_id: userId,
      author_alias: getCommunityAlias(profile, userId),
      role_badge: getCommunityRoleBadge(profile),
      topic_id: topicId,
      body,
      moderation_state: moderation.state,
      moderation_reason: moderation.reason,
      crisis_flag: moderation.crisisFlag,
    })
    .select('id,moderation_state,moderation_reason,crisis_flag')
    .single();

  if (error) throw error;

  if (media.length > 0) {
    const rows = media.map((item, index) => ({
      post_id: data.id,
      media_type: item.mediaType,
      media_url: item.mediaUrl,
      media_thumb_url: item.mediaThumbUrl || null,
      width: item.width || null,
      height: item.height || null,
      sort_index: item.sortIndex ?? index,
      created_by: userId,
    }));
    const { error: mediaError } = await supabase.from('community_post_media').insert(rows);
    if (mediaError) throw mediaError;
  }

  return data as {
    id: string;
    moderation_state: CommunityModerationState;
    moderation_reason: string | null;
    crisis_flag: boolean;
  };
};

export const fetchCommunityPostDetail = async (postId: string, userId: string) => {
  const [{ data: post, error: postError }, { data: likes }] = await Promise.all([
    supabase
      .from('community_posts')
      .select(`
        id,author_id,author_alias,role_badge,topic_id,body,moderation_state,moderation_reason,crisis_flag,
        likes_count,comments_count,reposts_count,shares_count,created_at,updated_at,
        topic:community_topics!inner(id,slug,title)
      `)
      .eq('id', postId)
      .single(),
    supabase
      .from('community_reactions')
      .select('post_id')
      .eq('user_id', userId)
      .eq('post_id', postId),
  ]);

  if (postError) throw postError;

  const mediaMap = await fetchMediaByPostIds([postId]);
  const authorProfileResult = await supabase
    .from('profiles')
    .select('id,display_name,first_name,avatar_url,handle,role')
    .eq('id', (post as CommunityPost).author_id)
    .maybeSingle();
  if (authorProfileResult.error) throw authorProfileResult.error;

  return {
    post: post as CommunityPost,
    topic: (post as any).topic as Pick<CommunityTopic, 'id' | 'slug' | 'title'>,
    viewerLiked: Boolean(likes?.length),
    authorProfile: authorProfileResult.data || null,
    media: mediaMap.get(postId) || [],
  };
};

export const fetchCommunityComments = async (postId: string): Promise<CommunityComment[]> => {
  const { data, error } = await supabase
    .from('community_comments')
    .select('id,post_id,author_id,author_alias,role_badge,body,moderation_state,moderation_reason,crisis_flag,created_at')
    .eq('post_id', postId)
    .eq('moderation_state', 'approved')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as CommunityComment[];
};

export const createCommunityComment = async ({
  userId,
  profile,
  postId,
  body,
}: {
  userId: string;
  profile: Profile | null;
  postId: string;
  body: string;
}) => {
  const moderation = evaluateModeration(body);
  const { data, error } = await supabase
    .from('community_comments')
    .insert({
      post_id: postId,
      author_id: userId,
      author_alias: getCommunityAlias(profile, userId),
      role_badge: getCommunityRoleBadge(profile),
      body,
      moderation_state: moderation.state,
      moderation_reason: moderation.reason,
      crisis_flag: moderation.crisisFlag,
    })
    .select('id,moderation_state,moderation_reason,crisis_flag')
    .single();
  if (error) throw error;
  return data as {
    id: string;
    moderation_state: CommunityModerationState;
    moderation_reason: string | null;
    crisis_flag: boolean;
  };
};

export const reportCommunityPost = async ({
  userId,
  postId,
  reason,
}: {
  userId: string;
  postId: string;
  reason: string;
}) => {
  const { error } = await supabase
    .from('community_reports')
    .insert({
      post_id: postId,
      reporter_id: userId,
      reason,
      status: 'open',
    });
  if (error) throw error;
};

export const toggleCommunityPostLike = async ({
  userId,
  postId,
  liked,
}: {
  userId: string;
  postId: string;
  liked: boolean;
}) => {
  if (liked) {
    const { error } = await supabase
      .from('community_reactions')
      .delete()
      .eq('user_id', userId)
      .eq('post_id', postId)
      .eq('reaction_type', 'like');
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('community_reactions')
    .insert({
      user_id: userId,
      post_id: postId,
      reaction_type: 'like',
    });
  if (error) throw error;
};

export const repostCommunityPost = async ({
  userId,
  postId,
}: {
  userId: string;
  postId: string;
}) => {
  const { error } = await supabase
    .from('community_reposts')
    .insert({
      user_id: userId,
      post_id: postId,
    });
  if (error) throw error;
};

export const incrementCommunityShareCount = async (postId: string) => {
  const { error } = await supabase.rpc('increment_community_post_share', { p_post_id: postId });
  if (error) throw error;
};

export const toggleCommunityFollow = async ({
  followerId,
  followeeId,
  following,
}: {
  followerId: string;
  followeeId: string;
  following: boolean;
}) => {
  if (followerId === followeeId) return;
  if (following) {
    const { error } = await supabase
      .from('community_follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('followee_id', followeeId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from('community_follows')
    .insert({ follower_id: followerId, followee_id: followeeId });
  if (error) throw error;
};

const getThreadPair = (a: string, b: string) => {
  if (a < b) return { userA: a, userB: b };
  return { userA: b, userB: a };
};

export const upsertCommunityDmThread = async ({
  senderId,
  receiverId,
  firstMessage,
  mediaUrl,
  mediaType,
}: {
  senderId: string;
  receiverId: string;
  firstMessage: string;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'gif' | null;
}) => {
  if (senderId === receiverId) throw new Error('You cannot message yourself.');

  const { userA, userB } = getThreadPair(senderId, receiverId);

  const [{ data: existingRows, error: threadFetchError }, followResult, receiverProfileResult] = await Promise.all([
    supabase
      .from('community_dm_threads')
      .select('id,user_a,user_b,initiator_id,receiver_id,request_status,status_reason,last_message_at,created_at,updated_at')
      .or(`and(user_a.eq.${userA},user_b.eq.${userB}),and(user_a.eq.${userB},user_b.eq.${userA})`)
      .limit(1),
    supabase
      .from('community_follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('follower_id', receiverId)
      .eq('followee_id', senderId),
    supabase
      .from('profiles')
      .select('id,role')
      .eq('id', receiverId)
      .single(),
  ]);

  if (threadFetchError) throw threadFetchError;
  if (receiverProfileResult.error) throw receiverProfileResult.error;

  const receiverRole = (receiverProfileResult.data as any)?.role;
  let allowCommunityDmRequests = true;
  if (receiverRole === 'therapist' || receiverRole === 'admin') {
    const therapistResult = await supabase
      .from('therapists')
      .select('allow_community_dm_requests')
      .eq('id', receiverId)
      .maybeSingle();
    if (therapistResult.error) throw therapistResult.error;
    if (therapistResult.data && therapistResult.data.allow_community_dm_requests === false) {
      allowCommunityDmRequests = false;
    }
  }

  const receiverFollowsSender = (followResult.count || 0) > 0;
  const targetStatus: 'pending' | 'accepted' =
    receiverFollowsSender ? 'accepted' : 'pending';

  if (targetStatus === 'pending' && !allowCommunityDmRequests) {
    throw new Error('This therapist is not accepting new community DM requests.');
  }

  const existing = existingRows?.[0] as CommunityDmThread | undefined;
  let threadId = existing?.id || null;

  if (!existing) {
    const { data: created, error: createError } = await supabase
      .from('community_dm_threads')
      .insert({
        user_a: userA,
        user_b: userB,
        initiator_id: senderId,
        receiver_id: receiverId,
        request_status: targetStatus,
      })
      .select('id')
      .single();
    if (createError) throw createError;
    threadId = created.id;
  } else {
    const nextStatus = existing.request_status === 'accepted'
      ? 'accepted'
      : targetStatus;

    const { error: updateError } = await supabase
      .from('community_dm_threads')
      .update({
        initiator_id: senderId,
        receiver_id: receiverId,
        request_status: nextStatus,
        status_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (updateError) throw updateError;
    threadId = existing.id;
  }

  if (!threadId) throw new Error('Unable to start DM conversation.');

  await sendCommunityDmMessage({
    threadId,
    senderId,
    body: firstMessage,
    mediaUrl: mediaUrl || null,
    mediaType: mediaType || null,
  });

  const { data: threadRow, error: refetchError } = await supabase
    .from('community_dm_threads')
    .select('id,user_a,user_b,initiator_id,receiver_id,request_status,status_reason,last_message_at,created_at,updated_at')
    .eq('id', threadId)
    .single();
  if (refetchError) throw refetchError;

  return threadRow as CommunityDmThread;
};

export const fetchCommunityDmThreads = async ({
  userId,
  scope,
}: {
  userId: string;
  scope: 'inbox' | 'requests';
}) => {
  let query = supabase
    .from('community_dm_threads')
    .select('id,user_a,user_b,initiator_id,receiver_id,request_status,status_reason,last_message_at,created_at,updated_at')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (scope === 'inbox') {
    query = query.eq('request_status', 'accepted');
  } else {
    query = query.eq('request_status', 'pending').eq('receiver_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data || []) as CommunityDmThread[];

  const otherIds = Array.from(
    new Set(
      rows.map((thread) => (thread.user_a === userId ? thread.user_b : thread.user_a)),
    ),
  );

  let profileById = new Map<string, any>();
  if (otherIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id,display_name,first_name,avatar_url,role')
      .in('id', otherIds);
    if (profileError) throw profileError;
    profileById = new Map((profiles || []).map((item: any) => [item.id, item]));
  }

  const threadIds = rows.map((thread) => thread.id);
  const latestMessageByThread = new Map<string, CommunityDmMessage>();
  if (threadIds.length > 0) {
    const { data: latestMessages, error: latestError } = await supabase
      .from('community_dm_messages')
      .select('id,thread_id,sender_id,body,media_url,media_type,moderation_state,moderation_reason,crisis_flag,created_at,read_at')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false });
    if (latestError) throw latestError;
    for (const message of (latestMessages || []) as CommunityDmMessage[]) {
      if (!latestMessageByThread.has(message.thread_id)) {
        latestMessageByThread.set(message.thread_id, message);
      }
    }
  }

  return rows.map((thread) => {
    const otherId = thread.user_a === userId ? thread.user_b : thread.user_a;
    return {
      ...thread,
      other_profile: profileById.get(otherId) || null,
      last_message: latestMessageByThread.get(thread.id) || null,
    };
  });
};

export const fetchCommunityDmMessages = async ({
  threadId,
  userId,
}: {
  threadId: string;
  userId: string;
}) => {
  const [{ data: thread, error: threadError }, { data: messages, error: messageError }] = await Promise.all([
    supabase
      .from('community_dm_threads')
      .select('id,user_a,user_b,initiator_id,receiver_id,request_status,status_reason,last_message_at,created_at,updated_at')
      .eq('id', threadId)
      .single(),
    supabase
      .from('community_dm_messages')
      .select('id,thread_id,sender_id,body,media_url,media_type,moderation_state,moderation_reason,crisis_flag,created_at,read_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true }),
  ]);
  if (threadError) throw threadError;
  if (messageError) throw messageError;

  const threadRow = thread as CommunityDmThread;
  if (threadRow.user_a !== userId && threadRow.user_b !== userId) {
    throw new Error('Access denied.');
  }

  return {
    thread: threadRow,
    messages: (messages || []) as CommunityDmMessage[],
  };
};

export const sendCommunityDmMessage = async ({
  threadId,
  senderId,
  body,
  mediaUrl = null,
  mediaType = null,
}: {
  threadId: string;
  senderId: string;
  body: string;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'gif' | null;
}) => {
  const moderation = evaluateModeration(body);
  const { data, error } = await supabase
    .from('community_dm_messages')
    .insert({
      thread_id: threadId,
      sender_id: senderId,
      body,
      media_url: mediaUrl,
      media_type: mediaType,
      moderation_state: moderation.state,
      moderation_reason: moderation.reason,
      crisis_flag: moderation.crisisFlag,
    })
    .select('id,thread_id,sender_id,body,media_url,media_type,moderation_state,moderation_reason,crisis_flag,created_at,read_at')
    .single();
  if (error) throw error;
  return data as CommunityDmMessage;
};

export const respondToCommunityDmRequest = async ({
  threadId,
  receiverId,
  status,
}: {
  threadId: string;
  receiverId: string;
  status: 'accepted' | 'declined';
}) => {
  const { error } = await supabase
    .from('community_dm_threads')
    .update({
      request_status: status,
      status_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', threadId)
    .eq('receiver_id', receiverId)
    .eq('request_status', 'pending');
  if (error) throw error;
};

export const markCommunityDmThreadRead = async ({
  threadId,
  readerId,
}: {
  threadId: string;
  readerId: string;
}) => {
  const { error } = await supabase
    .from('community_dm_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .neq('sender_id', readerId)
    .is('read_at', null);
  if (error) throw error;
};
