/**
 * Multilingual Support Phase 3 — approved translations of the Ageez Grand
 * Hotel demo tenant's `RoomType`/`AiKnowledgeDocument` content, into the
 * platform's four non-English locales (`am`/`zh`/`es`/`ar`). English
 * (`src/config/defaults/seed/ageez-grand-hotel.ts`'s `roomTypeFixtures`/
 * `aiKnowledgeFixtures`) remains the sole canonical source — every
 * translation here is a faithful representation of that exact source
 * content, never a new fact, embellishment, or omission. See
 * `docs/MULTILINGUAL.md`'s Phase 3 section and
 * `docs/TRANSLATION_AUDIT.md` for the full source-to-translation mapping
 * this content was checked against.
 *
 * Keyed by the same `RoomType.name`/`AiKnowledgeDocument.category` values
 * `ageez-grand-hotel.ts` already uses, so `prisma/seed/index.ts` and
 * `prisma/seed/restoreBaseline.ts` can look up each parent row by its
 * existing key and upsert `[parentId, locale]` translation rows — no new
 * identifier scheme introduced.
 *
 * `"en"` never appears as a key here — the parent row IS the English
 * content (see `RoomTypeTranslation`/`AiKnowledgeDocumentTranslation`'s
 * own schema comments for why an English translation row would just be a
 * redundant duplicate, not a new fact).
 */

type Locale = "am" | "zh" | "es" | "ar";

export const roomTypeTranslationFixtures: Record<
  string,
  Record<Locale, { name: string; description: string }>
> = {
  "Standard King": {
    am: {
      name: "መደበኛ ኪንግ ክፍል",
      description: "ምቹ የከተማ እይታ ያለው ኪንግ ክፍል፣ ለብቻ ለሚጓዙ እና ለጥንዶች ተስማሚ።",
    },
    zh: {
      name: "标准大床房",
      description: "舒适的大床房，可欣赏城市景观，适合单人旅客和情侣。",
    },
    es: {
      name: "Habitación King Estándar",
      description: "Una cómoda habitación king con vistas a la ciudad, ideal para viajeros solos y parejas.",
    },
    ar: {
      name: "غرفة كينج ستاندرد",
      description: "غرفة كينج مريحة تطل على المدينة، مثالية للمسافرين الفرديين والأزواج.",
    },
  },
  "Deluxe Twin": {
    am: {
      name: "ዲሉክስ ትዊን ክፍል",
      description: "የተሻሻሉ አገልግሎቶች ያሉት ሰፊ ትዊን ክፍል፣ በጋራ ለሚጓዙ ጓደኞች ወይም ባልደረቦች ተስማሚ።",
    },
    zh: {
      name: "豪华双床房",
      description: "宽敞的双床房，配备升级设施，适合结伴出行的朋友或同事。",
    },
    es: {
      name: "Habitación Twin Deluxe",
      description: "Una amplia habitación twin con comodidades superiores, ideal para amigos o compañeros que viajan juntos.",
    },
    ar: {
      name: "غرفة توأم ديلوكس",
      description: "غرفة توأم واسعة بمرافق مطوَّرة، مناسبة للأصدقاء أو الزملاء المسافرين معًا.",
    },
  },
  "Executive Room": {
    am: {
      name: "ኤክስኪዩቲቭ ክፍል",
      description: "የተለየ የስራ ቦታ እና ወደ ላውንጅ መግቢያ ያለው ከፍ ያለ ክፍል፣ ለንግድ ተጓዦች።",
    },
    zh: {
      name: "行政客房",
      description: "配备独立办公区及贵宾廊使用权的高级客房，专为商务旅客设计。",
    },
    es: {
      name: "Habitación Ejecutiva",
      description: "Una habitación superior con espacio de trabajo independiente y acceso al salón privado, para viajeros de negocios.",
    },
    ar: {
      name: "غرفة تنفيذية",
      description: "غرفة راقية بمساحة عمل مخصصة وإمكانية الوصول إلى الصالة الخاصة، مخصصة للمسافرين لأغراض العمل.",
    },
  },
  "Family Suite": {
    am: {
      name: "የቤተሰብ ስዊት",
      description: "የተለየ የመቀመጫ ቦታ ያለው ብዙ አልጋ ያለው ስዊት፣ ለቤተሰቦች የተዘጋጀ።",
    },
    zh: {
      name: "家庭套房",
      description: "配备独立起居区的多床套房，专为家庭打造。",
    },
    es: {
      name: "Suite Familiar",
      description: "Una suite con varias camas y una sala de estar independiente, pensada para familias.",
    },
    ar: {
      name: "جناح عائلي",
      description: "جناح متعدد الأسرّة مع منطقة معيشة منفصلة، مصمم للعائلات.",
    },
  },
  "Presidential Suite": {
    am: {
      name: "ፕሬዚደንሻል ስዊት",
      description: "የግል ላውንጅ፣ የምግብ ቦታ እና ሰፊ እይታዎች ያለው የሆቴሉ ልዩ ስዊት።",
    },
    zh: {
      name: "总统套房",
      description: "酒店的尊享套房，配有私人休息室、用餐区和全景视野。",
    },
    es: {
      name: "Suite Presidencial",
      description: "La suite premier del hotel, con salón privado, zona de comedor y vistas panorámicas.",
    },
    ar: {
      name: "الجناح الرئاسي",
      description: "الجناح الفاخر في الفندق، ويضم صالة خاصة ومنطقة لتناول الطعام وإطلالات بانورامية.",
    },
  },
};

