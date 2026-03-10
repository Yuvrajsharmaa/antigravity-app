import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { Spacing } from '../theme/spacing';

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
  showOnline?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({
  uri,
  name,
  size = 48,
  showOnline = false,
}) => {
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?';

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        />
      ) : (
        <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }]}>
          <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials}</Text>
        </View>
      )}
      {showOnline && (
        <View style={[styles.onlineDot, { right: 0, bottom: 0 }]} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  image: {
    resizeMode: 'cover',
  },
  placeholder: {
    backgroundColor: Colors.accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: Colors.accent.primary,
    fontWeight: '600',
  },
  onlineDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.status.success,
    borderWidth: 2,
    borderColor: Colors.bg.secondary,
  },
});
