import { Text, View, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from '@expo/vector-icons';
import { useWindowDimensions } from "react-native";

const INDIAN_LANGUAGES = [
  { id: "en", native: "English", english: "English" },
  { id: "hi", native: "हिन्दी", english: "Hindi" },
  { id: "mr", native: "मराठी", english: "Marathi" },
  { id: "bn", native: "বাংলা", english: "Bengali" },
  { id: "te", native: "తెలుగు", english: "Telugu" },
  { id: "ta", native: "தமிழ்", english: "Tamil" },
  { id: "gu", native: "ગુજરાતી", english: "Gujarati" },
  { id: "kn", native: "ಕನ್ನಡ", english: "Kannada" },
  { id: "ml", native: "മലയാളം", english: "Malayalam" },
  { id: "or", native: "ଓଡ଼ିଆ", english: "Odia" },
  { id: "pa", native: "ਪੰਜਾਬੀ", english: "Punjabi" },
  { id: "ur", native: "اردو", english: "Urdu" },
  { id: "as", native: "অসমীয়া", english: "Assamese" },
  { id: "mai", native: "मैथिली", english: "Maithili" },
  { id: "sat", native: "ᱥᱟᱱᱛᱟᱲᱤ", english: "Santali" },
  { id: "ks", native: "کٲشُر", english: "Kashmiri" },
  { id: "ne", native: "नेपाली", english: "Nepali" },
  { id: "sd", native: "سنڌي", english: "Sindhi" },
  { id: "kok", native: "कोंकणी", english: "Konkani" },
  { id: "dgo", native: "डोगरी", english: "Dogri" },
  { id: "brx", native: "बड़ो", english: "Bodo" },
  { id: "mni", native: "ꯃꯤꯇꯩꯂꯣꯟ", english: "Manipuri" },
  { id: "sa", native: "संस्कृतम्", english: "Sanskrit" },
];

export default function App() {
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [checking, setChecking] = useState(true); // true while we check AsyncStorage
  const router = useRouter();
  const { width } = useWindowDimensions();
  
  const padding = 24;
  const gap = 16;
  const cardWidth = (width - padding * 2 - gap) / 2;

  // ── On mount: skip straight to dashboard if already logged in ──────────────
  useEffect(() => {
    AsyncStorage.getItem("userId").then((id) => {
      if (id) {
        // User is logged in — go directly to dashboard
        router.replace("/dashboard");
      } else {
        // Not logged in — show the language picker
        setChecking(false);
      }
    });
  }, []);

  const handleNext = async () => {
    if (selectedLanguage) {
      await AsyncStorage.setItem("selectedLanguage", selectedLanguage);
      router.push("/login");
    }
  };

  // Show a blank loader while we check AsyncStorage (avoids flickering)
  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F9FAFB", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }


  return (
    <View className="flex-1 bg-[#F9FAFB]">
      <ScrollView 
        contentInsetAdjustmentBehavior="automatic" 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: padding, paddingTop: 60, paddingBottom: 140 }}
      >
        <View className="mb-8">
          <View 
            className="w-16 h-16 rounded-3xl bg-[#ECFDF5] items-center justify-center mb-6" 
            style={{ boxShadow: "0 4px 14px 0 rgba(16, 185, 129, 0.2)" }}
          >
            <Ionicons name="language" size={32} color="#10B981" />
          </View>
          <Text className="text-4xl font-extrabold text-gray-900 tracking-tight mb-2">
            Choose{'\n'}Language
          </Text>
          <Text className="text-lg text-gray-500 font-medium">
            Select your preferred language to customize your farming experience.
          </Text>
        </View>

        <View className="flex-row flex-wrap" style={{ gap: gap }}>
          {INDIAN_LANGUAGES.map((lang) => {
             const isSelected = selectedLanguage === lang.id;
             return (
               <Pressable
                 key={lang.id}
                 onPress={() => setSelectedLanguage(lang.id)}
                 style={{ 
                   width: cardWidth,
                   boxShadow: isSelected 
                     ? "0 8px 16px -4px rgba(16, 185, 129, 0.2)" 
                     : "0 2px 4px -2px rgba(0, 0, 0, 0.05)",
                 }}
                 className={`p-5 rounded-3xl border-2 active:opacity-75 transition-all duration-300 ${
                   isSelected 
                     ? "bg-[#F0FDF4] border-[#10B981]" 
                     : "bg-white border-transparent"
                 }`}
               >
                 <View className="flex-row justify-between items-start mb-6">
                   <Text 
                     className={`text-[28px] font-bold ${isSelected ? 'text-[#047857]' : 'text-gray-800'}`}
                     style={{ lineHeight: 36 }}
                   >
                     {lang.native}
                   </Text>
                   {isSelected && (
                     <View className="bg-[#10B981] rounded-full p-1 ml-2">
                       <Ionicons name="checkmark-sharp" size={12} color="white" />
                     </View>
                   )}
                 </View>
                 <Text className={`text-[15px] ${isSelected ? 'text-[#10B981] font-bold' : 'text-gray-400 font-medium'}`}>
                   {lang.english}
                 </Text>
               </Pressable>
             );
          })}
        </View>
      </ScrollView>

      {/* Fixed bottom footer with Next Button */}
      <View 
        className="absolute bottom-0 w-full pt-4 bg-[#F9FAFB]/95 border-t border-gray-100" 
        style={{ paddingBottom: 48, paddingHorizontal: padding }}
      >
        <Pressable
          onPress={handleNext}
          disabled={!selectedLanguage}
          className={`w-full flex-row items-center justify-center py-[22px] rounded-2xl active:opacity-80 transition-all ${
            selectedLanguage ? "bg-[#10B981]" : "bg-gray-200"
          }`}
          style={{
            boxShadow: selectedLanguage ? "0 8px 20px -4px rgba(16, 185, 129, 0.4)" : "none",
          }}
        >
          <Text className={`text-[20px] font-bold ${selectedLanguage ? "text-white" : "text-gray-400"}`}>
            Continue
          </Text>
          <Ionicons 
            name="arrow-forward" 
            size={24} 
            color={selectedLanguage ? "white" : "#9CA3AF"} 
            style={{ position: 'absolute', right: 24 }}
          />
        </Pressable>
      </View>
    </View>
  );
}