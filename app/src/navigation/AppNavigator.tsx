import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import GalleryScreen from '../screens/Gallery/GalleryScreen';
import AlbumsScreen from '../screens/Albums/AlbumsScreen';
import AlbumDetailScreen from '../screens/Albums/AlbumDetailScreen';
import FavoritesScreen from '../screens/Favorites/FavoritesScreen';
import TrashScreen from '../screens/Trash/TrashScreen';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import { createStackNavigator } from '@react-navigation/stack';

import { Image as ImageIcon, Folder, Heart, Trash2, Settings } from 'lucide-react-native';

const Tab = createBottomTabNavigator();
const AlbumsStack = createStackNavigator();

const AlbumsStackScreen = () => (
  <AlbumsStack.Navigator screenOptions={{ headerShown: false }}>
    <AlbumsStack.Screen name="AlbumsList" component={AlbumsScreen} />
    <AlbumsStack.Screen name="AlbumDetail" component={AlbumDetailScreen} />
  </AlbumsStack.Navigator>
);

const AppNavigator = () => {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
            tabBarActiveTintColor: '#2196F3',
            tabBarInactiveTintColor: '#999',
            tabBarIcon: ({ color, size }) => {
              if (route.name === 'Gallery') {
                return <ImageIcon color={color} size={size} />;
              } else if (route.name === 'AlbumsTab') {
                return <Folder color={color} size={size} />;
              } else if (route.name === 'Favorites') {
                return <Heart color={color} size={size} />;
              } else if (route.name === 'Trash') {
                return <Trash2 color={color} size={size} />;
              } else if (route.name === 'Settings') {
                return <Settings color={color} size={size} />;
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
            component={AlbumsStackScreen}
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
          <Tab.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ tabBarLabel: 'Settings' }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

export default AppNavigator;
