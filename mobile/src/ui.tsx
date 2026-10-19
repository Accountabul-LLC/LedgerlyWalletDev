import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './theme';
import { Icon, type IconName } from './icons';
import ledgerlyIcon from '../assets/ledgerly-icon.png';

const actionIcons: Record<string, IconName> = {
  Send: 'send',
  Receive: 'receive',
  'Lock wallet': 'shield',
  'Scan QR': 'scan',
  'Copy address': 'receive',
  'Sync names to my profile': 'user',
  'Watch-only profile': 'wallet',
  'Explore XRPL markets': 'coins',
  'Update password': 'shield',
  'Sign out of profile': 'user',
  'Use selected wallet for send': 'send',
  'Allow camera': 'scan',
};

/**
 * Top inset includes the Android status bar when the safe-area module reports 0,
 * which happens with edge-to-edge windows. Without it, back links sit under the clock.
 */
export function useLayoutInsets() {
  const insets = useSafeAreaInsets();
  const androidStatus = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  // Edge-to-edge often reports a bottom inset of 0 while the navigation bar
  // still covers the last control. 48dp clears both gesture and 3-button bars.
  const androidNavigation = Platform.OS === 'android' ? 48 : 0;
  return {
    top: Math.max(insets.top, androidStatus),
    bottom: Math.max(insets.bottom, androidNavigation),
    left: insets.left,
    right: insets.right,
  };
}

export function ScreenFrame({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const insets = useLayoutInsets();
  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label.replace(/^←\s*/, '')}
      onPress={onPress}
      hitSlop={12}
      style={styles.backLink}
    >
      <Text style={styles.backLinkLabel}>{label}</Text>
    </Pressable>
  );
}

export function BrandMark() {
  return <Image source={ledgerlyIcon} style={styles.mark} accessibilityLabel="Ledgerly" />;
}

export function Eyebrow({ children }: { children: string }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Title({ children }: { children: string }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Note({ children }: { children: ReactNode }) {
  return <Text style={styles.note}>{children}</Text>;
}

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'caution' | 'danger' | 'positive';
  title?: string;
  children: ReactNode;
}) {
  return (
    <View style={[styles.callout, styles[`callout_${tone}`]]}>
      {title ? <Text style={styles.calloutTitle}>{title}</Text> : null}
      <Text style={styles.calloutBody}>{children}</Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'accent',
  disabled,
  loading,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: 'accent' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: Boolean(loading), disabled: Boolean(disabled || loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        (disabled || loading) && styles.buttonDisabled,
        pressed && !disabled ? styles.buttonPressed : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'accent' ? colors.ink : colors.purple} />
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {(icon ?? actionIcons[label]) ? (
            <Icon name={(icon ?? actionIcons[label])!} size={20} />
          ) : null}
          <Text
            style={[
              styles.buttonLabel,
              variant === 'accent' ? styles.buttonLabelDark : null,
              variant === 'danger' ? styles.buttonLabelDanger : null,
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  error,
  secret,
  ...input
}: {
  label: string;
  hint?: string;
  error?: string | null;
  secret?: boolean;
} & TextInputProps) {
  const sensitive = secret === true || input.secureTextEntry === true;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={input.accessibilityLabel ?? label}
        secureTextEntry={sensitive || input.secureTextEntry}
        autoCorrect={sensitive ? false : input.autoCorrect}
        autoCapitalize={sensitive ? 'none' : input.autoCapitalize}
        spellCheck={sensitive ? false : input.spellCheck}
        autoComplete={sensitive ? 'off' : input.autoComplete}
        textContentType={sensitive ? 'oneTimeCode' : input.textContentType}
        importantForAutofill={sensitive ? 'no' : input.importantForAutofill}
        passwordRules={sensitive ? 'minlength: 32;' : input.passwordRules}
        style={[styles.input, error ? styles.inputError : null, input.style]}
        placeholderTextColor={colors.faint}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      {hint && !error ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Screen({ children }: { children: ReactNode }) {
  const insets = useLayoutInsets();
  return (
    <ScreenFrame>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.screenContent, { paddingBottom: 48 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
      >
        {children}
      </ScrollView>
    </ScreenFrame>
  );
}

export function Row({
  badge,
  leading,
  title,
  subtitle,
  value,
  onPress,
}: {
  badge?: string;
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
}) {
  const inner = (
    <>
      {leading ??
        (badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null)}
      <View style={styles.rowMain}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} style={styles.rowSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text numberOfLines={1} style={[styles.rowValue, { maxWidth: '42%' }]}>
          {value}
        </Text>
      ) : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={styles.row}>
        {inner}
      </Pressable>
    );
  }
  return <View style={styles.row}>{inner}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  screenContent: { padding: 20, paddingBottom: 48, gap: 14 },
  backLink: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingRight: 12,
  },
  backLinkLabel: { color: colors.purple, fontWeight: '600', fontSize: 16 },
  mark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markLetter: { fontFamily: 'Georgia', fontSize: 26, color: colors.ink },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.muted,
    fontWeight: '600',
  },
  title: {
    fontFamily: 'Georgia',
    fontSize: 28,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  note: { fontSize: 15, lineHeight: 22, color: colors.muted },
  callout: { borderRadius: 14, padding: 14, gap: 4 },
  callout_info: { backgroundColor: colors.infoBg },
  callout_caution: { backgroundColor: colors.cautionBg },
  callout_danger: { backgroundColor: colors.dangerBg },
  callout_positive: { backgroundColor: colors.positiveBg },
  calloutTitle: { fontWeight: '700', color: colors.ink, fontSize: 14 },
  calloutBody: { color: colors.inkSoft, fontSize: 14, lineHeight: 20 },
  button: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  button_accent: { backgroundColor: colors.green },
  button_secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  button_ghost: { backgroundColor: 'transparent' },
  button_danger: { backgroundColor: colors.dangerBg },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.85 },
  buttonLabel: { fontWeight: '700', fontSize: 16, color: colors.ink },
  buttonLabelDark: { color: colors.ink },
  buttonLabelDanger: { color: colors.danger },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.muted },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  inputError: { borderColor: colors.danger },
  fieldError: { color: colors.danger, fontSize: 13 },
  fieldHint: { color: colors.faint, fontSize: 13, lineHeight: 18 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.inkSoft },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  rowSubtitle: { fontSize: 13, color: colors.muted, fontVariant: ['tabular-nums'] },
  rowValue: { fontSize: 16, fontWeight: '700', color: colors.ink },
});
