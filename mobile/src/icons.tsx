import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { View, type ColorValue } from 'react-native';
import { colors } from './theme';

export type IconName =
  | 'home'
  | 'coins'
  | 'activity'
  | 'contacts'
  | 'settings'
  | 'send'
  | 'receive'
  | 'wallet'
  | 'shield'
  | 'bell'
  | 'user'
  | 'network'
  | 'scan'
  | 'swap'
  | 'arrow-right'
  | 'arrow-left';

// Native versions of Ledgerly's existing local vector icon geometry.
const paths: Record<IconName, string[]> = {
  home: ['m3 10 9-7 9 7', 'M5 9v12h14V9', 'M9 21v-7h6v7'],
  coins: [
    'M3 7c0-2 3-3 6-3s6 1 6 3-3 3-6 3-6-1-6-3Z',
    'M3 7v4c0 2 3 3 6 3s6-1 6-3V7',
    'M9 16c0-2 3-3 6-3s6 1 6 3-3 3-6 3-6-1-6-3Z',
    'M9 16v3c0 2 3 3 6 3s6-1 6-3v-3',
  ],
  activity: ['M7 7v10', 'm4 14 3 3 3-3', 'M17 17V7', 'm14 10 3-3 3 3'],
  contacts: ['M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2'],
  settings: ['M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z'],
  send: ['M12 19V5', 'm5 12 7-7 7 7'],
  receive: ['M12 5v14', 'm5 12 7 7 7-7'],
  wallet: [
    'M3 8a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2',
    'M3 8v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5',
  ],
  shield: ['m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6Z', 'm8 12 3 3 5-6'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M10 21h4'],
  user: ['M4 21v-2a8 8 0 0 1 16 0v2'],
  network: ['M12 8v5', 'M5 17v-4h14v4'],
  scan: ['M8 3H3v5', 'M16 3h5v5', 'M21 16v5h-5', 'M8 21H3v-5', 'M7 12h10'],
  swap: ['M4 7h16', 'm16 3 4 4-4 4', 'M20 17H4', 'm8 13-4 4 4 4'],
  'arrow-right': ['M4 12h16', 'm14 6 6 6-6 6'],
  'arrow-left': ['M20 12H4', 'm10 6-6 6 6 6'],
};

export function Icon({
  name,
  size = 22,
  color = colors.ink,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
}) {
  // Stroke is set on each shape. react-native-svg does not inherit it from <Svg>
  // on Android, which otherwise leaves the tab bar drawing empty glyph boxes.
  const line = {
    fill: 'none' as const,
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {paths[name].map((d, index) => (
        <Path key={index} d={d} {...line} />
      ))}
      {name === 'contacts' || name === 'user' ? <Circle cx={12} cy={7} r={4} {...line} /> : null}
      {name === 'settings' ? <Circle cx={12} cy={12} r={3} {...line} /> : null}
      {name === 'wallet' ? <Circle cx={16.5} cy={13.5} r={1.2} fill={color} stroke="none" /> : null}
      {name === 'network' ? (
        <>
          <Rect x={9} y={2} width={6} height={6} rx={1} {...line} />
          <Rect x={2} y={17} width={6} height={5} rx={1} {...line} />
          <Rect x={16} y={17} width={6} height={5} rx={1} {...line} />
        </>
      ) : null}
    </Svg>
  );
}

export function IconBadge({ name, size = 42 }: { name: IconName; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.sunken,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={name} />
    </View>
  );
}

/** Unchanged official artwork; black mark with its required clear space. */
export function XrpSymbol({ size = 44 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size * 0.67} height={size * 0.57} viewBox="0 0 211 180" accessible={false}>
        <Path
          d="M135.007 43.7415C127.265 51.6966 117.426 56.0898 105.496 56.0898C93.5668 56.0898 83.7273 51.6966 75.9853 43.7415L34.1255 0H0.00763497L57.7784 57.7678C70.5469 70.5356 87.2893 78.6966 105.504 78.6966C123.718 78.6966 140.461 70.5356 153.229 57.7678L211 0H176.882L135.022 43.7415H135.007ZM176.874 180H210.992L153.222 122.232C140.453 109.464 123.711 101.303 105.496 101.303C87.2817 101.303 70.5393 109.464 57.7708 122.232L0 180H34.1179L75.9777 136.258C83.7196 128.303 93.5591 123.91 105.489 123.91C117.418 123.91 127.258 128.303 134.999 136.258L176.859 180H176.874Z"
          fill="#141414"
        />
      </Svg>
    </View>
  );
}
