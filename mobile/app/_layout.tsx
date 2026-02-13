import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../lib/auth-context';
import { colors } from '../lib/colors';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.white,
          headerTitleStyle: { fontSize: 20, fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="home" options={{ title: 'EchoPath Companion', headerBackVisible: false }} />
        <Stack.Screen name="chat" options={{ title: 'My Companion' }} />
        <Stack.Screen name="announcements" options={{ title: 'Community' }} />
      </Stack>
    </AuthProvider>
  );
}
