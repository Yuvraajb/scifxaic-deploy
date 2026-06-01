import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

interface AuthState {
  profile: Profile | null;
  loading: boolean;
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  loading: true,

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      set({ profile: data as Profile | null, loading: false });
    } else {
      set({ profile: null, loading: false });
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        set({ profile: data as Profile | null });
      } else {
        set({ profile: null });
      }
    });
  },

  signIn: async (email, password) => {
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) throw new Error(authError.message);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Authentication failed');

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile) {
      await supabase.auth.signOut();
      throw new Error('Access denied. Contact your administrator.');
    }

    set({ profile: profile as Profile });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ profile: null });
  },
}));
