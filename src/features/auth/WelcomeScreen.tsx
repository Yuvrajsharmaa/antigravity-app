import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Button, CoveMascot, CoveModal, PillChip } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { CoveModalAction, CoveModalVariant, SignupRoleIntent } from '../../core/models/types';
import { MascotSizes } from '../../core/constants/mascot';

export const WelcomeScreen: React.FC = () => {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [signupRoleIntent, setSignupRoleIntent] = useState<SignupRoleIntent>('client');
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

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      showModal('blocking', 'Missing info', 'Please enter both email and password.');
      return;
    }

    if (isSignUp && password !== confirmPassword) {
      showModal('blocking', 'Passwords don\'t match', 'Please make sure both passwords are the same.');
      return;
    }

    if (password.length < 6) {
      showModal('blocking', 'Password too short', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    const result = isSignUp
      ? await signUp(email.trim(), password, signupRoleIntent)
      : await signIn(email.trim(), password);

    setLoading(false);

    if (result.error) {
      showModal('error', isSignUp ? 'Sign up failed' : 'Sign in failed', result.error);
    } else if (isSignUp) {
      showModal(
        'success',
        'Check your email',
        'We sent you a confirmation link. Please verify your email to continue.',
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand header */}
          <View style={styles.brandSection}>
            <LinearGradient
              colors={[Colors.semanticSoft.calm, Colors.semanticSoft.insight, Colors.semanticSoft.reflect]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.brandHaloTop} />
            <View style={styles.brandHaloBottom} />
            <CoveMascot variant="default" size={MascotSizes.panel} animate style={styles.logoMascot} />
            <Text style={styles.brandName}>Care Space</Text>
            <Text style={styles.headline}>
              Talk to a psychologist{'\n'}without the awkward admin.
            </Text>
            <Text style={styles.subheadline}>
              Qualified professionals. Your schedule.{'\n'}Everything stays in one place.
            </Text>
          </View>

          {/* Auth form */}
          <View style={styles.formSection}>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color={Colors.text.tertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor={Colors.text.tertiary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                accessibilityLabel="Email address"
                accessibilityHint="Enter your email to sign in or create your account"
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.text.tertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={Colors.text.tertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                accessibilityLabel="Password"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.text.tertiary}
                />
              </TouchableOpacity>
            </View>

            {isSignUp && (
              <>
                <View style={styles.inputContainer}>
                  <Ionicons name="lock-closed-outline" size={20} color={Colors.text.tertiary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm password"
                    placeholderTextColor={Colors.text.tertiary}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    accessibilityLabel="Confirm password"
                  />
                </View>

                <View style={styles.signupRoleBox}>
                  <Text style={styles.signupRoleLabel}>Signing up as</Text>
                  <View style={styles.signupRoleRow}>
                    <PillChip
                      label="Client"
                      selected={signupRoleIntent === 'client'}
                      onPress={() => setSignupRoleIntent('client')}
                    />
                    <PillChip
                      label="Therapist"
                      selected={signupRoleIntent === 'therapist'}
                      onPress={() => setSignupRoleIntent('therapist')}
                    />
                  </View>
                </View>
              </>
            )}

            {isSignUp && signupRoleIntent === 'therapist' ? (
              <View style={styles.pendingHint}>
                <Ionicons name="time-outline" size={14} color={Colors.status.warning} />
                <Text style={styles.pendingHintText}>
                  Therapist accounts are reviewed before approval.
                </Text>
              </View>
            ) : null}

            <Button
              title={isSignUp ? 'Create account' : 'Sign in'}
              onPress={handleAuth}
              loading={loading}
              size="lg"
            />

            <TouchableOpacity
              style={styles.switchBtn}
              onPress={() => {
                setIsSignUp(!isSignUp);
                setConfirmPassword('');
              }}
              accessibilityRole="button"
              accessibilityLabel={isSignUp ? 'Switch to sign in' : 'Switch to create account'}
            >
              <Text style={styles.switchText}>
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                <Text style={styles.switchHighlight}>
                  {isSignUp ? 'Sign in' : 'Create one'}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.disclaimer}>
              This app is not a substitute for emergency services.{'\n'}
              If you are in crisis, please contact your local emergency number.
            </Text>
          </View>
        </ScrollView>

        <CoveModal
          visible={modalState.visible}
          variant={modalState.variant}
          title={modalState.title}
          message={modalState.message}
          primaryAction={modalState.primaryAction || undefined}
          secondaryAction={modalState.secondaryAction || undefined}
          onDismiss={() => setModalState((prev) => ({ ...prev, visible: false }))}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
    backgroundColor: Colors.ui.glass,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: Colors.stroke.soft,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xxl,
    overflow: 'hidden',
  },
  brandHaloTop: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
    right: -46,
    top: -66,
  },
  brandHaloBottom: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    left: -32,
    bottom: -38,
  },
  logoMascot: {
    marginBottom: Spacing.lg,
  },
  signupRoleBox: {
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  signupRoleLabel: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
  },
  signupRoleRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  pendingHint: {
    marginTop: Spacing.xs,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.status.warning + '35',
    backgroundColor: Colors.status.warningSoft,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'center',
  },
  pendingHintText: {
    ...Typography.caption,
    color: Colors.text.secondary,
    flex: 1,
  },
  brandName: {
    ...Typography.title1,
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  headline: {
    ...Typography.title2,
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subheadline: {
    ...Typography.body,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  formSection: {
    gap: Spacing.sm,
    backgroundColor: Colors.ui.glass,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    padding: Spacing.lg,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.medium,
    paddingHorizontal: Spacing.md,
    height: 52,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    ...Typography.body,
    color: Colors.text.primary,
    height: '100%',
  },
  switchBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  switchText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  switchHighlight: {
    color: Colors.accent.primary,
    fontWeight: '600',
  },
  footer: {
    marginTop: Spacing.xxl,
    paddingBottom: Spacing.lg,
  },
  disclaimer: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
