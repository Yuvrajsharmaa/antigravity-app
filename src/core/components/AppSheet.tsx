import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow, Spacing, Typography } from '../theme';

type SheetSide = 'bottom' | 'right';

interface AppSheetProps {
  visible: boolean;
  onClose: () => void;
  side?: SheetSide;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  showHandle?: boolean;
  closeOnBackdropPress?: boolean;
  swipeToClose?: boolean;
}

export const AppSheet: React.FC<AppSheetProps> = ({
  visible,
  onClose,
  side = 'bottom',
  title,
  subtitle,
  children,
  footer,
  showHandle = true,
  closeOnBackdropPress = true,
  swipeToClose = true,
}) => {
  const insets = useSafeAreaInsets();
  const screen = Dimensions.get('window');
  const [renderVisible, setRenderVisible] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    drag.setValue(0);
    if (visible) {
      setRenderVisible(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: 190,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setRenderVisible(false);
    });
  }, [drag, progress, visible]);

  const overlayOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const baseTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [side === 'right' ? Math.min(420, screen.width) : Math.min(520, screen.height), 0],
  });

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => {
      if (!swipeToClose) return false;
      if (side === 'right') {
        return gesture.dx > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy);
      }
      return gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
    },
    onMoveShouldSetPanResponderCapture: (_, gesture) => {
      if (!swipeToClose) return false;
      if (side === 'right') {
        return gesture.dx > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy);
      }
      return gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, gesture) => {
      const delta = side === 'right' ? gesture.dx : gesture.dy;
      drag.setValue(Math.max(0, delta));
    },
    onPanResponderRelease: (_, gesture) => {
      const distance = Math.max(0, side === 'right' ? gesture.dx : gesture.dy);
      const velocity = side === 'right' ? gesture.vx : gesture.vy;
      if (distance > 92 || velocity > 1.05) {
        onClose();
        return;
      }
      Animated.spring(drag, {
        toValue: 0,
        useNativeDriver: true,
        speed: 22,
        bounciness: 5,
      }).start();
    },
  }), [drag, onClose, side, swipeToClose]);

  const translateTransform = side === 'right'
    ? { transform: [{ translateX: Animated.add(baseTranslate, drag) }] }
    : { transform: [{ translateY: Animated.add(baseTranslate, drag) }] };

  if (!renderVisible) return null;

  return (
    <Modal
      visible={renderVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeOnBackdropPress ? onClose : undefined}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheetBase,
            side === 'right'
              ? [styles.rightSheet, { top: insets.top + Spacing.xs, bottom: insets.bottom + Spacing.xs }]
              : [styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, Spacing.md) }],
            translateTransform,
          ]}
          {...(swipeToClose ? panResponder.panHandlers : {})}
        >
          {showHandle && side === 'bottom' ? (
            <View style={styles.handleTouch}>
              <View style={styles.handle} />
            </View>
          ) : null}
          {(title || subtitle) ? (
            <View style={styles.headerRow}>
              <View style={styles.header}>
                {title ? <Text style={styles.title}>{title}</Text> : null}
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
              <Pressable
                onPress={onClose}
                style={styles.closeBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close sheet"
              >
                <Text style={styles.closeBtnText}>×</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.content}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.ui.overlay,
  },
  sheetBase: {
    backgroundColor: Colors.bg.primary,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    ...Shadow.card,
  },
  bottomSheet: {
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    maxHeight: '86%',
  },
  rightSheet: {
    position: 'absolute',
    right: 0,
    width: '84%',
    maxWidth: 392,
    borderTopLeftRadius: Radius.xxl,
    borderBottomLeftRadius: Radius.xxl,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: Radius.pill,
    backgroundColor: Colors.stroke.medium,
  },
  handleTouch: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  header: {
    flex: 1,
    gap: 2,
    marginBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  title: {
    ...Typography.title3,
    color: Colors.text.primary,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  content: {
    gap: Spacing.sm,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.stroke.soft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.secondary,
  },
  closeBtnText: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginTop: -1,
    fontWeight: '600',
  },
  footer: {
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
});
