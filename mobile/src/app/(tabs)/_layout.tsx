import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '../../theme';
import { Icon } from '../../icons';
import { UnlockedOnly } from '../../guard';
import { useLayoutInsets } from '../../ui';

function Label({ name, focused }: { name: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: '700', color: focused ? colors.ink : colors.faint }}>
      {name}
    </Text>
  );
}

export default function TabsLayout() {
  const insets = useLayoutInsets();
  const bottom = Math.max(insets.bottom, 8);
  return (
    <UnlockedOnly>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.line,
            height: 52 + bottom,
            paddingTop: 4,
            paddingBottom: bottom,
          },
          tabBarActiveTintColor: colors.ink,
          tabBarInactiveTintColor: colors.faint,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => <Icon name="home" color={color} size={size} />,
            tabBarLabel: ({ focused }) => <Label name="Home" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="tokens"
          options={{
            title: 'Tokens',
            tabBarIcon: ({ color, size }) => <Icon name="coins" color={color} size={size} />,
            tabBarLabel: ({ focused }) => <Label name="Tokens" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="activity"
          options={{
            title: 'Activity',
            tabBarIcon: ({ color, size }) => <Icon name="activity" color={color} size={size} />,
            tabBarLabel: ({ focused }) => <Label name="Activity" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="contacts"
          options={{
            title: 'Contacts',
            tabBarIcon: ({ color, size }) => <Icon name="contacts" color={color} size={size} />,
            tabBarLabel: ({ focused }) => <Label name="Payees" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => <Icon name="settings" color={color} size={size} />,
            tabBarLabel: ({ focused }) => <Label name="Settings" focused={focused} />,
          }}
        />
      </Tabs>
    </UnlockedOnly>
  );
}
