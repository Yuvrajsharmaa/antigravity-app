import React, { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, CoveModal, LoadingState, PillChip } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import {
  createCommunityPost,
  fetchCommunityTopics,
  pickCommunityImage,
  uploadCommunityImage,
} from '../../core/services/communityService';
import { Colors, Radius, Spacing, Typography } from '../../core/theme';
import { CoveModalAction, CoveModalVariant } from '../../core/models/types';

type ComposerMedia = {
  id: string;
  uri: string;
  width?: number;
  height?: number;
};

export const CommunityCreatePostScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, profile } = useAuth();
  const [topics, setTopics] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<ComposerMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
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

  useEffect(() => {
    const loadTopics = async () => {
      try {
        const rows = await fetchCommunityTopics();
        const mapped = rows.map((item) => ({ id: item.id, title: item.title }));
        setTopics(mapped);
        setSelectedTopicId(mapped[0]?.id || null);
      } finally {
        setLoading(false);
      }
    };
    loadTopics();
  }, []);

  const showModal = (
    variant: CoveModalVariant,
    title: string,
    message: string,
    primaryAction?: CoveModalAction | null,
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
      secondaryAction: null,
    });
  };

  const addImage = async () => {
    if (mediaUploading) return;
    try {
      const asset = await pickCommunityImage();
      if (!asset?.uri) return;
      setMedia((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
        },
      ]);
    } catch (err: any) {
      showModal('error', 'Unable to add image', err?.message || 'Please try again.');
    }
  };

  const removeMedia = (id: string) => {
    setMedia((prev) => prev.filter((item) => item.id !== id));
  };

  const publish = async () => {
    if (!user?.id || !selectedTopicId || !body.trim().length || posting) return;
    setPosting(true);
    setMediaUploading(true);
    try {
      const uploadedMedia = [];
      for (const item of media) {
        const ext = item.uri.includes('.png') ? 'png' : 'jpg';
        const remoteUrl = await uploadCommunityImage({
          userId: user.id,
          uri: item.uri,
          fileExt: ext,
        });
        uploadedMedia.push({
          mediaType: 'image' as const,
          mediaUrl: remoteUrl,
          width: item.width || null,
          height: item.height || null,
        });
      }

      const result = await createCommunityPost({
        userId: user.id,
        profile,
        topicId: selectedTopicId,
        body: body.trim(),
        media: uploadedMedia,
      });

      if (result.moderation_state === 'blocked') {
        showModal(
          'blocking',
          'Post blocked',
          'Your post includes contact-sharing details and was blocked before publishing.',
          {
            label: 'Back to community',
            onPress: () => {
              setModalState((prev) => ({ ...prev, visible: false }));
              navigation.goBack();
            },
          },
        );
        return;
      }

      if (result.moderation_state === 'pending_review') {
        showModal(
          'info',
          'Post sent for review',
          'Your post was saved and will appear after safety review.',
          {
            label: 'Back to community',
            onPress: () => {
              setModalState((prev) => ({ ...prev, visible: false }));
              navigation.goBack();
            },
          },
        );
        return;
      }

      navigation.replace('PostDetail', { postId: result.id });
    } catch (err: any) {
      showModal('error', 'Could not publish', err?.message || 'Please try again.');
    } finally {
      setPosting(false);
      setMediaUploading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <LoadingState message="Preparing composer..." style={styles.stateWrap} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="close-outline" size={22} color={Colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New post</Text>
          <Button
            title="Post"
            fullWidth={false}
            size="sm"
            onPress={publish}
            loading={posting}
            disabled={!selectedTopicId || !body.trim().length || posting}
          />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.topicWrap}>
            {topics.map((topic) => (
              <PillChip
                key={topic.id}
                label={topic.title}
                selected={selectedTopicId === topic.id}
                onPress={() => setSelectedTopicId(topic.id)}
              />
            ))}
          </View>

          <TextInput
            style={styles.input}
            multiline
            value={body}
            onChangeText={setBody}
            maxLength={1200}
            placeholder="Share what is on your mind"
            placeholderTextColor={Colors.text.tertiary}
            textAlignVertical="top"
          />
          <Text style={styles.countText}>{body.length}/1200</Text>

          <View style={styles.mediaActionRow}>
            <Button
              title={mediaUploading ? 'Uploading...' : 'Add image'}
              variant="secondary"
              fullWidth={false}
              size="sm"
              onPress={addImage}
              disabled={posting || mediaUploading}
            />
            <Text style={styles.helperText}>Image posts only for now.</Text>
          </View>

          {media.length ? (
            <View style={styles.mediaPreviewGrid}>
              {media.map((item) => (
                <View key={item.id} style={styles.mediaPreviewCard}>
                  <Image source={{ uri: item.uri }} style={styles.mediaPreviewImage} resizeMode="cover" />
                  <TouchableOpacity style={styles.removeMediaBtn} onPress={() => removeMedia(item.id)}>
                    <Ionicons name="close" size={14} color={Colors.text.inverse} />
                  </TouchableOpacity>
                  <Text style={styles.mediaTypeLabel}>Image</Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

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
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
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
    ...Typography.title3,
    color: Colors.text.primary,
    flex: 1,
    textAlign: 'center',
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  topicWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  input: {
    minHeight: 180,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.soft,
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    ...Typography.body,
    color: Colors.text.primary,
    lineHeight: 24,
  },
  countText: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'right',
  },
  mediaActionRow: {
    gap: Spacing.xs,
  },
  helperText: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: -2,
  },
  mediaPreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  mediaPreviewCard: {
    width: '48%',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    overflow: 'hidden',
    backgroundColor: Colors.bg.secondary,
  },
  mediaPreviewImage: {
    width: '100%',
    aspectRatio: 1,
  },
  removeMediaBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaTypeLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 6,
  },
  stateWrap: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
});
