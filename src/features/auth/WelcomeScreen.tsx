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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Button } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';

export const WelcomeScreen: React.FC = () => {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing info', 'Please enter both email and password.');
      return;
    }

    if (isSignUp && password !== confirmPassword) {
      Alert.alert('Passwords don\'t match', 'Please make sure both passwords are the same.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Password too short', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    const result = isSignUp
      ? await signUp(email.trim(), password)
      : await signIn(email.trim(), password);

    setLoading(false);

    if (result.error) {
      Alert.alert(isSignUp ? 'Sign up failed' : 'Sign in failed', result.error);
    } else if (isSignUp) {
      Alert.alert(
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
            <View style={styles.brandHaloTop} />
            <View style={styles.brandHaloBottom} />
            <View style={styles.logoContainer}>
              <Ionicons name="leaf-outline" size={42} color={Colors.accent.primary} />
            </View>
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
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.text.tertiary}
                />
              </TouchableOpacity>
            </View>

            {isSignUp && (
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
                />
              </View>
            )}

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
    backgroundColor: Colors.accent.soft,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xxl,
    overflow: 'hidden',
  },
  brandHaloTop: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.28)',
    right: -46,
    top: -66,
  },
  brandHaloBottom: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.28)',
    left: -32,
    bottom: -38,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
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
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    padding: Spacing.lg,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
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
