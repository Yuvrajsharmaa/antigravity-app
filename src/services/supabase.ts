import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hvzmxceeitrabskaikmm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2em14Y2VlaXRyYWJza2Fpa21tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMzU1MjgsImV4cCI6MjA4ODcxMTUyOH0.obq0tvLI1jZI8BxcHfT-t2y6xy2WrF8mb_-v3Isrnso';

// Supabase can throw "Invalid Refresh Token: Refresh Token Not Found" if local storage
// contains a partially-corrupted session (access token present, refresh token missing).
// This wrapper self-heals by wiping the stored blob and treating the user as signed out.
const SafeAuthStorage = {
  getItem: async (key: string) => {
    const value = await AsyncStorage.getItem(key);
    if (!value) return value;

    if (key.includes('auth-token')) {
      try {
        const parsed = JSON.parse(value);
        const accessToken =
          parsed?.access_token ??
          parsed?.currentSession?.access_token ??
          parsed?.session?.access_token;
        const refreshToken =
          parsed?.refresh_token ??
          parsed?.currentSession?.refresh_token ??
          parsed?.session?.refresh_token;

        if (accessToken && !refreshToken) {
          await AsyncStorage.removeItem(key);
          return null;
        }
      } catch {
        // If it's not JSON, leave it alone.
      }
    }

    return value;
  },
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: SafeAuthStorage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
