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
  const palette = [Colors.bg.coralWash, Colors.bg.skyWash, Colors.bg.mintWash, Colors.semanticSoft.effort];
  const textPalette = [Colors.accent.dark, Colors.semantic.insight, Colors.semantic.calm, Colors.semantic.effort];
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?';
  const hashIndex = initials.charCodeAt(0) % palette.length;
  const placeholderBg = palette[hashIndex];
  const placeholderText = textPalette[hashIndex];

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: placeholderBg,
            },
          ]}
        >
          {initials !== '?' ? (
            <Text style={[styles.initials, { fontSize: size * 0.36, color: placeholderText }]}>{initials}</Text>
          ) : (
            <Ionicons name="person-outline" size={size * 0.42} color={placeholderText} />
          )}
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
