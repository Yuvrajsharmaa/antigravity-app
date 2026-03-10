import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';
import { Colors, Typography, Spacing } from '../core/theme';
import { useAuth } from '../core/context/AuthContext';
import { LoadingState } from '../core/components';

// Screens
import { WelcomeScreen } from '../features/auth/WelcomeScreen';
import { OnboardingScreen } from '../features/onboarding/OnboardingScreen';
import { HomeScreen } from '../features/home/HomeScreen';
import { TherapistProfileScreen } from '../features/therapist/TherapistProfileScreen';
import { SlotSelectionScreen } from '../features/booking/SlotSelectionScreen';
import { BookingConfirmationScreen } from '../features/booking/BookingConfirmationScreen';
import { SessionsScreen } from '../features/sessions/SessionsScreen';
import { MessagesListScreen } from '../features/messages/MessagesListScreen';
import { ChatScreen } from '../features/messages/ChatScreen';
import { VideoCallScreen } from '../features/video/VideoCallScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const MessagesStack = createNativeStackNavigator();

// Home stack (browse + therapist profile + booking flow)
const HomeStackScreen = () => (
  <HomeStack.Navigator screenOptions={{ headerShown: false }}>
    <HomeStack.Screen name="HomeMain" component={HomeScreen} />
    <HomeStack.Screen name="TherapistProfile" component={TherapistProfileScreen} />
    <HomeStack.Screen name="SlotSelection" component={SlotSelectionScreen} />
    <HomeStack.Screen name="BookingConfirmation" component={BookingConfirmationScreen} />
    <HomeStack.Screen name="VideoCall" component={VideoCallScreen} />
  </HomeStack.Navigator>
);

// Messages stack
const MessagesStackScreen = () => (
  <MessagesStack.Navigator screenOptions={{ headerShown: false }}>
    <MessagesStack.Screen name="MessagesList" component={MessagesListScreen} />
    <MessagesStack.Screen name="Chat" component={ChatScreen} />
  </MessagesStack.Navigator>
);

// Main tab navigator
const MainTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarIcon: ({ focused, color, size }) => {
        let iconName: keyof typeof Ionicons.glyphMap = 'home';
        switch (route.name) {
          case 'HomeTab':
            iconName = focused ? 'home' : 'home-outline';
            break;
          case 'SessionsTab':
            iconName = focused ? 'calendar' : 'calendar-outline';
            break;
          case 'MessagesTab':
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
            break;
          case 'ProfileTab':
            iconName = focused ? 'person' : 'person-outline';
            break;
        }
        return <Ionicons name={iconName} size={22} color={color} />;
      },
      tabBarActiveTintColor: Colors.accent.primary,
      tabBarInactiveTintColor: Colors.text.tertiary,
      tabBarLabelStyle: {
        ...Typography.caption,
        fontSize: 11,
        fontWeight: '500',
        marginTop: -2,
      },
      tabBarStyle: {
        backgroundColor: Colors.bg.secondary,
        borderTopColor: Colors.stroke.subtle,
        borderTopWidth: 1,
        paddingTop: 8,
        height: Platform.OS === 'ios' ? 88 : 64,
      },
    })}
  >
    <Tab.Screen name="HomeTab" component={HomeStackScreen} options={{ tabBarLabel: 'Home' }} />
    <Tab.Screen name="SessionsTab" component={SessionsScreen} options={{ tabBarLabel: 'Sessions' }} />
    <Tab.Screen name="MessagesTab" component={MessagesStackScreen} options={{ tabBarLabel: 'Messages' }} />
    <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ tabBarLabel: 'Profile' }} />
  </Tab.Navigator>
);

export const AppNavigator: React.FC = () => {
  const { session, profile, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg.primary, justifyContent: 'center' }}>
        <LoadingState message="Loading..." />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
        ) : !profile?.onboarding_completed ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : (
          <Stack.Screen name="Main" component={MainTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