export const aiKnowledgeTranslationFixtures: Record<string, Record<Locale, string>> = {
  overview: {
    am: "Ageez Grand Hotel በአዲስ አበባ፣ ኢትዮጵያ የሚገኝ ልዩ ሆቴል ሲሆን፣ በሚገባ የተዘጋጁ ክፍሎችን እና ስዊቶችን፣ ለዚሁ ዓላማ የተዘጋጁ የስብሰባ ምቾቶችን፣ እና ለመዝናኛም ሆነ ለንግድ ተጓዦች ጥንቃቄ የተሞላበት አገልግሎት ይሰጣል።",
    zh: "Ageez Grand Hotel是位于埃塞俄比亚亚的斯亚贝巴的一家高端酒店，提供设施完善的客房与套房、专用会议设施，并为休闲及商务旅客提供细致周到的服务。",
    es: "Ageez Grand Hotel es un hotel premium en Adís Abeba, Etiopía, que ofrece habitaciones y suites bien equipadas, instalaciones dedicadas para conferencias y un servicio atento tanto para viajeros de ocio como de negocios.",
    ar: "فندق Ageez Grand هو فندق فاخر في أديس أبابا، إثيوبيا، يقدّم غرفًا وأجنحة مجهزة بعناية، ومرافق مخصصة للمؤتمرات، وخدمة متميزة لكل من المسافرين لأغراض الترفيه والأعمال.",
  },
  policies: {
    am: "የመግቢያ ሰዓት ከ2:00 PM ጀምሮ ነው። የመውጫ ሰዓት እስከ 11:00 AM ነው። ቁርስ ከ6:30 እስከ 10:30 AM ይቀርባል።",
    zh: "入住时间从下午2:00开始。退房时间为上午11:00前。早餐供应时间为早上6:30至10:30。",
    es: "La entrada es a partir de las 2:00 PM. La salida es hasta las 11:00 AM. El desayuno se sirve de 6:30 a 10:30 AM.",
    ar: "يبدأ تسجيل الوصول من الساعة 2:00 ظهرًا. وموعد المغادرة حتى الساعة 11:00 صباحًا. يُقدَّم الإفطار من الساعة 6:30 حتى 10:30 صباحًا.",
  },
  dining: {
    am: "የAgeez Grand Hotel ዋና ምግብ ቤት አክሱም ሬስቶራንት ነው። ሆቴሉ በተጨማሪም ቡና ላውንጅ የተባለ የቡና ቤት አለው።",
    zh: "Ageez Grand Hotel的主餐厅是Axum Restaurant。酒店内还设有一间咖啡廊——Buna Lounge。",
    es: "El restaurante principal de Ageez Grand Hotel es Axum Restaurant. El hotel también cuenta con un salón de café, Buna Lounge.",
    ar: "المطعم الرئيسي في فندق Ageez Grand هو مطعم أكسوم. كما يضم الفندق صالة قهوة تُدعى صالة بونا.",
  },
  facilities: {
    am: "ሆቴሉ 2 የስብሰባ አዳራሾች፣ የአካል ብቃት ማዕከል እና የቢዝነስ ማዕከል አለው።",
    zh: "酒店设有2间会议厅、一个健身中心和一个商务中心。",
    es: "El hotel cuenta con 2 salas de conferencias, un gimnasio y un centro de negocios.",
    ar: "يضم الفندق قاعتي مؤتمرات، ومركزًا للياقة البدنية، ومركز أعمال.",
  },
  services: {
    am: "የሚገኙ የእንግዳ አገልግሎቶች፦ ከአውሮፕላን ማረፊያ አገልግሎት፣ ምግብ ቤት፣ የክፍል አገልግሎት፣ ልብስ ማጠቢያ፣ ነፃ ዋይ ፋይ፣ የአካል ብቃት ማዕከል፣ የቢዝነስ ማዕከል፣ የስብሰባ ምቾቶች፣ እና 24 ሰዓት አቀባበል።",
    zh: "可提供的宾客服务包括：机场接送、餐厅、客房服务、洗衣服务、免费无线网络、健身中心、商务中心、会议设施，以及24小时前台服务。",
    es: "Servicios disponibles para huéspedes: traslado desde el aeropuerto, restaurante, servicio a la habitación, lavandería, Wi-Fi gratis, gimnasio, centro de negocios, instalaciones para conferencias y recepción 24 horas.",
    ar: "خدمات الضيوف المتوفرة: خدمة النقل من المطار، المطعم، خدمة الغرف، خدمة الغسيل، واي فاي مجاني، مركز اللياقة البدنية، مركز الأعمال، مرافق المؤتمرات، والاستقبال على مدار الساعة.",
  },
  payment: {
    am: "ቦታ ማስያዣዎች በምሳሌያዊ 'በሆቴሉ ይክፈሉ' የክፍያ ዘዴ ይረጋገጣሉ — በ v0.1 ምንም የመስመር ላይ ክፍያ አይከናወንም።",
    zh: "预订通过模拟的\"到店支付\"方式确认——v0.1版本中不处理任何在线支付。",
    es: "Las reservas se confirman mediante un método de pago simulado, 'Pagar en el hotel' — no se procesa ningún pago en línea en la v0.1.",
    ar: "يتم تأكيد الحجوزات باستخدام طريقة دفع تجريبية هي 'الدفع في الفندق' — ولا تتم معالجة أي دفع إلكتروني في الإصدار v0.1.",
  },
};
