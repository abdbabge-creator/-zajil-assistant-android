import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// Helper: Intelligent Arabic Local NLU Fallback
function parseArabicCommandLocally(cmd: string, permissions: Record<string, boolean> = {}) {
  const text = cmd.toLowerCase().trim();

  // Camera intent
  if (text.includes('كاميرا') || text.includes('كاميره') || text.includes('صور') || text.includes('سيلفي')) {
    if (!permissions.camera) {
      return {
        spokenReply: 'أحتاج إلى إذن الكاميرا أولاً لتشغيلها والتقاط الصور، هل يمكنك منحي الصلاحية؟',
        birdEmotion: 'curious',
        action: { type: 'request_permission', requiresPermission: 'camera' },
      };
    }
    return {
      spokenReply: 'حاضر يا صديقي، فتحت لك الكاميرا لتلتقط أجمل اللحظات!',
      birdEmotion: 'happy',
      action: { type: 'open_app', appId: 'camera', requiresPermission: 'camera' },
    };
  }

  // Calculator intent & math evaluation
  if (
    text.includes('احسب') ||
    text.includes('حاسب') ||
    text.includes('جمع') ||
    text.includes('ضرب') ||
    text.includes('+') ||
    text.includes('×') ||
    text.includes('في') ||
    text.includes('زائد') ||
    text.includes('ناقص')
  ) {
    // Try to extract numbers
    const numbers = text.match(/\d+/g)?.map(Number) || [];
    let expr = '';
    let result = '';

    if (numbers.length >= 2) {
      if (text.includes('ضرب') || text.includes('في') || text.includes('×') || text.includes('*')) {
        const prod = numbers[0] * numbers[1];
        expr = `${numbers[0]} × ${numbers[1]}`;
        result = String(prod);
      } else if (text.includes('قسم') || text.includes('÷') || text.includes('/')) {
        const div = numbers[1] !== 0 ? Math.round((numbers[0] / numbers[1]) * 100) / 100 : 0;
        expr = `${numbers[0]} ÷ ${numbers[1]}`;
        result = String(div);
      } else if (text.includes('طرح') || text.includes('ناقص') || text.includes('-')) {
        const diff = numbers[0] - numbers[1];
        expr = `${numbers[0]} − ${numbers[1]}`;
        result = String(diff);
      } else {
        const sum = numbers[0] + numbers[1];
        expr = `${numbers[0]} + ${numbers[1]}`;
        result = String(sum);
      }
      return {
        spokenReply: `الناتج الحسابي هو ${result}. فتحت لك الآلة الحاسبة لترى النتيجة!`,
        birdEmotion: 'proud',
        action: {
          type: 'calculate',
          appId: 'calculator',
          payload: { calcExpression: expr, calcResult: result },
        },
      };
    }

    return {
      spokenReply: 'فتحت لك الآلة الحاسبة، يمكنك كتابة أي عملية رياضية الآن.',
      birdEmotion: 'happy',
      action: { type: 'open_app', appId: 'calculator' },
    };
  }

  // Weather intent
  if (text.includes('طقس') || text.includes('حرارة') || text.includes('جو') || text.includes('مطر')) {
    let city = 'الرياض';
    const arabicCities = ['الرياض', 'دبي', 'القاهرة', 'مكة المكرمة', 'جدة', 'الكويت', 'الدوحة', 'عمان', 'بيروت', 'الرباط'];
    for (const c of arabicCities) {
      if (text.includes(c)) {
        city = c;
        break;
      }
    }
    return {
      spokenReply: `الطقس في ${city} اليوم معتدل وممتع ودرجة الحرارة ثلاثون درجة مئوية.`,
      birdEmotion: 'happy',
      action: { type: 'weather_query', appId: 'weather', payload: { city } },
    };
  }

  // Music intent
  if (text.includes('موسيق') || text.includes('اغني') || text.includes('أغني') || text.includes('عزف') || text.includes('لحن') || text.includes('شغل')) {
    return {
      spokenReply: 'يسعدني ذلك! استمع إلى هذه الألحان العذبة واستمتع بيومك.',
      birdEmotion: 'cheering',
      action: { type: 'play_music', appId: 'music' },
    };
  }

  // Timer / Clock intent
  if (text.includes('مؤقت') || text.includes('منبه') || text.includes('وقت') || text.includes('دقيق') || text.includes('ساع')) {
    const minsMatch = text.match(/(\d+)\s*دقيق/);
    const mins = minsMatch ? parseInt(minsMatch[1], 10) : 1;
    const seconds = mins * 60;
    return {
      spokenReply: `تم ضبط المؤقت لمدة ${mins} ${mins === 1 ? 'دقيقة' : 'دقائق'} وسأنبهك فور انتهائه!`,
      birdEmotion: 'happy',
      action: { type: 'set_timer', appId: 'clock', payload: { durationSeconds: seconds } },
    };
  }

  // Notes intent
  if (text.includes('ملاحظ') || text.includes('سجل') || text.includes('اكتب') || text.includes('دون') || text.includes('فكرة')) {
    let noteText = text.replace(/^(يا زاجل|زاجل)?\s*(خذ ملاحظة|اكتب ملاحظة|سجل فكرة|دون|ملاحظة)?\s*:?/i, '').trim();
    if (!noteText) noteText = 'فكرة جديدة ومهام قادمة';
    return {
      spokenReply: 'تم تدوين الملاحظة وحفظها بنجاح في تطبيق الملاحظات!',
      birdEmotion: 'proud',
      action: { type: 'add_note', appId: 'notes', payload: { noteText } },
    };
  }

  // Phone / Call intent
  if (text.includes('اتصل') || text.includes('مكالم') || text.includes('هاتف') || text.includes('رن')) {
    let contact = 'ماما ❤️';
    if (text.includes('بابا') || text.includes('أبي')) contact = 'بابا 🌟';
    else if (text.includes('أحمد')) contact = 'أحمد';
    else if (text.includes('فاطم')) contact = 'فاطمة';
    else if (text.includes('سارة')) contact = 'سارة';
    return {
      spokenReply: `جاري الاتصال بـ ${contact} الآن عبر تطبيق الهاتف.`,
      birdEmotion: 'happy',
      action: { type: 'make_call', appId: 'phone', payload: { contactName: contact } },
    };
  }

  // Messages intent
  if (text.includes('رسال') || text.includes('مسج') || text.includes('واتساب') || text.includes('ارسل') || text.includes('أرسل')) {
    return {
      spokenReply: 'فتحت لك تطبيق الرسائل، يمكنك إرسال ما ترغب به الآن.',
      birdEmotion: 'happy',
      action: { type: 'open_app', appId: 'messages' },
    };
  }

  // Flashlight intent
  if (text.includes('مصباح') || text.includes('فلاش') || text.includes('ضوء') || text.includes('انر') || text.includes('أطفئ النور')) {
    return {
      spokenReply: 'تم تبديل إضاءة المصباح بنجاح!',
      birdEmotion: 'playful',
      action: { type: 'toggle_flashlight' },
    };
  }

  // Settings / Permissions intent
  if (text.includes('إعداد') || text.includes('اعداد') || text.includes('صلاحي') || text.includes('اذن') || text.includes('إذن')) {
    return {
      spokenReply: 'هذه صفحة الإعدادات وإدارة الصلاحيات لتخصيص كل تفاصيل هاتفي!',
      birdEmotion: 'happy',
      action: { type: 'open_app', appId: 'settings' },
    };
  }

  // Character Customizer intent
  if (
    text.includes('شخصي') ||
    text.includes('تخصيص') ||
    text.includes('غير الصوت') ||
    text.includes('صوت ذكر') ||
    text.includes('صوت انثى') ||
    text.includes('صوت أنثى') ||
    text.includes('روبوت') ||
    text.includes('هديل') ||
    text.includes('بولت') ||
    text.includes('نور')
  ) {
    return {
      spokenReply: 'فتحت لك صفحة تخصيص الشخصيات، يمكنك الاختيار بين أربع شخصيات وصوت ذكر أو أنثى!',
      birdEmotion: 'cheering',
      action: { type: 'open_app', appId: 'customizer' },
    };
  }

  // Android Service & Accessibility intent
  if (
    text.includes('اندرويد') ||
    text.includes('أندرويد') ||
    text.includes('عائم') ||
    text.includes('امكانية الوصول') ||
    text.includes('إمكانية الوصول') ||
    text.includes('اوفرلاي') ||
    text.includes('خدمات')
  ) {
    return {
      spokenReply: 'فتحت لك لوحة خدمات أندرويد وإمكانية الوصول مع الكود البرمجي الأصلي!',
      birdEmotion: 'cheering',
      action: { type: 'open_app', appId: 'android_service' },
    };
  }

  // Gallery intent
  if (text.includes('معرض') || text.includes('صور') || text.includes('البوم')) {
    return {
      spokenReply: 'تفضل، هذا معرض صورك وذكرياتك الجميلة!',
      birdEmotion: 'happy',
      action: { type: 'open_app', appId: 'gallery' },
    };
  }

  // Joke / riddle
  if (text.includes('نكت') || text.includes('طرف') || text.includes('اضحك') || text.includes('لغز')) {
    const jokes = [
      'سأل عصفور صديقه: لماذا لا تشتري هاتفاً ذكياً؟ قال له: لأني أحب التغريد الطبيعي من دون شاحن!',
      'لماذا يطير الحمام مسروراً في الصباح؟ لأنه استيقظ ووجد نسائم هواء نقية من دون زحام سيارات!',
    ];
    return {
      spokenReply: jokes[Math.floor(Math.random() * jokes.length)],
      birdEmotion: 'playful',
      action: { type: 'none' },
    };
  }

  // Friendly greetings & questions
  if (text.includes('مرحبا') || text.includes('أهلا') || text.includes('اهلا') || text.includes('سلام') || text.includes('صباح')) {
    return {
      spokenReply: 'أهلاً وسهلاً بك يا صديقي الغالي! أنا زاجل في خدمتك، ما الذي تريده اليوم؟',
      birdEmotion: 'cheering',
      action: { type: 'none' },
    };
  }

  if (text.includes('كيف حالك') || text.includes('شخبارك') || text.includes('عساك بخير')) {
    return {
      spokenReply: 'أنا بأفضل حال والرياح في جناحيّ عليلة! كيف يمكنني مساعدتك الآن؟',
      birdEmotion: 'happy',
      action: { type: 'none' },
    };
  }

  if (text.includes('من أنت') || text.includes('اسمك') || text.includes('عرف بنفسك')) {
    return {
      spokenReply: 'أنا «زاجل»، طائرك الذكي ومساعدك الشخصي على هاتفك. أستمع لأوامرك وأنطق بصوتي لتنفيذ مهامك!',
      birdEmotion: 'proud',
      action: { type: 'none' },
    };
  }

  // Default pleasant Arabic response
  return {
    spokenReply: `أنا معك وأسمعك بكل سرور! يمكنك أن تطلب مني فتح الكاميرا، أو حساب عملية، أو معرفة الطقس وتشغيل الموسيقى.`,
    birdEmotion: 'happy',
    action: { type: 'none' },
  };
}

