import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  Linking,
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
import { useRouter, useFocusEffect } from "expo-router";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Id } from "../convex/_generated/dataModel";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useTranslation } from "../lib/i18n";

// ─── Config ───────────────────────────────────────────────────────────────────
const CALL_NUMBER = "+917009292066";
const MAX_IMAGES = 3;

interface SelectedImage {
  uri: string;
  base64: string;
  mimeType: string;
}

function getWeatherIcon(code: number): keyof typeof Ionicons.glyphMap {
  if (code === 0 || code === 1) return "sunny-outline";
  if (code === 2 || code === 3) return "partly-sunny-outline";
  if (code >= 45 && code <= 48) return "cloudy-outline";
  if (code >= 51 && code <= 67) return "rainy-outline";
  if (code >= 71 && code <= 86) return "snow-outline";
  if (code >= 95) return "thunderstorm-outline";
  return "cloud-outline";
}

export default function Dashboard() {
  const { t, loaded } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // ── State ──────────────────────────────────────────────────────────────────
  const [userId, setUserId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<Id<"conversations"> | null>(null);
  const [textInput, setTextInput] = useState("");
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [audioData, setAudioData] = useState<{ data: string; mimeType: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [userLang, setUserLang] = useState<string | null>(null);
  const [weather, setWeather] = useState<{
    temperature: number;
    humidity: number;
    description: string;
    weatherCode: number;
  } | null>(null);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;

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

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // ── Convex hooks ───────────────────────────────────────────────────────────
  const startConversation = useMutation(api.conversations.startConversation);
  const appendMessage = useMutation(api.conversations.appendMessage);
  const geminiChat = useAction(api.ai.chat);
  const getWeatherContext = useAction(api.weather.getWeatherContext);
  const getCurrentWeather = useAction(api.weather.getCurrentWeather);

  const summaries = useQuery(
    api.conversations.getConversationSummaries,
    userId ? { userId } : "skip"
  );

  // ── Load userId + location from storage ────────────────────────────────────
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem("userId"),
      AsyncStorage.getItem("userLat"),
      AsyncStorage.getItem("userLng"),
      AsyncStorage.getItem("selectedLanguage"),
    ]).then(async ([id, lat, lng, lang]) => {
      if (id) setUserId(id);
      if (lang) setUserLang(lang);
      
      let finalLat: number | null = lat ? parseFloat(lat) : null;
      let finalLng: number | null = lng ? parseFloat(lng) : null;

      if (finalLat === null || finalLng === null || isNaN(finalLat) || isNaN(finalLng)) {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            finalLat = pos.coords.latitude;
            finalLng = pos.coords.longitude;
            await AsyncStorage.setItem("userLat", String(finalLat));
            await AsyncStorage.setItem("userLng", String(finalLng));
          } else {
            // Default to Delhi if permission denied so it doesn't spin forever
            finalLat = 28.6139;
            finalLng = 77.2090;
          }
        } catch {
          finalLat = 28.6139;
          finalLng = 77.2090;
        }
      }

      setUserLat(finalLat);
      setUserLng(finalLng);
    });
  }, []);


  // ── Load Weather ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (userLat !== null && userLng !== null) {
      getCurrentWeather({ latitude: userLat, longitude: userLng })
        .then((res) => {
          if (res) setWeather(res);
        })
        .catch((err) => console.warn("Failed fetching weather", err));
    }
  }, [userLat, userLng, getCurrentWeather]);

  // ── Reset conversation every time this screen comes into focus ──────────────
  useFocusEffect(
    useCallback(() => {
      setConversationId(null);
      setTextInput("");
      setImages([]);
      setAudioData(null);
      AsyncStorage.removeItem("activeConversationId");
    }, [])
  );

  // ── Start recording ────────────────────────────────────────────────────────
  const startRecording = async () => {
    setConversationId(null);
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      Alert.alert("Permission required", "Microphone permission is needed to record audio.");
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
        Alert.alert("Error", "Audio file was not saved correctly. Please try again.");
        setIsLoading(false);
        return;
      }

      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const mimeType = uri.endsWith('.wav') ? 'audio/wav' : 'audio/mp4';
      const freshAudio = { data: base64, mimeType };

      await sendToAI({ audioOverride: freshAudio });
    } catch (e) {
      console.error('Failed to read audio file:', e);
      Alert.alert('Error', 'Could not process the recorded audio. Please try again.');
      setIsLoading(false);
    }
  };

  // ── Camera / gallery ────────────────────────────────────────────────────────
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
          if (status !== "granted") {
            Alert.alert("Permission required", "Camera permission is needed.");
            return;
          }
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
    const mimeType = asset.mimeType ?? "image/jpeg";
    setImages((prev) => [...prev, { uri: asset.uri, base64: asset.base64!, mimeType }]);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const makeCall = () => {
    const url = `tel:${CALL_NUMBER}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) Linking.openURL(url);
      else Alert.alert("Call not supported", "Your device does not support phone calls.");
    });
  };

  const sendToAI = useCallback(async (opts?: { audioOverride?: { data: string; mimeType: string } }) => {
    const combinedText = textInput.trim();
    const effectiveAudio = opts?.audioOverride ?? audioData;
    const hasImages = images.length > 0;

    if (!combinedText && !effectiveAudio && !hasImages) {
      Alert.alert("Empty input", "Please type a message, record audio, or add an image.");
      return;
    }

    if (!userId) {
      Alert.alert("Not logged in", "Please log in first.");
      return;
    }

    setIsLoading(true);
    try {
      let convId = conversationId;
      if (!convId) {
        const newId = await startConversation({ userId });
        setConversationId(newId as Id<"conversations">);
        convId = newId as Id<"conversations">;
      }

      const audioLabel = effectiveAudio ? "🎙️ Voice note" : undefined;
      const userContent = [combinedText, audioLabel].filter(Boolean).join("\n");

      await appendMessage({
        conversationId: convId,
        message: {
          role: "user",
          content: userContent || "[Image sent]",
          timestamp: Date.now(),
          imageUrls: images.map((i) => i.uri),
          audioTranscript: audioLabel,
        },
      });

      let weatherContext: string | undefined;
      const isNewConversation = !conversationId;
      if (isNewConversation && userId && userLat !== null && userLng !== null) {
        try {
          const wx = await getWeatherContext({ userId, latitude: userLat, longitude: userLng });
          weatherContext = wx.weatherContext ?? undefined;
        } catch (wxErr) {
          console.warn("Weather context fetch failed:", wxErr);
        }
      }

      const result = await geminiChat({
        history: [],
        userMessage: combinedText,
        audio: effectiveAudio ?? undefined,
        images: hasImages ? images.map((i) => ({ data: i.base64, mimeType: i.mimeType })) : undefined,
        weatherContext,
        userLocation: (userLat !== null && userLng !== null) ? { latitude: userLat, longitude: userLng } : undefined,
        language: userLang ?? undefined,
      });

      await appendMessage({
        conversationId: convId,
        message: {
          role: "assistant",
          content: result.response,
          timestamp: Date.now(),
        },
      });

      await AsyncStorage.setItem("activeConversationId", convId);

      setTextInput("");
      setImages([]);
      setAudioData(null);

      router.push({
        pathname: "/conversation",
        params: { conversationId: convId, autoplayText: effectiveAudio ? result.response : undefined },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred.";
      Alert.alert("Error", message);
    } finally {
      setIsLoading(false);
    }
  }, [textInput, audioData, images, userId, userLat, userLng, userLang, conversationId, startConversation, appendMessage, geminiChat, getWeatherContext, router]);

  if (!loaded) return null;
  return (
    <View style={{ flex: 1, backgroundColor: "#06060A" }}>
      {/* Dynamic Background Gradients Approximated */}
      <View style={{ position: 'absolute', top: -100, left: -50, width: 300, height: 300, backgroundColor: 'rgba(102, 126, 234, 0.15)', borderRadius: 150, filter: 'blur(80px)' as any }} />
      <View style={{ position: 'absolute', top: 200, right: -100, width: 250, height: 250, backgroundColor: 'rgba(118, 75, 162, 0.15)', borderRadius: 125, filter: 'blur(80px)' as any }} />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 180,
          gap: 20,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <View style={{ marginBottom: 4 }}>
          <Text style={{ fontSize: 34, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.5 }}>FVoice</Text>
          <Text style={{ fontSize: 16, color: "#8E8E9F", marginTop: 6, fontWeight: '500' }}>{t("dashboard_subtitle")}</Text>
        </View>

        {/* ── Current Weather Widget ── */}
        <View style={{
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          borderRadius: 24,
          padding: 20,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.08)',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          overflow: 'hidden',
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.3,
          shadowRadius: 20,
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#A0A0B0', fontSize: 13, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>{t("current_conditions")}</Text>
            {weather ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                  <Text style={{ color: '#FFF', fontSize: 42, fontWeight: '800', letterSpacing: -1 }}>{weather.temperature}°</Text>
                  <Text style={{ color: '#DDD', fontSize: 16, fontWeight: '600' }}>{weather.description}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <Ionicons name="water" size={16} color="#64D2FF" />
                  <Text style={{ color: '#64D2FF', fontSize: 15, fontWeight: '600' }}>{weather.humidity}{t("rel_humidity")}</Text>
                </View>
              </>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', height: 60, gap: 12 }}>
                <ActivityIndicator color="#667EEA" />
                <Text style={{ color: '#8E8E9F', fontSize: 15 }}>{t("loading_weather")}</Text>
              </View>
            )}
          </View>
          {weather && (
            <View style={{ backgroundColor: 'rgba(102, 126, 234, 0.15)', padding: 18, borderRadius: 28 }}>
              <Ionicons name={getWeatherIcon(weather.weatherCode)} size={48} color="#A798FF" />
            </View>
          )}
        </View>

        {/* ── Recent summaries ── */}
        {summaries && summaries.length > 0 && (
          <View style={{ gap: 12 }}>
            <Text style={{ color: '#A0A0B0', fontSize: 13, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginLeft: 4 }}>{t("recent_chats")}</Text>
            {summaries.slice(0, 2).map((s, i) => (
              <Pressable key={i} style={({ pressed }) => ({
                backgroundColor: pressed ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.01)',
                padding: 16,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.05)',
              })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(118, 75, 162, 0.15)', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="chatbubbles-outline" size={20} color="#B39DDB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#E0E0E0", fontSize: 14, lineHeight: 20, fontWeight: '500' }} numberOfLines={2}>
                      {s.summary}
                    </Text>
                    <Text style={{ color: "#777788", fontSize: 12, marginTop: 4 }}>
                      {new Date(s.conversationDate).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Visual Media Area ── */}
        {(images.length > 0 || audioData || (!audioData && images.length === 0)) && (
          <View style={{ marginTop: 8 }}>
            {images.length === 0 && !audioData ? (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, height: 110, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                   <Ionicons name="camera-outline" size={32} color="#555568" />
                   <Text style={{ color: "#777788", fontSize: 13, fontWeight: '500' }}>{t("add_images")}</Text>
                </View>
                <View style={{ flex: 1, height: 110, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                   <Ionicons name="mic-outline" size={32} color="#555568" />
                   <Text style={{ color: "#777788", fontSize: 13, fontWeight: '500' }}>{t("hold_to_speak")}</Text>
                </View>
              </View>
            ) : null}

            {images.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {images.map((img, i) => (
                  <View key={i} style={{ position: "relative", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }}>
                    <Image
                      source={{ uri: img.uri }}
                      style={{ width: 110, height: 110, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}
                      contentFit="cover"
                    />
                    <Pressable
                      onPress={() => removeImage(i)}
                      style={{ position: "absolute", top: -8, right: -8, width: 26, height: 26, borderRadius: 13, backgroundColor: "#FF5252", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: '#06060A' }}
                    >
                      <Ionicons name="close" size={14} color="#FFF" />
                    </Pressable>
                  </View>
                ))}
                {images.length < MAX_IMAGES && (
                  <Pressable
                    onPress={pickImage}
                    style={{ width: 110, height: 110, borderRadius: 20, borderWidth: 1.5, borderColor: "rgba(102, 126, 234, 0.4)", borderStyle: "dashed", alignItems: "center", justifyContent: "center", backgroundColor: 'rgba(102, 126, 234, 0.05)' }}
                  >
                    <Ionicons name="add" size={36} color="#667EEA" />
                  </Pressable>
                )}
              </ScrollView>
            )}

            {audioData && (
              <View style={{ backgroundColor: 'rgba(102, 234, 126, 0.1)', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(102, 234, 126, 0.2)', flexDirection: "row", alignItems: "center", gap: 12, marginTop: images.length > 0 ? 12 : 0 }}>
                <View style={{ backgroundColor: 'rgba(102, 234, 126, 0.2)', padding: 10, borderRadius: 16 }}>
                  <Ionicons name="mic" size={24} color="#6BDD6B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#6BDD6B", fontSize: 13, fontWeight: "700", textTransform: 'uppercase', letterSpacing: 0.5 }}>{t("voice_note_ready")}</Text>
                  <Text style={{ color: "#A0C0A0", fontSize: 13, marginTop: 2 }}>{t("tap_send")}</Text>
                </View>
                <Pressable onPress={() => setAudioData(null)} style={{ padding: 8 }}>
                  <Ionicons name="close-circle" size={24} color="#E05555" />
                </Pressable>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Floating Input Dock ── */}
      <Animated.View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'rgba(10, 10, 15, 0.85)',
          paddingBottom: insets.bottom + 12,
          paddingTop: 16,
          paddingHorizontal: 20,
          borderTopWidth: 1,
          borderTopColor: 'rgba(255, 255, 255, 0.05)',
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.04)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
            <TextInput
              value={textInput}
              onChangeText={setTextInput}
              placeholder={t("ask_anything")}
              placeholderTextColor="#666677"
              style={{ flex: 1, color: "#FFFFFF", fontSize: 16, fontWeight: '500', padding: 0 }}
              multiline
              maxLength={2000}
            />
            <Pressable onPress={() => sendToAI()} disabled={isLoading} style={{ marginLeft: 10 }}>
              {isLoading ? (
                <ActivityIndicator color="#667EEA" size="small" />
              ) : (
                <Ionicons name="send" size={22} color={textInput.length > 0 || images.length > 0 || audioData ? "#667EEA" : "#44445A"} />
              )}
            </Pressable>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 10 }}>
          <Pressable onPress={pickImage} style={{ alignItems: "center", gap: 6 }}>
            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255, 255, 255, 0.05)', alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="camera" size={24} color="#A798FF" />
            </View>
            <Text style={{ color: '#8E8E9F', fontSize: 11, fontWeight: '600' }}>{t("camera")}</Text>
          </Pressable>

          <Pressable
            onPressIn={startRecording}
            onPressOut={stopRecording}
            style={{ alignItems: "center" }}
          >
            <Animated.View style={{
              transform: [{ scale: pulseAnim }],
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: isRecording ? "#FF5252" : "#667EEA",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: isRecording ? "#FF5252" : "#667EEA",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.4,
              shadowRadius: 15,
              marginTop: -20,
              borderWidth: 4,
              borderColor: '#06060A'
            }}>
              <Ionicons name={isRecording ? "stop" : "mic"} size={32} color="#FFF" />
            </Animated.View>
            <Text style={{ color: isRecording ? '#FF5252' : '#8E8E9F', fontSize: 11, fontWeight: '600', marginTop: 8 }}>
              {isRecording ? t("recording") : t("hold_to_speak")}
            </Text>
          </Pressable>

          <Pressable onPress={makeCall} style={{ alignItems: "center", gap: 6 }}>
            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(102, 234, 126, 0.1)', alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="call" size={24} color="#6BDD6B" />
            </View>
            <Text style={{ color: '#8E8E9F', fontSize: 11, fontWeight: '600' }}>{t("expert_info")}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}