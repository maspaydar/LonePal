import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../lib/auth-context';
import { colors } from '../lib/colors';
import { setBaseUrl, getBaseUrl, initBaseUrl } from '../lib/api';

export default function LoginScreen() {
  const router = useRouter();
  const { isLoading, isAuthenticated, login } = useAuth();

  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [entityId, setEntityId] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [urlLoaded, setUrlLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      await initBaseUrl();
      setServerUrl(getBaseUrl());
      setUrlLoaded(true);
    })();
  }, []);
  const [showSettings, setShowSettings] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/home');
    }
  }, [isLoading, isAuthenticated]);

  const handleLogin = async () => {
    if (!username.trim()) {
      Alert.alert('Username Required', 'Please enter your username.');
      return;
    }
    if (!pin.trim() || pin.length < 4) {
      Alert.alert('PIN Required', 'Please enter your 4-digit PIN.');
      return;
    }
    if (!entityId.trim()) {
      Alert.alert('Facility ID Required', 'Please enter your facility ID number.');
      return;
    }

    setSubmitting(true);
    try {
      await setBaseUrl(serverUrl);
      await login(username.trim(), pin.trim(), parseInt(entityId));
      router.replace('/home');
    } catch (err: any) {
      Alert.alert('Login Failed', err.message || 'Please check your details and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>EchoPath</Text>
          <Text style={styles.subtitle}>Your Personal Companion</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Your Username</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Resident_1234"
            placeholderTextColor={colors.textTertiary}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Username"
          />

          <Text style={styles.label}>Your PIN</Text>
          <TextInput
            style={styles.input}
            placeholder="4-digit PIN"
            placeholderTextColor={colors.textTertiary}
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            accessibilityLabel="PIN"
          />

          <Text style={styles.label}>Facility ID</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 1"
            placeholderTextColor={colors.textTertiary}
            value={entityId}
            onChangeText={(t) => setEntityId(t.replace(/\D/g, ''))}
            keyboardType="number-pad"
            accessibilityLabel="Facility ID"
          />

          <TouchableOpacity
            style={[styles.loginButton, (submitting || !urlLoaded) && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={submitting || !urlLoaded}
            accessibilityRole="button"
            accessibilityLabel="Sign In"
          >
            {submitting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsLink}
            onPress={() => setShowSettings(!showSettings)}
          >
            <Text style={styles.settingsLinkText}>
              {showSettings ? 'Hide Settings' : 'Server Settings'}
            </Text>
          </TouchableOpacity>

          {showSettings && (
            <View style={styles.settingsBox}>
              <Text style={styles.settingsLabel}>Server URL</Text>
              <TextInput
                style={styles.input}
                value={serverUrl}
                onChangeText={setServerUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                accessibilityLabel="Server URL"
              />
              <Text style={styles.settingsHint}>
                Enter the URL where EchoPath Nexus is running
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.footerText}>
          First time? Enter any 4-digit PIN to create your account.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: 80,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  loadingText: {
    color: colors.white,
    fontSize: 20,
    marginTop: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 42,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 8,
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 20,
    color: colors.text,
  },
  loginButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 28,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '700',
  },
  settingsLink: {
    alignItems: 'center',
    marginTop: 16,
  },
  settingsLinkText: {
    color: colors.textTertiary,
    fontSize: 16,
  },
  settingsBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  settingsLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  settingsHint: {
    fontSize: 14,
    color: colors.textTertiary,
    marginTop: 8,
  },
  footerText: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
  },
});
