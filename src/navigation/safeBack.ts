export const navigateBackSafe = (
  navigation: any,
  fallbackRoute?: string,
  fallbackParams?: Record<string, any>,
) => {
  if (navigation?.canGoBack?.()) {
    navigation.goBack();
    return;
  }

  const parent = navigation?.getParent?.();

  const nestedFallbackMap: Record<string, { name: string; params?: Record<string, any> }> = {
    HomeMain: { name: 'HomeTab', params: { screen: 'HomeMain' } },
    HomeNotifications: { name: 'HomeTab', params: { screen: 'HomeNotifications' } },
    MessagesList: { name: 'MessagesTab', params: { screen: 'MessagesList' } },
    TherapistMatch: { name: 'MatchTab', params: { screen: 'TherapistMatch' } },
    ProfileMain: { name: 'ProfileTab', params: { screen: 'ProfileMain' } },
    Notifications: { name: 'ProfileTab', params: { screen: 'Notifications' } },
    Journal: { name: 'HomeTab', params: { screen: 'Journal' } },
  };

  if (fallbackRoute) {
    try {
      navigation?.navigate?.(fallbackRoute, fallbackParams);
      return;
    } catch {
      // try parent route fallback
    }

    const nested = nestedFallbackMap[fallbackRoute];
    if (nested) {
      if (parent?.navigate) {
        parent.navigate(nested.name, nested.params);
        return;
      }
      navigation?.navigate?.(nested.name, nested.params);
      return;
    }
  }

  if (parent?.navigate) {
    parent.navigate('HomeTab', { screen: 'HomeMain' });
    return;
  }

  navigation?.navigate?.('Main', { screen: 'HomeTab', params: { screen: 'HomeMain' } });
};
