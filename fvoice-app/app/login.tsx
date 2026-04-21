import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import * as Location from "expo-location";
import { useTranslation } from "../lib/i18n";

export default function LoginScreen() {
  const { t, loaded } = useTranslation();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const phoneInputRef = useRef<TextInput | null>(null);

  const loginDirectly = useMutation(api.users.loginDirectly);
  const updateProfile = useMutation(api.users.updateProfileAfterLogin);

  const handleLogin = async () => {
    const cleanPhone = phone.trim().replace(/\s/g, "");
    if (cleanPhone.length < 10) {
      Alert.alert("Invalid Number", "Please enter a valid 10-digit mobile number.");
      return;
    }

    const formattedPhone = cleanPhone.startsWith("+")
      ? cleanPhone
      : `+91${cleanPhone.replace(/^0/, "")}`;

    setLoading(true);
    try {
      const userId = await loginDirectly({ mobileNumber: formattedPhone });
      await AsyncStorage.setItem("userId", userId);
      await AsyncStorage.setItem("userPhone", formattedPhone);

      // ── Save language + location in background ────────────────────────────
      const language = await AsyncStorage.getItem("selectedLanguage");

      // Request location permission (non-blocking — won't block login)
      let latitude: number | undefined;
      let longitude: number | undefined;
      let locationName: string | undefined;

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;

          // Reverse-geocode to get a readable city/district name
          const [place] = await Location.reverseGeocodeAsync({
            latitude,
            longitude,
          });
          if (place) {
            locationName = [place.district, place.city, place.region]
              .filter(Boolean)
              .join(", ");
          }

          // Persist to AsyncStorage so dashboard can use without extra query
          await AsyncStorage.setItem("userLat", String(latitude));
          await AsyncStorage.setItem("userLng", String(longitude));
        }
      } catch (locErr) {
        console.warn("Location fetch failed (non-fatal):", locErr);
      }

      // Save language + location (fire & forget — don't block navigation)
      updateProfile({
        mobileNumber: formattedPhone,
        language: language ?? undefined,
        latitude,
        longitude,
        locationName,
      }).catch((e) => console.warn("Profile update failed:", e));

      router.replace("/dashboard");
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isValid = phone.trim().replace(/\s/g, "").length >= 10;

  if (!loaded) return null;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#F9FAFB]"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 px-6" style={{ paddingTop: 80, paddingBottom: 40 }}>
          {/* Icon */}
          <View
            className="w-16 h-16 rounded-3xl bg-[#ECFDF5] items-center justify-center mb-6"
            style={{ boxShadow: "0 4px 14px 0 rgba(16, 185, 129, 0.2)" }}
          >
            <Ionicons name="call" size={32} color="#10B981" />
          </View>

          {/* Heading */}
          <Text className="text-4xl font-extrabold text-gray-900 tracking-tight mb-2">
            {t("login_welcome")}
          </Text>
          <Text className="text-base text-gray-500 font-medium mb-10">
            {t("login_desc")}
          </Text>

          {/* Phone input */}
          <Text className="text-sm font-semibold text-gray-600 mb-2 ml-1">
            {t("login_mobile")}
          </Text>
          <View
            className="flex-row items-center bg-white border-2 border-gray-200 rounded-2xl px-4"
            style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
          >
            {/* Country code badge */}
            <View className="flex-row items-center mr-3 pr-3 border-r border-gray-200 py-4">
              <Text className="text-xl mr-1">🇮🇳</Text>
              <Text className="text-gray-700 font-semibold text-base">+91</Text>
            </View>
            <TextInput
              ref={phoneInputRef}
              className="flex-1 text-gray-900 text-lg font-semibold py-4"
              placeholder="98765 43210"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              maxLength={10}
              value={phone}
              onChangeText={setPhone}
              onSubmitEditing={handleLogin}
              returnKeyType="done"
              autoFocus
            />
            {isValid && (
              <Ionicons name="checkmark-circle" size={22} color="#10B981" />
            )}
          </View>

          <Text className="text-xs text-gray-400 mt-3 ml-1">
            {t("login_instant")}
          </Text>

          {/* Login button */}
          <Pressable
            onPress={handleLogin}
            disabled={loading || !isValid}
            className={`mt-8 flex-row items-center justify-center py-5 rounded-2xl active:opacity-80 ${
              isValid ? "bg-[#10B981]" : "bg-gray-200"
            }`}
            style={{
              boxShadow: isValid ? "0 8px 20px -4px rgba(16, 185, 129, 0.4)" : "none",
            }}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Text
                  className={`text-lg font-bold mr-2 ${
                    isValid ? "text-white" : "text-gray-400"
                  }`}
                >
                  {t("continue")}
                </Text>
                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color={isValid ? "white" : "#9CA3AF"}
                />
              </>
            )}
          </Pressable>

          {/* Terms */}
          <Text className="text-xs text-center text-gray-400 mt-auto pt-12">
            {t("login_terms")}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
