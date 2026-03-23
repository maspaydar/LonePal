import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Animated,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '../lib/auth-context';
import { colors } from '../lib/colors';
import * as api from '../lib/api';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export default function ChatScreen() {
  const { resident } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isSpeakingRef = useRef(false);

  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  const loadStatus = useCallback(async () => {
    if (!resident) return;
    try {
      const statusData = await api.getResidentStatus(resident.id);
      if (statusData.activeConversation) {
        setConversationId(statusData.activeConversation.id);
      }

      const syncResult = await api.syncData(resident.entityId, resident.id);
      if (syncResult.lastAIMessage) {
        setMessages([
          {
            id: `ai-${syncResult.lastAIMessage.id}`,
            role: 'assistant',
            content: syncResult.lastAIMessage.content,
            timestamp: new Date(syncResult.lastAIMessage.createdAt),
          },
        ]);
      } else {
        const welcomeMsg = `Hello ${syncResult.resident.preferredName || 'there'}! I'm your HeyGrand companion. Tap the microphone button and start talking to me!`;
        setMessages([
          {
            id: 'welcome',
            role: 'assistant',
            content: welcomeMsg,
            timestamp: new Date(),
          },
        ]);
      }
    } catch (err) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `Hello! I'm your HeyGrand companion. Tap the microphone and start talking!`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [resident]);

  useEffect(() => {
    loadStatus();
    return () => {
      Speech.stop();
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, [loadStatus]);

  const ensureConversation = useCallback(async (): Promise<number | null> => {
    if (conversationId) return conversationId;
    if (!resident) return null;

    try {
      const statusData = await api.getResidentStatus(resident.id);
      if (statusData.activeConversation) {
        setConversationId(statusData.activeConversation.id);
        return statusData.activeConversation.id;
      }
    } catch {}

    try {
      const newConv = await api.createConversation();
      setConversationId(newConv.id);
      return newConv.id;
    } catch {
      return null;
    }
  }, [conversationId, resident]);

  const speakResponse = useCallback(async (text: string) => {
    isSpeakingRef.current = true;
    setVoiceState('speaking');
    startPulse();

    return new Promise<void>((resolve) => {
      Speech.speak(text, {
        language: 'en-US',
        rate: 0.85,
        pitch: 1.0,
        onDone: () => {
          isSpeakingRef.current = false;
          setVoiceState('idle');
          stopPulse();
          resolve();
        },
        onError: () => {
          isSpeakingRef.current = false;
          setVoiceState('idle');
          stopPulse();
          resolve();
        },
        onStopped: () => {
          isSpeakingRef.current = false;
          setVoiceState('idle');
          stopPulse();
          resolve();
        },
      });
    });
  }, [startPulse, stopPulse]);

  const stopSpeaking = useCallback(() => {
    Speech.stop();
    isSpeakingRef.current = false;
    setVoiceState('idle');
    stopPulse();
  }, [stopPulse]);

  const processVoiceInput = useCallback(async (audioUri?: string, textMessage?: string) => {
    if (!resident) return;

    const convId = await ensureConversation();
    if (!convId) {
      Alert.alert('Connection Error', 'Could not connect to your companion. Please try again.');
      setVoiceState('idle');
      stopPulse();
      return;
    }

    setVoiceState('thinking');

    const aiMsgId = `ai-${Date.now()}`;
    let streamedText = '';

    try {
      let options: { message?: string; audioBase64?: string; audioMimeType?: string } = {};

      if (textMessage) {
        options.message = textMessage;
        const userMsg: ChatMessage = {
          id: `user-${Date.now()}`,
          role: 'user',
          content: textMessage,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMsg]);
      } else if (audioUri) {
        const base64 = await FileSystem.readAsStringAsync(audioUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        options.audioBase64 = base64;
        options.audioMimeType = 'audio/m4a';
      }

      setMessages((prev) => [
        ...prev,
        { id: aiMsgId, role: 'assistant', content: '', timestamp: new Date(), isStreaming: true },
      ]);

      await api.sendVoiceMessage(resident.id, convId, options, (event) => {
        if (event.type === 'transcription' && event.text && !textMessage) {
          const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: event.text,
            timestamp: new Date(),
          };
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === aiMsgId);
            if (idx > 0) {
              const newMsgs = [...prev];
              newMsgs.splice(idx, 0, userMsg);
              return newMsgs;
            }
            return [...prev.slice(0, -1), userMsg, prev[prev.length - 1]];
          });
        } else if (event.type === 'chunk' && event.text) {
          streamedText += event.text;
          setMessages((prev) =>
            prev.map((m) => (m.id === aiMsgId ? { ...m, content: streamedText } : m))
          );
        } else if (event.type === 'done') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId ? { ...m, content: streamedText, isStreaming: false } : m
            )
          );
          if (event.conversationId && event.conversationId !== convId) {
            setConversationId(event.conversationId);
          }
        } else if (event.type === 'error') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? { ...m, content: event.message || 'Something went wrong.', isStreaming: false }
                : m
            )
          );
        }
      });

      if (streamedText) {
        await speakResponse(streamedText);
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? { ...m, content: "I couldn't connect right now. Please try again.", isStreaming: false }
            : m
        )
      );
      setVoiceState('idle');
      stopPulse();
    }
  }, [resident, ensureConversation, speakResponse, stopPulse]);

  const startRecording = useCallback(async () => {
    if (voiceState !== 'idle') {
      if (voiceState === 'speaking') {
        stopSpeaking();
      }
      return;
    }

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Needed', 'Please allow microphone access to use voice chat.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setVoiceState('listening');
      startPulse();
    } catch (err) {
      Alert.alert('Error', 'Could not start recording. Please try again.');
    }
  }, [voiceState, startPulse, stopSpeaking]);

  const stopRecording = useCallback(async () => {
    if (voiceState !== 'listening' || !recordingRef.current) return;

    stopPulse();

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      if (uri) {
        await processVoiceInput(uri);
      }
    } catch (err) {
      setVoiceState('idle');
      Alert.alert('Error', 'Could not process recording. Please try again.');
    }
  }, [voiceState, stopPulse, processVoiceInput]);

  const handleMicPress = useCallback(() => {
    if (voiceState === 'idle') {
      startRecording();
    } else if (voiceState === 'listening') {
      stopRecording();
    } else if (voiceState === 'speaking') {
      stopSpeaking();
    }
  }, [voiceState, startRecording, stopRecording, stopSpeaking]);

  const handleTextSend = useCallback(async () => {
    const text = textInput.trim();
    if (!text || voiceState !== 'idle') return;
    setTextInput('');
    setShowTextInput(false);
    await processVoiceInput(undefined, text);
  }, [textInput, voiceState, processVoiceInput]);

  const getMicConfig = () => {
    switch (voiceState) {
      case 'listening':
        return { icon: 'stop-circle' as const, color: colors.danger, label: 'Tap to Stop', bg: colors.dangerBg };
      case 'thinking':
        return { icon: 'hourglass' as const, color: colors.warning, label: 'Thinking...', bg: colors.warningBg };
      case 'speaking':
        return { icon: 'volume-high' as const, color: colors.success, label: 'Tap to Stop', bg: colors.successBg };
      default:
        return { icon: 'mic' as const, color: colors.primary, label: 'Tap to Talk', bg: colors.accentBg };
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.aiBubble]}>
        {!isUser && (
          <View style={styles.aiAvatar}>
            <Ionicons name="heart-circle" size={28} color={colors.primary} />
          </View>
        )}
        <View style={[styles.messageContent, isUser ? styles.userContent : styles.aiContent]}>
          <Text style={[styles.messageText, isUser ? styles.userText : styles.aiText]}>
            {item.content || (item.isStreaming ? '...' : '')}
          </Text>
          {item.isStreaming && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 4 }} />}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Connecting to your companion...</Text>
      </View>
    );
  }

  const micConfig = getMicConfig();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        onLayout={() => flatListRef.current?.scrollToEnd()}
        ListHeaderComponent={
          <View style={styles.voiceHint}>
            <Ionicons name="mic-outline" size={20} color={colors.textTertiary} />
            <Text style={styles.voiceHintText}>
              Tap the microphone to start talking
            </Text>
          </View>
        }
      />

      <View style={styles.controlBar}>
        {showTextInput ? (
          <View style={styles.textInputRow}>
            <TextInput
              style={styles.textInput}
              value={textInput}
              onChangeText={setTextInput}
              placeholder="Type a message..."
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={500}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.textSendButton, !textInput.trim() && styles.buttonDisabled]}
              onPress={handleTextSend}
              disabled={!textInput.trim() || voiceState !== 'idle'}
              accessibilityRole="button"
              accessibilityLabel="Send text message"
            >
              <Ionicons name="send" size={22} color={colors.white} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.closeTextButton}
              onPress={() => setShowTextInput(false)}
              accessibilityRole="button"
              accessibilityLabel="Close text input"
            >
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.voiceControlRow}>
            <TouchableOpacity
              style={styles.keyboardToggle}
              onPress={() => setShowTextInput(true)}
              accessibilityRole="button"
              accessibilityLabel="Switch to text input"
            >
              <Ionicons name="chatbubble-outline" size={26} color={colors.textSecondary} />
              <Text style={styles.keyboardLabel}>Type</Text>
            </TouchableOpacity>

            <View style={styles.micContainer}>
              <Animated.View style={[styles.micPulseRing, { transform: [{ scale: pulseAnim }], borderColor: micConfig.color, opacity: voiceState !== 'idle' ? 0.3 : 0 }]} />
              <TouchableOpacity
                style={[styles.micButton, { backgroundColor: micConfig.color }]}
                onPress={handleMicPress}
                disabled={voiceState === 'thinking'}
                accessibilityRole="button"
                accessibilityLabel={micConfig.label}
                data-testid="button-mic"
              >
                {voiceState === 'thinking' ? (
                  <ActivityIndicator size="large" color={colors.white} />
                ) : (
                  <Ionicons name={micConfig.icon} size={36} color={colors.white} />
                )}
              </TouchableOpacity>
              <Text style={[styles.micLabel, { color: micConfig.color }]}>{micConfig.label}</Text>
            </View>

            <View style={styles.spacer} />
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
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
    backgroundColor: colors.background,
  },
  loadingText: {
    fontSize: 18,
    color: colors.textSecondary,
    marginTop: 16,
  },
  voiceHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  voiceHintText: {
    fontSize: 16,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  messageList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageBubble: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  userBubble: {
    justifyContent: 'flex-end',
  },
  aiBubble: {
    justifyContent: 'flex-start',
  },
  aiAvatar: {
    marginRight: 8,
    marginBottom: 4,
  },
  messageContent: {
    maxWidth: '80%',
    borderRadius: 16,
    padding: 16,
  },
  userContent: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
    marginLeft: 'auto',
  },
  aiContent: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageText: {
    fontSize: 18,
    lineHeight: 26,
  },
  userText: {
    color: colors.white,
  },
  aiText: {
    color: colors.text,
  },
  controlBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  voiceControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  micContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  micPulseRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
  },
  micButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  micLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  keyboardToggle: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    paddingVertical: 8,
  },
  keyboardLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  spacer: {
    width: 60,
  },
  textInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 18,
    maxHeight: 120,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textSendButton: {
    backgroundColor: colors.primary,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeTextButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});
