import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../../services/supabase';

const AVATAR_BUCKET = 'avatars';

export const pickAvatarImage = async (): Promise<string | null> => {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo permission is required to upload an avatar.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
  });

  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0].uri;
};

const ensureJpegSquare = async (uri: string) => {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 512, height: 512 } }],
    {
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );
  return manipulated.uri;
};

export const uploadAvatarForUser = async (userId: string, uri: string) => {
  const imageUri = await ensureJpegSquare(uri);
  const response = await fetch(imageUri);
  const arrayBuffer = await response.arrayBuffer();

  const path = `${userId}/${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, arrayBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const publicUrl = data.publicUrl;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      avatar_url: publicUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (updateError) throw updateError;
  return publicUrl;
};
