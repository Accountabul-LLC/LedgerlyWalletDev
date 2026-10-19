/** Lets root tests import phone screens without installing the Expo app. */
export const AppState = {
  currentState: 'active',
  addEventListener: () => ({ remove: () => undefined }),
};

export const Linking = {
  openURL: () => undefined,
};

export const Text = 'Text';
export const View = 'View';
export const Pressable = 'Pressable';