// API endpoint: Assistant NLU and Action Planner
app.post('/api/assistant/process', async (req, res) => {
  const { command, currentContext, permissions } = req.body;

  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Command text is required' });
  }

  // If Gemini API Key is configured, attempt intelligent model generation
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const systemInstruction = `
أنت «زاجل»، طائر كرتوني ذكي ولطيف جداً ورفيق شخصي على هاتف المستخدم الذكي.
- تتحدث باللغة العربية الفصحى الودودة والواضحة، مع لمسة مرحة ومحبة تشبه شخصيات الكرتون اللطيفة.
- هام جداً: كلامك سيُنطق صوتياً فقط للمستخدم ولا يظهر كنص على الشاشة أبداً. لذلك اجعل نطقك طبيعياً وسلساً ومختصراً (جملة أو جملتان مفيدتان دون حشو).
- تفهم تماماً نوايا المستخدم وأوامره للتحكم في تطبيقات الهاتف:
  1. 'camera': فتح الكاميرا (يتطلب إذن الكاميرا 'camera').
  2. 'calculator': فتح الآلة الحاسبة وحساب أي عملية رياضية.
  3. 'weather': معرفة أحوال الطقس (في مدينته أو مدينة يحددها مثل الرياض، القاهرة، دبي).
  4. 'music': مشغل الموسيقى.
  5. 'clock': الساعة والمنبه والمؤقت.
  6. 'phone': تطبيق الهاتف والاتصال.
  7. 'messages': تطبيق المراسلة.
  8. 'notes': تطبيق الملاحظات.
  9. 'gallery': استعراض ألبوم الصور.
  10. 'settings': إعدادات الهاتف والصلاحيات.
  11. 'flashlight': تشغيل أو إطفاء فلاش الهاتف.
  12. محادثة ذكية، نكت، ألغاز، معلومات عامة.

حالة الصلاحيات الحالية لدى المستخدم:
${JSON.stringify(permissions || {})}

إذا طلب المستخدم تطبيقاً يتطلب إذناً كالكاميرا وهو غير ممنوح ('camera' !== true):
اجعل spokenReply: إخبار المستخدم بلطف بأنك بحاجة إلى إذن الكاميرا أولاً لتتمكن من فتحها، واطلب منه الموافقة.
وضمّن في الـ action: type: "request_permission", requiresPermission: "camera".
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `أمر المستخدم: "${command}"\nسياق الشاشة الحالي: ${JSON.stringify(currentContext || {})}`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              spokenReply: {
                type: Type.STRING,
                description: 'الرد الصوتي المباشر باللغة العربية الفصيحة الذي سينطقه الطائر للمستخدم بدون تشويش على الشاشة.',
              },
              birdEmotion: {
                type: Type.STRING,
                description: 'حالة الطائر التعبيرية: happy, cheering, thinking, curious, surprised, sleepy, proud, playful',
              },
              action: {
                type: Type.OBJECT,
                properties: {
                  type: {
                    type: Type.STRING,
                    description: "نوع الإجراء: 'open_app', 'set_timer', 'play_music', 'pause_music', 'weather_query', 'calculate', 'add_note', 'make_call', 'send_message', 'toggle_flashlight', 'request_permission', 'close_app', 'none'",
                  },
                  appId: {
                    type: Type.STRING,
                    description: "معرف التطبيق: 'camera', 'calculator', 'weather', 'clock', 'music', 'notes', 'phone', 'messages', 'settings', 'maps', 'gallery'",
                  },
                  payload: {
                    type: Type.OBJECT,
                    properties: {
                      query: { type: Type.STRING },
                      city: { type: Type.STRING },
                      durationSeconds: { type: Type.NUMBER },
                      noteText: { type: Type.STRING },
                      calcExpression: { type: Type.STRING },
                      calcResult: { type: Type.STRING },
                      contactName: { type: Type.STRING },
                      phoneNumber: { type: Type.STRING },
                      messageText: { type: Type.STRING },
                      permissionName: { type: Type.STRING },
                    },
                  },
                  requiresPermission: {
                    type: Type.STRING,
                    description: "الإذن المطلوب إن وجد: 'camera', 'microphone', 'geolocation', 'notifications'",
                  },
                },
              },
            },
            required: ['spokenReply', 'birdEmotion'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      if (parsed.spokenReply) {
        return res.json(parsed);
      }
    } catch (error: any) {
      console.warn('Gemini NLU error, using graceful Arabic fallback:', error?.message || error);
    }
  }

  // Graceful rule-based Arabic understanding
  const fallbackResult = parseArabicCommandLocally(command, permissions);
  return res.json(fallbackResult);
});

// API endpoint: Gemini Arabic TTS
app.post('/api/assistant/tts', async (req, res) => {
  try {
    const { text, gender = 'male' } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for TTS' });
    }

    if (process.env.GEMINI_API_KEY) {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const selectedVoiceName = gender === 'female' ? 'Kore' : 'Puck';
      const voiceStyle =
        gender === 'female'
          ? 'Clear, cheerful, warm female Arabic voice'
          : 'Clear, lively, friendly male Arabic voice';

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text,
                speechMetadata: {
                  style: voiceStyle,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoiceName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        return res.json({
          audioBase64: base64Audio,
          format: 'audio/wav',
        });
      }
    }

    return res.json({ fallback: true, message: 'Use browser SpeechSynthesis' });
  } catch (err: any) {
    return res.json({
      fallback: true,
      reason: err?.message || 'fallback_to_speech_synthesis',
    });
  }
});

// API endpoint: Download full Android Project ZIP directly to Android phone
app.get('/api/export/download-project-zip', async (_req, res) => {
  try {
    const { exec } = await import('child_process');
    const zipCommand = `python3 -c '
import os, zipfile
zip_path = "/tmp/zajil_android_project.zip"
if os.path.exists(zip_path):
    os.remove(zip_path)
exclude_dirs = {"node_modules", ".git", ".cache"}
base_dir = "/app/applet"
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(base_dir):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for f in files:
            full_path = os.path.join(root, f)
            arc_name = os.path.relpath(full_path, base_dir)
            zf.write(full_path, arc_name)
'`;

    exec(zipCommand, (err) => {
      if (err) {
        console.error('ZIP generation error:', err);
        return res.status(500).json({ error: 'Failed to generate ZIP archive' });
      }

      res.download('/tmp/zajil_android_project.zip', 'zajil-assistant-android.zip', (downloadErr) => {
        if (downloadErr) {
          console.error('Download stream error:', downloadErr);
        }
      });
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Internal server error' });
  }
});

// Setup Vite in Dev or serve static in Prod
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();
