import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth-context';
import { colors } from '../lib/colors';
import * as api from '../lib/api';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function ChatScreen() {
  const { resident } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);

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
        setMessages([
          {
            id: 'welcome',
            role: 'assistant',
            content: `Hello ${syncResult.resident.preferredName || 'there'}! I'm your EchoPath companion. How are you feeling today?`,
            timestamp: new Date(),
          },
        ]);
      }
    } catch (err) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `Hello! I'm your EchoPath companion. How are you feeling today?`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [resident]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || !resident) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      let convId = conversationId;

      if (!convId) {
        const statusData = await api.getResidentStatus(resident.id);
        if (statusData.activeConversation) {
          convId = statusData.activeConversation.id;
          setConversationId(convId);
        }
      }

      if (!convId) {
        try {
          const newConv = await api.createConversation();
          convId = newConv.id;
          setConversationId(convId);
        } catch {
          const errMsg: ChatMessage = {
            id: `ai-${Date.now()}`,
            role: 'assistant',
            content: "I'm having trouble connecting right now. Please try again in a moment.",
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, errMsg]);
          setSending(false);
          return;
        }
      }

      const result = await api.sendMessage(resident.id, convId, text);
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: result.response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);

      if (result.conversationId && result.conversationId !== convId) {
        setConversationId(result.conversationId);
      }
    } catch (err: any) {
      Alert.alert('Error', 'Could not send your message. Please try again.');
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setInput(text);
    } finally {
      setSending(false);
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
            {item.content}
          </Text>
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
      />

      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder="Type your message..."
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={500}
          editable={!sending}
          accessibilityLabel="Message input"
        />
        <TouchableOpacity
          style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="send" size={22} color={colors.white} />
          )}
        </TouchableOpacity>
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
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
  sendButton: {
    backgroundColor: colors.primary,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});
