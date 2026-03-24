import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth-context';
import { colors } from '../lib/colors';
import * as api from '../lib/api';

export default function WaitingScreen() {
  const router = useRouter();
  const { resident, logout } = useAuth();
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkAssignment = useCallback(async () => {
    if (!resident) return;
    setChecking(true);
    try {
      const profile = await api.getMe();
      if (profile.isPaired && profile.unit) {
        router.replace('/home');
      } else {
        setLastChecked(new Date());
      }
    } catch {
    } finally {
      setChecking(false);
    }
  }, [resident, router]);

  useEffect(() => {
    checkAssignment();
    const interval = setInterval(checkAssignment, 30000);
    return () => clearInterval(interval);
  }, [checkAssignment]);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/');
        },
      },
    ]);
  };

  const name = resident?.preferredName || 'there';

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="home-outline" size={64} color={colors.primary} />
        </View>

        <Text style={styles.greeting}>Hi, {name}!</Text>
        <Text style={styles.title}>Waiting for Room Assignment</Text>
        <Text style={styles.description}>
          Your account is set up and ready. A staff member will assign you to
          your room shortly. Once assigned, you'll be taken to your dashboard
          automatically.
        </Text>

        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            {checking ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.primary} />
            )}
            <Text style={styles.statusText}>
              {checking ? 'Checking assignment...' : 'Checking every 30 seconds'}
            </Text>
          </View>
          {lastChecked && !checking && (
            <Text style={styles.lastCheckedText}>
              Last checked: {lastChecked.toLocaleTimeString()}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={checkAssignment}
          disabled={checking}
        >
          <Ionicons name="refresh-outline" size={18} color={colors.primary} />
          <Text style={styles.refreshButtonText}>Check Now</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleLogout}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 24,
    marginHorizontal: 8,
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginTop: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  lastCheckedText: {
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 6,
    paddingLeft: 30,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
    marginTop: 8,
  },
  refreshButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  signOutButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  signOutText: {
    fontSize: 16,
    color: colors.textTertiary,
  },
});
