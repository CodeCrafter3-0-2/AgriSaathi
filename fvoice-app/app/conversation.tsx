import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import {
  useAudioRecorder,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from "expo-audio";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { useTranslation, getTTSLang } from "../lib/i18n";

// ─── Config ───────────────────────────────────────────────────────────────────
const MAX_IMAGES = 3;
const CALL_NUMBER = "+917009292066"; 

interface SelectedImage {
  uri: string;
  base64: string;
  mimeType: string;
}

export default function ConversationScreen() {
  const { t, loaded, lang } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { conversationId, autoplayText } = useLocalSearchParams<{ conversationId: string, autoplayText?: string }>();

  // ── State ──────────────────────────────────────────────────────────────────
  const [textInput, setTextInput] = useState("");
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [audioData, setAudioData] = useState<{ data: string; mimeType: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [userLang, setUserLang] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── Convex ─────────────────────────────────────────────────────────────────
  const convId = conversationId as Id<"conversations"> | undefined;

  const appendMessage = useMutation(api.conversations.appendMessage);
  const summarizeAndClose = useMutation(api.conversations.summarizeAndClose);
  const geminiChat = useAction(api.ai.chat);
  const summarizeConversation = useAction(api.ai.summarizeConversation);

  const [messages, setMessages] = useState<
    Array<{
      role: "user" | "assistant";
      content: string;
      timestamp: number;
      imageUrls?: string[];
      audioTranscript?: string;
    }>
  >([]);

  const convDoc = useQuery(
    api.conversations.getConversationById,
    convId ? { conversationId: convId } : "skip"
  );

  useEffect(() => {
    if (convDoc?.messages) {
      setMessages(convDoc.messages as typeof messages);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
    }
  }, [convDoc]);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem("userLat"),
      AsyncStorage.getItem("userLng"),
      AsyncStorage.getItem("selectedLanguage"),
    ]).then(([lat, lng, lang]) => {
      if (lat) setUserLat(parseFloat(lat));
      if (lng) setUserLng(parseFloat(lng));
      if (lang) setUserLang(lang);
    });
  }, []);

  // ── Auto-play TTS if passed from Dashboard ──
  useEffect(() => {
    if (autoplayText && lang && loaded) {
      Speech.stop();
      Speech.speak(autoplayText, { language: getTTSLang(lang) });
    }
    return () => { Speech.stop(); };
  }, [autoplayText, lang, loaded]);

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);



  const handleBack = useCallback(() => {
    Speech.stop(); // stop talking when navigating back
    router.back();
    if (!convId) return;

    (async () => {
      try {
        let summary = `Conversation on ${new Date().toLocaleDateString()}.`;
        if (messages.length > 0) {
          try {
            const result = await summarizeConversation({
              messages: messages.map((m) => ({ role: m.role, content: m.content })),
              language: userLang ?? undefined,
            });
            summary = result.summary;
          } catch (e) {
            console.warn("Summarization failed, using fallback:", e);
          }
        }
        await summarizeAndClose({ conversationId: convId, summary });
        await AsyncStorage.removeItem("activeConversationId");
      } catch (err) {
        console.error("Failed to close conversation:", err);
      }
    })();
  }, [convId, messages, summarizeConversation, summarizeAndClose, router, userLang]);

  const startRecording = async () => {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      Alert.alert("Permission required", "Microphone permission is needed.");
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setIsRecording(true);
  };

  const stopRecording = async () => {
    if (!isRecording) return;
    await recorder.stop();
    setIsRecording(false);
    await setAudioModeAsync({ allowsRecording: false });

    const uri = recorder.uri;
    if (!uri) return;

    setIsLoading(true);
    try {
      let fileReady = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists && (info as { size?: number }).size && (info as { size?: number }).size! > 0) {
          fileReady = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      if (!fileReady) {
        Alert.alert('Error', 'Audio file was not saved correctly.');
        setIsLoading(false);
        return;
      }

      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const mimeType = uri.endsWith('.wav') ? 'audio/wav' : 'audio/mp4';
      const freshAudio = { data: base64, mimeType };

      await sendToAI({ audioOverride: freshAudio });
    } catch (e) {
      console.error('Failed to read audio:', e);
      Alert.alert('Error', 'Could not process audio.');
      setIsLoading(false);
    }
  };

  const pickImage = async () => {
    if (images.length >= MAX_IMAGES) {
      Alert.alert("Limit reached", `You can attach up to ${MAX_IMAGES} images.`);
      return;
    }
    Alert.alert("Add Image", "Choose a source", [
      {
        text: "Camera",
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") return;
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: "images", base64: true, quality: 0.6 });
          if (!result.canceled && result.assets[0]) addImageAsset(result.assets[0]);
        },
      },
      {
        text: "Gallery",
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", base64: true, quality: 0.6 });
          if (!result.canceled && result.assets[0]) addImageAsset(result.assets[0]);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const addImageAsset = (asset: ImagePicker.ImagePickerAsset) => {
    if (!asset.base64) return;
    setImages((prev) => [...prev, { uri: asset.uri, base64: asset.base64!, mimeType: asset.mimeType ?? "image/jpeg" }]);
  };

  const sendToAI = useCallback(async (opts?: { audioOverride?: { data: string; mimeType: string } }) => {
    const combinedText = textInput.trim();
    const effectiveAudio = opts?.audioOverride ?? audioData;
    if (!combinedText && !effectiveAudio && images.length === 0) {
      Alert.alert("Empty input", "Please add a message, audio, or image.");
      return;
    }
    if (!convId) return;

    setIsLoading(true);
    try {
      const now = Date.now();
      const audioLabel = effectiveAudio ? "🎙️ Voice note" : undefined;
      const userContent = [combinedText, audioLabel].filter(Boolean).join("\n");
      const userMsg = {
        role: "user" as const,
        content: userContent || "[Image sent]",
        timestamp: now,
        imageUrls: images.map((i) => i.uri),
        audioTranscript: audioLabel,
      };

      setMessages((prev) => [...prev, userMsg]);
      await appendMessage({ conversationId: convId, message: userMsg });

      const imagesSnapshot = images;
      setTextInput("");
      setImages([]);
      setAudioData(null);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      const result = await geminiChat({
        history,
        userMessage: combinedText,
        audio: effectiveAudio ?? undefined,
        images: imagesSnapshot.length > 0 ? imagesSnapshot.map((i) => ({ data: i.base64, mimeType: i.mimeType })) : undefined,
        userLocation: (userLat !== null && userLng !== null) ? { latitude: userLat, longitude: userLng } : undefined,
        language: userLang ?? undefined,
      });

      const assistantMsg = {
        role: "assistant" as const,
        content: result.response,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      await appendMessage({ conversationId: convId, message: assistantMsg });

      if (effectiveAudio) {
        Speech.stop();
        Speech.speak(result.response, { language: getTTSLang(userLang ?? lang ?? 'en') });
      }

      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred.";
      Alert.alert("Error", message);
    } finally {
      setIsLoading(false);
    }
  }, [textInput, audioData, images, convId, messages, appendMessage, geminiChat, userLat, userLng, userLang]);
  if (!loaded) return null;
  return (
    <View style={{ flex: 1, backgroundColor: "#06060A" }}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: t("conversation_start"),
          headerTitleStyle: { color: "#FFF", fontSize: 18, fontWeight: '700' },
          headerStyle: { backgroundColor: "#0A0A10" },
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable onPress={handleBack} style={{ paddingRight: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="chevron-back" size={24} color="#667EEA" />
              <Text style={{ color: "#667EEA", fontSize: 16, fontWeight: '600' }}>{t("back")}</Text>
            </Pressable>
          ),
          headerBackVisible: false,
        }}
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 20, paddingBottom: 220, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 && (
          <View style={{ alignItems: "center", marginTop: 80, gap: 16 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(102, 126, 234, 0.1)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="sparkles" size={36} color="#A798FF" />
            </View>
            <Text style={{ color: "#FFF", fontSize: 20, fontWeight: '700' }}>{t("conversation_start")}</Text>
            <Text style={{ color: "#8E8E9F", fontSize: 15, textAlign: 'center' }}>{t("conversation_desc")}</Text>
          </View>
        )}

        {messages.map((msg, i) => (
          <View key={i} style={{ alignItems: msg.role === "user" ? "flex-end" : "flex-start", width: '100%' }}>
            
            {msg.role === "assistant" && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginLeft: 4, width: '100%' }}>
                <Ionicons name="sparkles" size={14} color="#A798FF" />
                <Text style={{ color: "#A798FF", fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>FVoice</Text>
                
                <Pressable onPress={() => { Speech.stop(); Speech.speak(msg.content, { language: getTTSLang(lang) }); }} style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(167, 152, 255, 0.1)', borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="volume-medium" size={16} color="#A798FF" />
                  <Text style={{ color: "#A798FF", fontSize: 11, fontWeight: '700' }}>{t("play_sound")}</Text>
                </Pressable>
              </View>
            )}

            {msg.imageUrls && msg.imageUrls.length > 0 && (
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                {msg.imageUrls.map((uri, j) => (
                  <Image key={j} source={{ uri }} style={{ width: 140, height: 140, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }} contentFit="cover" />
                ))}
              </View>
            )}

            <View style={{
              maxWidth: "85%",
              backgroundColor: msg.role === "user" ? "#667EEA" : "rgba(255,255,255,0.06)",
              borderRadius: 20,
              borderBottomRightRadius: msg.role === "user" ? 4 : 20,
              borderBottomLeftRadius: msg.role === "assistant" ? 4 : 20,
              borderWidth: 1,
              borderColor: msg.role === "user" ? "#7c91f0" : "rgba(255,255,255,0.1)",
              paddingHorizontal: 16,
              paddingVertical: 12,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: msg.role === "user" ? 0.3 : 0.1,
              shadowRadius: 8,
            }}>
              <Text selectable style={{ color: "#FFF", fontSize: 16, lineHeight: 24, fontWeight: '500' }}>
                {msg.content}
              </Text>
            </View>

            <Text style={{ color: "#666677", fontSize: 11, marginTop: 6, marginHorizontal: 6, fontWeight: '500' }}>
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
        ))}

        {isLoading && (
          <View style={{ alignItems: "flex-start", width: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginLeft: 4 }}>
              <Ionicons name="sparkles" size={14} color="#A798FF" />
              <Text style={{ color: "#A798FF", fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>FVoice</Text>
            </View>
            <View style={{ backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 20, borderBottomLeftRadius: 4, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ActivityIndicator color="#A798FF" size="small" />
              <Text style={{ color: "#DDD", fontSize: 15, fontWeight: '500' }}>{t("generating_response")}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Input Area ── */}
      <Animated.View style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(10, 10, 15, 0.90)',
        paddingBottom: insets.bottom + 12,
        paddingTop: 16,
        paddingHorizontal: 20,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
      }}>
        {images.length > 0 && (
          <View style={{ flexDirection: "row", gap: 10, paddingBottom: 16 }}>
            {images.map((img, i) => (
              <View key={i} style={{ position: "relative" }}>
                <Image source={{ uri: img.uri }} style={{ width: 64, height: 64, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" }} contentFit="cover" />
                <Pressable onPress={() => setImages((prev) => prev.filter((_, j) => j !== i))} style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: "#FF5252", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="close" size={12} color="#FFF" />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {audioData && (
          <View style={{ backgroundColor: 'rgba(102, 234, 126, 0.1)', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: 'rgba(102, 234, 126, 0.2)', flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <Ionicons name="mic" size={20} color="#6BDD6B" />
            <Text style={{ color: "#A0C0A0", fontSize: 14, flex: 1, fontWeight: '600' }} numberOfLines={1}>{t("voice_note_ready")}</Text>
            <Pressable onPress={() => setAudioData(null)} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={22} color="#E05555" />
            </Pressable>
          </View>
        )}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
            <TextInput
              value={textInput}
              onChangeText={setTextInput}
              placeholder={t("message_fvoice")}
              placeholderTextColor="#666677"
              style={{ flex: 1, color: "#FFFFFF", fontSize: 16, fontWeight: '500', padding: 0 }}
              multiline
              maxLength={2000}
            />
            <Pressable onPress={() => sendToAI()} disabled={isLoading} style={{ marginLeft: 10 }}>
              {isLoading ? (
                <ActivityIndicator color="#667EEA" size="small" />
              ) : (
                <View style={{ backgroundColor: textInput.length > 0 ? '#667EEA' : 'transparent', padding: textInput.length > 0 ? 6 : 0, borderRadius: 16 }}>
                  <Ionicons name="send" size={20} color={textInput.length > 0 || images.length > 0 || audioData ? (textInput.length > 0 ? "#FFF" : "#667EEA") : "#44445A"} />
                </View>
              )}
            </Pressable>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8 }}>
          <Pressable onPress={pickImage} style={{ padding: 8 }}>
            <Ionicons name="image-outline" size={28} color="#A798FF" />
          </Pressable>
          
          <Pressable onPressIn={startRecording} onPressOut={stopRecording}>
            <Animated.View style={{
              transform: [{ scale: pulseAnim }],
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: isRecording ? "#FF5252" : "#667EEA",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: isRecording ? "#FF5252" : "#667EEA",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 10,
            }}>
              <Ionicons name={isRecording ? "stop" : "mic"} size={26} color="#FFF" />
            </Animated.View>
          </Pressable>

          <Pressable onPress={() => {
              const { Linking } = require("react-native");
              Linking.openURL(`tel:${CALL_NUMBER}`).catch(() => Alert.alert("Error", "Call not supported on this device."));
            }} 
            style={{ padding: 8 }}
          >
           <Ionicons name="call-outline" size={26} color="#6BDD6B" />
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}
