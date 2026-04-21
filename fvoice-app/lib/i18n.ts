import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Dictionary = Record<string, string>;
type Translations = Record<string, Dictionary>;

const translations: Translations = {
  en: {
    login_welcome: "Welcome to FVoice 👋",
    login_desc: "Enter your mobile number to get started.",
    login_mobile: "Mobile Number",
    login_instant: "You'll be logged in instantly.",
    continue: "Continue",
    login_terms: "By continuing, you agree to our Terms of Service & Privacy Policy.",
    dashboard_subtitle: "Your intelligent farming companion.",
    current_conditions: "Current Conditions",
    rel_humidity: "% Rel. Humidity",
    loading_weather: "Loading local weather...",
    recent_chats: "Recent Chats",
    add_images: "Add Images",
    hold_to_speak: "Hold to Speak",
    voice_note_ready: "Voice Note Ready",
    tap_send: "Tap send to process",
    ask_anything: "Ask me anything...",
    camera: "Camera",
    recording: "Recording...",
    expert_info: "Expert Info",
    conversation_start: "Start Conversation",
    conversation_desc: "Ask about your crops, weather, or agriculture issues",
    back: "Back",
    generating_response: "Generating response...",
    message_fvoice: "Message FVoice...",
    play_sound: "PLAY",
  },
  hi: {
    login_welcome: "FVoice में आपका स्वागत है 👋",
    login_desc: "शुरू करने के लिए अपना मोबाइल नंबर दर्ज करें।",
    login_mobile: "मोबाइल नंबर",
    login_instant: "आप तुरंत लॉग इन हो जाएंगे।",
    continue: "आगे बढ़ें",
    login_terms: "जारी रखने पर, आप हमारी सेवा की शर्तों और गोपनीयता नीति से सहमत होते हैं।",
    dashboard_subtitle: "आपका बुद्धिमान खेती साथी।",
    current_conditions: "वर्तमान स्थिति",
    rel_humidity: "% सापेक्ष आर्द्रता",
    loading_weather: "स्थानीय मौसम लोड हो रहा है...",
    recent_chats: "हाल की बातचीत",
    add_images: "तस्वीरें जोड़ें",
    hold_to_speak: "बोलने के लिए दबाए रखें",
    voice_note_ready: "वॉयस नोट तैयार",
    tap_send: "प्रोसेस करने के लिए सेंड पर टैप करें",
    ask_anything: "मुझसे कुछ भी पूछें...",
    camera: "कैमरा",
    recording: "रिकॉर्ड हो रहा है...",
    expert_info: "विशेषज्ञ की जानकारी",
    conversation_start: "बातचीत शुरू करें",
    conversation_desc: "अपनी फसलों, मौसम, या कृषि समस्याओं के बारे में पूछें",
    back: "पीछे",
    generating_response: "जवाब तैयार किया जा रहा है...",
    message_fvoice: "FVoice को संदेश भेजें...",
    play_sound: "सुने (PLAY)",
  },
  ne: {
    login_welcome: "FVoice मा स्वागत छ 👋",
    login_desc: "सुरु गर्नको लागि आफ्नो मोबाइल नम्बर प्रविष्ट गर्नुहोस्।",
    login_mobile: "मोबाइल नम्बर",
    login_instant: "तपाईं तुरुन्तै लग-इन हुनुहुनेछ।",
    continue: "अगाडि बढ्नुहोस्",
    login_terms: "अगाडि बढेर, तपाईं हाम्रो सेवा सर्त र गोपनीयता नीतिसँग सहमत हुनुहुन्छ।",
    dashboard_subtitle: "तपाईंको बौद्धिक कृषि साथी।",
    current_conditions: "वर्तमान अवस्था",
    rel_humidity: "% सापेक्षिक आर्द्रता",
    loading_weather: "स्थानीय मौसम लोड हुँदैछ...",
    recent_chats: "भर्खरका च्याटहरू",
    add_images: "तस्बिरहरू थप्नुहोस्",
    hold_to_speak: "बोल्नको लागि होल्ड गर्नुहोस्",
    voice_note_ready: "भ्वाइस नोट तयार छ",
    tap_send: "प्रक्रिया गर्न सेन्ड ट्याप गर्नुहोस्",
    ask_anything: "मलाई जे पनि सोध्नुहोस्...",
    camera: "क्यामेरा",
    recording: "रेकर्ड हुँदैछ...",
    expert_info: "विशेषज्ञ जानकारी",
    conversation_start: "कुराकानी सुरु गर्नुहोस्",
    conversation_desc: "तपाईंको बाली, मौसम, वा कृषि समस्याहरूको बारेमा सोध्नुहोस्",
    back: "पछाडि",
    generating_response: "जवाफ तयार गरिँदैछ...",
    message_fvoice: "FVoice लाई सन्देश पठाउनुहोस्...",
    play_sound: "सुन्नुहोस्",
  },
  pa: {
    login_welcome: "FVoice ਵਿੱਚ ਤੁਹਾਡਾ ਸੁਆਗਤ ਹੈ 👋",
    login_desc: "ਸ਼ੁਰੂ ਕਰਨ ਲਈ ਆਪਣਾ ਮੋਬਾਈਲ ਨੰਬਰ ਦਰਜ ਕਰੋ।",
    login_mobile: "ਮੋਬਾਈਲ ਨੰਬਰ",
    login_instant: "ਤੁਸੀਂ ਤੁਰੰਤ ਲਾਗਇਨ ਹੋ ਜਾਵੋਗੇ।",
    continue: "ਜਾਰੀ ਰੱਖੋ",
    login_terms: "ਜਾਰੀ ਰੱਖ ਕੇ, ਤੁਸੀਂ ਸਾਡੀ ਸੇਵਾ ਦੀਆਂ ਸ਼ਰਤਾਂ ਅਤੇ ਗੋਪਨੀਯਤਾ ਨੀਤੀ ਨਾਲ ਸਹਿਮਤ ਹੁੰਦੇ ਹੋ।",
    dashboard_subtitle: "ਤੁਹਾਡਾ ਬੁੱਧੀਮਾਨ ਖੇਤੀ ਸਾਥੀ।",
    current_conditions: "ਮੌਜੂਦਾ ਸਥਿਤੀ",
    rel_humidity: "% ਸਾਪੇਖਿਕ ਨਮੀ",
    loading_weather: "ਸਥਾਨਕ ਮੌਸਮ ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ...",
    recent_chats: "ਹਾਲ ਦੀਆਂ ਗੱਲਾਂ",
    add_images: "ਤਸਵੀਰਾਂ ਜੋੜੋ",
    hold_to_speak: "ਬੋਲਣ ਲਈ ਦਬਾ ਕੇ ਰੱਖੋ",
    voice_note_ready: "ਵੌਇਸ ਨੋਟ ਤਿਆਰ",
    tap_send: "ਪ੍ਰਕਿਰਿਆ ਕਰਨ ਲਈ ਭੇਜੋ 'ਤੇ ਟੈਪ ਕਰੋ",
    ask_anything: "ਮੈਨੂੰ ਕੁਝ ਵੀ ਪੁੱਛੋ...",
    camera: "ਕੈਮਰਾ",
    recording: "ਰਿਕਾਰਡ ਹੋ ਰਿਹਾ ਹੈ...",
    expert_info: "ਮਾਹਰ ਜਾਣਕਾਰੀ",
    conversation_start: "ਗੱਲਬਾਤ ਸ਼ੁਰੂ ਕਰੋ",
    conversation_desc: "ਆਪਣੀਆਂ ਫਸਲਾਂ, ਮੌਸਮ, ਜਾਂ ਖੇਤੀਬਾੜੀ ਦੀਆਂ ਸਮੱਸਿਆਵਾਂ ਬਾਰੇ ਪੁੱਛੋ",
    back: "ਪਿੱਛੇ",
    generating_response: "ਜਵਾਬ ਤਿਆਰ ਕੀਤਾ ਜਾ ਰਿਹਾ ਹੈ...",
    message_fvoice: "FVoice ਨੂੰ ਸੁਨੇਹਾ ਭੇਜੋ...",
    play_sound: "ਸੁਣੋ",
  },
  mr: {
    login_welcome: "FVoice मध्ये आपले स्वागत आहे 👋",
    login_desc: "सुरू करण्यासाठी आपला मोबाईल नंबर प्रविष्ट करा.",
    login_mobile: "मोबाईल नंबर",
    login_instant: "आपण त्वरित लॉग इन व्हाल.",
    continue: "पुढे जा",
    login_terms: "पुढे जाऊन, आपण आमच्या सेवा अटी आणि गोपनीयता धोरणाशी सहमत होता.",
    dashboard_subtitle: "तुमचा बुद्धिमान शेती सोबती.",
    current_conditions: "सध्याची परिस्थिती",
    rel_humidity: "% सापेक्ष आर्द्रता",
    loading_weather: "स्थानिक हवामान लोड होत आहे...",
    recent_chats: "अलीकडील गप्पा",
    add_images: "चित्रे जोडा",
    hold_to_speak: "बोलण्यासाठी धरून ठेवा",
    voice_note_ready: "व्हॉइस नोट तयार",
    tap_send: "प्रक्रिया करण्यासाठी पाठवा टॅप करा",
    ask_anything: "मला काहीही विचारा...",
    camera: "कॅमेरा",
    recording: "रेकॉर्डिंग सुरू आहे...",
    expert_info: "तज्ञांची माहिती",
    conversation_start: "संभाषण सुरू करा",
    conversation_desc: "तुमची पिके, हवामान किंवा शेतीच्या समस्यांबद्दल विचारा",
    back: "मागे",
    generating_response: "प्रतिसाद तयार करत आहे...",
    message_fvoice: "FVoice ला संदेश पाठवा...",
    play_sound: "ऐका",
  }
};

export function getTTSLang(lang: string) {
  switch(lang) {
    case 'hi': return 'hi-IN';
    case 'mr': return 'mr-IN';
    case 'pa': return 'pa-IN';
    case 'ne': return 'ne-NP';
    default: return 'en-IN';
  }
}

export function useTranslation() {
  const [lang, setLang] = useState<string>("en");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("selectedLanguage").then((val) => {
      if (val && translations[val]) {
        setLang(val);
      } else if (val) {
        // Fallback or unknown language (you can add auto-translation here in future)
        // default to English if dict misses it
        setLang(translations[val] ? val : "en");
      }
      setLoaded(true);
    });
  }, []);

  const t = (key: string): string => {
    const dict = translations[lang] || translations["en"];
    return dict[key] || translations["en"][key] || key;
  };

  return { t, lang, loaded };
}
