import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth-context';
import { colors } from '../lib/colors';
import * as api from '../lib/api';

interface Announcement {
  id: number;
  senderName: string;
  message: string;
  createdAt: string;
}

export default function AnnouncementsScreen() {
  const { resident } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnnouncements = useCallback(async () => {
    if (!resident) return;
    try {
      const data = await api.syncData(resident.entityId, resident.id);
      setAnnouncements(data.announcements);
    } catch (err) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [resident]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAnnouncements();
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHrs = diffMs / (1000 * 60 * 60);

    if (diffHrs < 1) {
      const mins = Math.floor(diffMs / (1000 * 60));
      return `${mins} min${mins !== 1 ? 's' : ''} ago`;
    }
    if (diffHrs < 24) {
      const hrs = Math.floor(diffHrs);
      return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderItem = ({ item }: { item: Announcement }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.senderRow}>
          <Ionicons name="person-circle" size={24} color={colors.primary} />
          <Text style={styles.senderName}>{item.senderName}</Text>
        </View>
        <Text style={styles.timestamp}>{formatTime(item.createdAt)}</Text>
      </View>
      <Text style={styles.messageText}>{item.message}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {announcements.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="megaphone-outline" size={64} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No Announcements</Text>
          <Text style={styles.emptySubtitle}>
            Community updates from your facility will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={announcements}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  senderName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  timestamp: {
    fontSize: 14,
    color: colors.textTertiary,
  },
  messageText: {
    fontSize: 18,
    lineHeight: 26,
    color: colors.text,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 18,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 26,
  },
});
