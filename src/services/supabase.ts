import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hvzmxceeitrabskaikmm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2em14Y2VlaXRyYWJza2Fpa21tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMzU1MjgsImV4cCI6MjA4ODcxMTUyOH0.obq0tvLI1jZI8BxcHfT-t2y6xy2WrF8mb_-v3Isrnso';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
