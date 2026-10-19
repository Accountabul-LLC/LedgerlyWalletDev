import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '../supabase';
import { BrandMark, Button, Callout, Field, Note, Screen, Title } from '../ui';
import { colors } from '../theme';

export default function SignInScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace('/profile');
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  async function submit() {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signUp') {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw new Error(signUpError.message);
        setNotice('Check your email to confirm this profile, then sign in.');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw new Error(signInError.message);
        router.replace('/profile');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign in.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen>
      <BrandMark />
      <Title>{mode === 'signIn' ? 'Sign in to your profile' : 'Create a Ledgerly profile'}</Title>
      <Note>
        A profile stores wallet names and saved payees so you can see balances on any phone. It
        never holds keys. Sending still needs a wallet set up on this device.
      </Note>

      <Field
        label="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
      />
      <Field
        label="Password"
        secret
        autoComplete="password"
        textContentType="password"
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Callout tone="danger">{error}</Callout> : null}
      {notice ? <Callout tone="positive">{notice}</Callout> : null}

      <Button
        label={mode === 'signIn' ? 'Sign in' : 'Create profile'}
        loading={pending}
        disabled={email.trim().length === 0 || password.length === 0}
        onPress={() => void submit()}
      />
      <Pressable onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
        <Text style={{ color: colors.purple, textAlign: 'center', fontWeight: '600' }}>
          {mode === 'signIn' ? 'Need a profile? Create one' : 'Already have a profile? Sign in'}
        </Text>
      </Pressable>
      <Link href="/" style={{ textAlign: 'center', color: colors.muted, marginTop: 8 }}>
        Back to this device
      </Link>
    </Screen>
  );
}
