import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

import GalleryScreen from '../screens/Gallery/GalleryScreen';
import AlbumsScreen from '../screens/Albums/AlbumsScreen';
import AlbumDetailScreen from '../screens/Albums/AlbumDetailScreen';
import CreateAlbumScreen from '../screens/Albums/CreateAlbumScreen';
import FavoritesScreen from '../screens/Favorites/FavoritesScreen';
import TrashScreen from '../screens/Trash/TrashScreen';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import PeopleScreen from '../screens/People/PeopleScreen';
import PersonDetailScreen from '../screens/People/PersonDetailScreen';


import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';

import { Image as ImageIcon, Folder, Heart, Trash2, Users } from 'lucide-react-native';

const Tab = createBottomTabNavigator();
const RootStack = createStackNavigator();

const MainTabs = () => {
  const { colors } = useTheme();
  return (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: {
        backgroundColor: colors.surface,
        borderTopWidth: 0,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        height: 60,
        paddingBottom: 8,
        paddingTop: 8,
      },
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.onSurfaceVariant,
      tabBarLabelStyle: {
        fontSize: 12,
        fontWeight: '500',
      },
      tabBarIcon: ({ color, focused }) => {
        const iconProps = { color, size: 24, strokeWidth: focused ? 2.5 : 2 };
        if (route.name === 'Gallery') return <ImageIcon {...iconProps} />;
        if (route.name === 'AlbumsTab') return <Folder {...iconProps} />;
        if (route.name === 'PeopleTab') return <Users {...iconProps} />;
        if (route.name === 'Favorites') return <Heart {...iconProps} fill={focused ? color : 'transparent'} />;
        if (route.name === 'Trash') return <Trash2 {...iconProps} />;
        return null;
      },
    })}
  >
    <Tab.Screen name="Gallery" component={GalleryScreen} options={{ tabBarLabel: 'Gallery' }} />
    <Tab.Screen name="AlbumsTab" component={AlbumsScreen} options={{ tabBarLabel: 'Albums' }} />
    <Tab.Screen name="PeopleTab" component={PeopleScreen} options={{ tabBarLabel: 'People' }} />
    <Tab.Screen name="Favorites" component={FavoritesScreen} options={{ tabBarLabel: 'Favorites' }} />
    <Tab.Screen name="Trash" component={TrashScreen} options={{ tabBarLabel: 'Trash' }} />
  </Tab.Navigator>
  );
};

import PrivateGalleryScreen from '../screens/PrivateGallery/PrivateGalleryScreen';
import PrivatePinScreen from '../screens/PrivateGallery/PrivatePinScreen';

const slide = { cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS };

const AppNavigator = () => {
  const { colors } = useTheme();
  return (
  <SafeAreaProvider>
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false, cardStyle: { backgroundColor: colors.background } }}>
        <RootStack.Screen name="MainTabs" component={MainTabs} />
        <RootStack.Screen name="AlbumDetail" component={AlbumDetailScreen} options={slide} />
        <RootStack.Screen name="CreateAlbum" component={CreateAlbumScreen} options={slide} />
        <RootStack.Screen name="PersonDetail" component={PersonDetailScreen} options={slide} />
        <RootStack.Screen name="Settings" component={SettingsScreen} options={slide} />
        <RootStack.Screen name="PrivateGallery" component={PrivateGalleryScreen} options={slide} />
        <RootStack.Screen name="PrivatePin" component={PrivatePinScreen} options={slide} />
      </RootStack.Navigator>
    </NavigationContainer>
  </SafeAreaProvider>
  );
};

export default AppNavigator;
