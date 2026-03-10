import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { Colors, Typography } from '../core/theme';
import { useAuth } from '../core/context/AuthContext';
import { LoadingState } from '../core/components';
import { getRoleModeContract } from '../core/utils/roleAccess';

// Screens
import { WelcomeScreen } from '../features/auth/WelcomeScreen';
import { OnboardingScreen } from '../features/onboarding/OnboardingScreen';
import { HomeScreen } from '../features/home/HomeScreen';
import { TherapistMatchScreen } from '../features/match/TherapistMatchScreen';
import { TherapistProfileScreen } from '../features/therapist/TherapistProfileScreen';
import { SlotSelectionScreen } from '../features/booking/SlotSelectionScreen';
import { BookingConfirmationScreen } from '../features/booking/BookingConfirmationScreen';
import { ClientDetailScreen } from '../features/therapist-dashboard/ClientDetailScreen';
import { SessionsScreen } from '../features/sessions/SessionsScreen';
import { SessionPrepScreen } from '../features/sessions/SessionPrepScreen';
import { PostSessionReflectionScreen } from '../features/sessions/PostSessionReflectionScreen';
import { MessagesListScreen } from '../features/messages/MessagesListScreen';
import { ChatScreen } from '../features/messages/ChatScreen';
import { VideoCallScreen } from '../features/video/VideoCallScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { JournalScreen } from '../features/journal/JournalScreen';
import { NotificationsScreen } from '../features/profile/NotificationsScreen';
import { EditProfileScreen } from '../features/profile/EditProfileScreen';
import { InfoScreen } from '../features/profile/InfoScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const MessagesStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();
const MatchStack = createNativeStackNavigator();

const HomeStackScreen = () => (
  <HomeStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <HomeStack.Screen name="HomeMain" component={HomeScreen} />
    <HomeStack.Screen name="ClientDetail" component={ClientDetailScreen} />
    <HomeStack.Screen name="Journal" component={JournalScreen} />
    <HomeStack.Screen name="HomeNotifications" component={NotificationsScreen} />
  </HomeStack.Navigator>
);

const MessagesStackScreen = () => (
  <MessagesStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <MessagesStack.Screen name="MessagesList" component={MessagesListScreen} />
    <MessagesStack.Screen name="Chat" component={ChatScreen} />
  </MessagesStack.Navigator>
);

const MatchStackScreen = () => (
  <MatchStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <MatchStack.Screen name="TherapistMatch" component={TherapistMatchScreen} />
    <MatchStack.Screen name="TherapistProfile" component={TherapistProfileScreen} />
    <MatchStack.Screen name="SlotSelection" component={SlotSelectionScreen} />
    <MatchStack.Screen name="BookingConfirmation" component={BookingConfirmationScreen} />
  </MatchStack.Navigator>
);

const ProfileStackScreen = () => (
  <ProfileStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
    <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} />
    <ProfileStack.Screen name="Notifications" component={NotificationsScreen} />
    <ProfileStack.Screen name="ProfileInfo" component={InfoScreen} />
  </ProfileStack.Navigator>
);

const MainTabs = () => {
  const { profile, isTherapistMode } = useAuth();
  const insets = require('react-native-safe-area-context').useSafeAreaInsets();
  const roleMode = getRoleModeContract(profile?.role, isTherapistMode);
  const showMatchTab = roleMode.canAccessMatchFlow;

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
            case 'MatchTab':
              iconName = focused ? 'sparkles' : 'sparkles-outline';
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
          backgroundColor: Colors.bg.secondary,
          borderTopColor: Colors.stroke.subtle,
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          height: 60 + Math.max(insets.bottom, 8),
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          elevation: 6,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
        },
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStackScreen}
        options={{ tabBarLabel: roleMode.canUseTherapistMode && isTherapistMode ? 'Dashboard' : 'Home' }}
      />
      {showMatchTab ? (
        <Tab.Screen name="MatchTab" component={MatchStackScreen} options={{ tabBarLabel: 'Match' }} />
      ) : null}
      <Tab.Screen name="SessionsTab" component={SessionsScreen} options={{ tabBarLabel: 'Sessions' }} />
      <Tab.Screen name="MessagesTab" component={MessagesStackScreen} options={{ tabBarLabel: 'Messages' }} />
      <Tab.Screen name="ProfileTab" component={ProfileStackScreen} options={{ tabBarLabel: 'Profile' }} />
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
            <Stack.Screen name="SessionPrep" component={SessionPrepScreen} />
            <Stack.Screen name="VideoCall" component={VideoCallScreen} />
            <Stack.Screen name="PostSessionReflection" component={PostSessionReflectionScreen} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
