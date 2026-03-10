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
import { ClientDetailScreen } from '../features/therapist-dashboard/ClientDetailScreen';
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
  <HomeStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <HomeStack.Screen name="HomeMain" component={HomeScreen} />
    <HomeStack.Screen name="TherapistProfile" component={TherapistProfileScreen} />
    <HomeStack.Screen name="SlotSelection" component={SlotSelectionScreen} />
    <HomeStack.Screen name="BookingConfirmation" component={BookingConfirmationScreen} />
    <HomeStack.Screen name="ClientDetail" component={ClientDetailScreen} />
  </HomeStack.Navigator>
);

// Messages stack
const MessagesStackScreen = () => (
  <MessagesStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <MessagesStack.Screen name="MessagesList" component={MessagesListScreen} />
    <MessagesStack.Screen name="Chat" component={ChatScreen} />
  </MessagesStack.Navigator>
);

// Main tab navigator
const MainTabs = () => {
  const insets = require('react-native-safe-area-context').useSafeAreaInsets();
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color }) => {
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
          return <Ionicons name={iconName} size={24} color={color} />;
        },
        tabBarActiveTintColor: Colors.accent.primary,
        tabBarInactiveTintColor: Colors.text.tertiary,
        tabBarLabelStyle: {
          ...Typography.caption,
          fontSize: 11,
          fontWeight: '500',
        },
        tabBarStyle: {
          backgroundColor: Colors.bg.primary,
          borderTopColor: Colors.stroke.subtle,
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          height: 60 + Math.max(insets.bottom, 8),
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeStackScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="SessionsTab" component={SessionsScreen} options={{ tabBarLabel: 'Sessions' }} />
      <Tab.Screen name="MessagesTab" component={MessagesStackScreen} options={{ tabBarLabel: 'Messages' }} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
};

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
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {!session ? (
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
        ) : !profile?.onboarding_completed ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : (
          <Stack.Group>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="VideoCall" component={VideoCallScreen} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
