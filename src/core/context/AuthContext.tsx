import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../../services/supabase';
import { Profile, SignupRoleIntent, TherapistApplication } from '../models/types';
import { scheduleAdaptiveWellbeingReminders } from '../utils/wellbeingNotifications';
import {
  fetchTherapistApplicationByUser,
  upsertTherapistApplication,
} from '../services/careFlowService';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  signUp: (
    email: string,
    password: string,
    roleIntent?: SignupRoleIntent,
  ) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isTherapistMode: boolean;
  canUseTherapistMode: boolean;
  toggleTherapistMode: () => void;
  isDevAdmin: boolean;
  therapistApplication: TherapistApplication | null;
  isTherapistApplicant: boolean;
  signupRoleIntent: SignupRoleIntent;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const DEV_ADMIN_EMAILS = ['yuvrajsharma6367@gmail.com'];

const isDevAdminEmail = (email?: string | null) => {
  if (!email) return false;
  return DEV_ADMIN_EMAILS.includes(email.trim().toLowerCase());
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [therapistApplication, setTherapistApplication] = useState<TherapistApplication | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTherapistMode, setIsTherapistMode] = useState(false);
  const activeUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) {
        // Defensive: if storage/session is corrupted, fall back to signed-out cleanly.
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // Best effort.
        }
        setSession(null);
        setProfile(null);
        setTherapistApplication(null);
        setIsTherapistMode(false);
        setIsLoading(false);
        return;
      }

      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setTherapistApplication(null);
        setIsLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setTherapistApplication(null);
        setIsTherapistMode(false);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const currentUser = session?.user || (await supabase.auth.getUser()).data.user;
      const shouldPromoteDevAdmin = isDevAdminEmail(currentUser?.email);
      const roleIntent = (currentUser?.user_metadata?.role_intent as SignupRoleIntent | undefined) || 'client';

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        // Profile doesn't exist yet - create it
        const newProfile: Partial<Profile> = {
          id: userId,
          role: shouldPromoteDevAdmin ? 'admin' : 'user',
          first_name: null,
          display_name: currentUser?.user_metadata?.full_name || null,
          email: currentUser?.email || null,
          avatar_url: currentUser?.user_metadata?.avatar_url || null,
          language: 'English',
          onboarding_completed: false,
        };

        const { data: created, error: createError } = await supabase
          .from('profiles')
          .insert(newProfile)
          .select()
          .single();

        if (!createError && created) {
          setProfile(created as Profile);
          if (!shouldPromoteDevAdmin && roleIntent === 'therapist') {
            await upsertTherapistApplication({ userId });
          }
        }
      } else if (data) {
        const currentProfile = data as Profile;

        if (shouldPromoteDevAdmin && currentProfile.role !== 'admin') {
          const { data: upgradedProfile, error: upgradeError } = await supabase
            .from('profiles')
            .update({ role: 'admin', updated_at: new Date().toISOString() })
            .eq('id', userId)
            .select()
            .single();

          if (!upgradeError && upgradedProfile) {
            setProfile(upgradedProfile as Profile);
          } else {
            setProfile(currentProfile);
          }
        } else {
          setProfile(currentProfile);
        }
      }

      try {
        let application = await fetchTherapistApplicationByUser(userId);
        if (!application && roleIntent === 'therapist' && !shouldPromoteDevAdmin) {
          await upsertTherapistApplication({ userId });
          application = await fetchTherapistApplicationByUser(userId);
        }
        setTherapistApplication(application);
      } catch {
        setTherapistApplication(null);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    roleIntent: SignupRoleIntent = 'client',
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role_intent: roleIntent,
        },
      },
    });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    setIsTherapistMode(false);
  };

  const refreshProfile = async () => {
    if (session?.user?.id) {
      await fetchProfile(session.user.id);
    }
  };

  const toggleTherapistMode = () => {
    if (!canUseTherapistMode) {
      setIsTherapistMode(false);
      return;
    }
    setIsTherapistMode(!isTherapistMode);
  };

  const canUseTherapistMode = profile?.role === 'therapist' || profile?.role === 'admin';
  const signupRoleIntent = ((session?.user?.user_metadata?.role_intent as SignupRoleIntent | undefined) || 'client');
  const isTherapistApplicant = Boolean(
    therapistApplication
    && therapistApplication.status !== 'approved'
    && profile?.role !== 'therapist'
    && profile?.role !== 'admin',
  );
  const isDevAdmin =
    profile?.role === 'admin' && isDevAdminEmail(profile?.email || session?.user?.email);

  useEffect(() => {
    if (!canUseTherapistMode && isTherapistMode) {
      setIsTherapistMode(false);
    }
  }, [canUseTherapistMode, isTherapistMode]);

  useEffect(() => {
    const currentUserId = session?.user?.id || null;
    if (activeUserIdRef.current !== currentUserId) {
      // Always start in client preview/home mode after account switch or fresh sign-in.
      setIsTherapistMode(false);
      activeUserIdRef.current = currentUserId;
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id || !profile) return;
    if (profile.role === 'therapist') return;

    scheduleAdaptiveWellbeingReminders(session.user.id).catch(() => {
      // Notification scheduling is best-effort.
    });
  }, [profile, session?.user?.id]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        isLoading,
        signUp,
        signIn,
        signOut,
        refreshProfile,
        isTherapistMode,
        canUseTherapistMode,
        toggleTherapistMode,
        isDevAdmin,
        therapistApplication,
        isTherapistApplicant,
        signupRoleIntent,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
