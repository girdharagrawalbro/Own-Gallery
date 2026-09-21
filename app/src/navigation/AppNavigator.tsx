import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import GalleryScreen from '../screens/Gallery/GalleryScreen';
import AlbumsScreen from '../screens/Albums/AlbumsScreen';
import AlbumDetailScreen from '../screens/Albums/AlbumDetailScreen';
import FavoritesScreen from '../screens/Favorites/FavoritesScreen';
import TrashScreen from '../screens/Trash/TrashScreen';
import SettingsScreen from '../screens/Settings/SettingsScreen';

import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { Image as ImageIcon, Folder, Heart, Trash2, Settings } from 'lucide-react-native';

const Tab = createBottomTabNavigator();
const RootStack = createStackNavigator();

const MainTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: { 
        backgroundColor: '#fff', 
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
      tabBarActiveTintColor: '#1a73e8', // Google Blue
      tabBarInactiveTintColor: '#5f6368', // Google Grey
      tabBarLabelStyle: {
        fontSize: 12,
        fontWeight: '500',
      },
      tabBarIcon: ({ color, size, focused }) => {
        const iconProps = { color, size: 24, strokeWidth: focused ? 2.5 : 2 };
        if (route.name === 'Gallery') {
          return <ImageIcon {...iconProps} />;
        } else if (route.name === 'AlbumsTab') {
          return <Folder {...iconProps} />;
        } else if (route.name === 'Favorites') {
          return <Heart {...iconProps} fill={focused ? color : 'transparent'} />;
        } else if (route.name === 'Trash') {
          return <Trash2 {...iconProps} />;
        }
      },
    })}
  >
    <Tab.Screen
      name="Gallery"
      component={GalleryScreen}
      options={{ tabBarLabel: 'Gallery' }}
    />
    <Tab.Screen
      name="AlbumsTab"
      component={AlbumsScreen}
      options={{ tabBarLabel: 'Albums' }}
    />
    <Tab.Screen
      name="Favorites"
      component={FavoritesScreen}
      options={{ tabBarLabel: 'Favorites' }}
    />
    <Tab.Screen
      name="Trash"
      component={TrashScreen}
      options={{ tabBarLabel: 'Trash' }}
    />
  </Tab.Navigator>
);

const AppNavigator = () => {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="MainTabs" component={MainTabs} />
          <RootStack.Screen 
            name="AlbumDetail" 
            component={AlbumDetailScreen} 
            options={{
              cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
            }}
          />
          <RootStack.Screen 
            name="Settings" 
            component={SettingsScreen} 
            options={{
              cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
            }}
          />
        </RootStack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

export default AppNavigator;
