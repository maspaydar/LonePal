import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth-context';
import { colors } from '../lib/colors';
import * as api from '../lib/api';

export default function HomeScreen() {
  const router = useRouter();
  const { resident, logout } = useAuth();

  const [syncData, setSyncData] = useState<api.SyncResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);

  const fetchSync = useCallback(async () => {
    if (!resident) return;
    try {
      const data = await api.syncData(resident.entityId, resident.id);
      setSyncData(data);
      if (data.safetyStatus.hasActiveAlert) {
        setShowCheckIn(true);
      }
    } catch (err: any) {
      if (err.message === 'SESSION_EXPIRED') {
        Alert.alert('Session Expired', 'Please sign in again.');
        await logout();
        router.replace('/');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [resident]);

  useEffect(() => {
    fetchSync();
    const interval = setInterval(fetchSync, 30000);
    return () => clearInterval(interval);
  }, [fetchSync]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSync();
  };

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

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'safe':
        return { label: 'All Secure', color: colors.success, bg: colors.successBg, icon: 'shield-checkmark' as const };
      case 'monitoring':
        return { label: 'Monitoring', color: colors.warning, bg: colors.warningBg, icon: 'eye' as const };
      case 'alert':
        return { label: 'Needs Attention', color: colors.danger, bg: colors.dangerBg, icon: 'alert-circle' as const };
      default:
        return { label: 'Unknown', color: colors.textTertiary, bg: colors.background, icon: 'help-circle' as const };
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading your dashboard...</Text>
      </View>
    );
  }

  const status = getStatusConfig(syncData?.safetyStatus?.current || resident?.status || 'safe');
  const name = syncData?.resident?.preferredName || resident?.preferredName || 'Friend';
  const unseenAnnouncements = syncData?.announcements?.length || 0;

  return (
    <View style={styles.container}>
      <Modal
        visible={showCheckIn}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCheckIn(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="chatbubble-ellipses" size={48} color={colors.primary} />
            <Text style={styles.modalTitle}>Check-In Time</Text>
            <Text style={styles.modalMessage}>
              We noticed some unusual activity. Would you like to chat with your companion?
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setShowCheckIn(false);
                router.push('/chat');
              }}
            >
              <Text style={styles.modalButtonText}>Chat Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalDismiss}
              onPress={() => setShowCheckIn(false)}
            >
              <Text style={styles.modalDismissText}>I'm fine, thanks</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        <Text style={styles.greeting}>Hello, {name}</Text>

        <View style={[styles.statusCard, { backgroundColor: status.bg }]}>
          <Ionicons name={status.icon} size={36} color={status.color} />
          <View style={styles.statusTextWrap}>
            <Text style={styles.statusLabel}>Safety Status</Text>
            <Text style={[styles.statusValue, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.chatButton}
          onPress={() => router.push('/chat')}
          accessibilityRole="button"
          accessibilityLabel="Talk to your companion"
        >
          <Ionicons name="mic" size={32} color={colors.white} />
          <View style={styles.chatButtonText}>
            <Text style={styles.chatButtonTitle}>Talk to Your Companion</Text>
            <Text style={styles.chatButtonSub}>
              {syncData?.lastAIMessage
                ? `Last chat: "${syncData.lastAIMessage.content.slice(0, 50)}..."`
                : 'Tap to start a voice conversation'}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuCard}
          onPress={() => router.push('/announcements')}
          accessibilityRole="button"
          accessibilityLabel="Community announcements"
        >
          <Ionicons name="megaphone" size={28} color={colors.primary} />
          <View style={styles.menuCardTextWrap}>
            <Text style={styles.menuCardTitle}>Community</Text>
            <Text style={styles.menuCardSub}>
              {unseenAnnouncements > 0
                ? `${unseenAnnouncements} announcement${unseenAnnouncements > 1 ? 's' : ''}`
                : 'No new announcements'}
            </Text>
          </View>
          {unseenAnnouncements > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unseenAnnouncements}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color={colors.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    fontSize: 18,
    color: colors.textSecondary,
    marginTop: 16,
  },
  greeting: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 24,
    marginTop: 8,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    gap: 16,
  },
  statusTextWrap: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  statusValue: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 2,
  },
  chatButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    marginBottom: 16,
    gap: 16,
  },
  chatButtonText: {
    flex: 1,
  },
  chatButtonTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.white,
  },
  chatButtonSub: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  menuCard: {
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    gap: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuCardTextWrap: {
    flex: 1,
  },
  menuCardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  menuCardSub: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: 2,
  },
  badge: {
    backgroundColor: colors.danger,
    borderRadius: 14,
    minWidth: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  badgeText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginTop: 16,
    gap: 8,
  },
  logoutText: {
    fontSize: 18,
    color: colors.danger,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginTop: 16,
  },
  modalMessage: {
    fontSize: 18,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 26,
  },
  modalButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 40,
    marginTop: 24,
    width: '100%',
    alignItems: 'center',
  },
  modalButtonText: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '700',
  },
  modalDismiss: {
    marginTop: 16,
    padding: 8,
  },
  modalDismissText: {
    fontSize: 18,
    color: colors.textTertiary,
  },
});
