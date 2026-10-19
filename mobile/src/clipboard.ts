import * as Clipboard from 'expo-clipboard';

/**
 * The only place the phone app writes to the clipboard. Callers must be a
 * tap handler — never an effect or a render path — so a phrase cannot land on
 * the clipboard unless the person asked.
 */
export async function copyText(value: string): Promise<void> {
  await Clipboard.setStringAsync(value);
}
