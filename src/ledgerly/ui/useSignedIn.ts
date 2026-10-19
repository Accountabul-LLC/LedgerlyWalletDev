import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isVerifiedSession } from '@/lib/email-confirmed';

/**
 * Whether a profile session exists in this browser. Null while unknown, so
 * callers can avoid flashing signed out UI during the first check.
 */
export function useSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(isVerifiedSession(data.session));
    });
    // The first callback can arrive before hydration finishes, so it takes the
    // same mounted guard as the initial session read.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(isVerifiedSession(session));
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return signedIn;
}
