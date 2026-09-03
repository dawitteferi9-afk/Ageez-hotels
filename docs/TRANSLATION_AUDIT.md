# Translation Audit — Ageez Grand Hotel Demo Content (Phase 3)

Developer-facing reviewability artifact: canonical English source →
approved translation, for every piece of hotel BUSINESS content this
phase translated. This is NOT a second source of runtime truth — the
database (`RoomTypeTranslation`/`AiKnowledgeDocumentTranslation` rows,
seeded from `src/config/defaults/seed/ageez-grand-hotel-translations.ts`)
is. This file exists so a reviewer can check fact-equivalence without
querying Postgres directly.

Every row below was translated FROM the exact English text already
approved in `src/config/defaults/seed/ageez-grand-hotel.ts` — nothing
here introduces a fact, number, time, or amenity the English source
doesn't already state. See `docs/MULTILINGUAL.md` for the architecture
and content-boundary rules this content follows.

## Room types (`RoomType.name` / `.description`)

### Standard King
| en | am | zh | es | ar |
|---|---|---|---|---|
| **Standard King** | መደበኛ ኪንግ ክፍል | 标准大床房 | Habitación King Estándar | غرفة كينج ستاندرد |
| A comfortable king room with city views, ideal for solo travelers and couples. | ምቹ የከተማ እይታ ያለው ኪንግ ክፍል፣ ለብቻ ለሚጓዙ እና ለጥንዶች ተስማሚ። | 舒适的大床房，可欣赏城市景观，适合单人旅客和情侣。 | Una cómoda habitación king con vistas a la ciudad, ideal para viajeros solos y parejas. | غرفة كينج مريحة تطل على المدينة، مثالية للمسافرين الفرديين والأزواج. |

### Deluxe Twin
| en | am | zh | es | ar |
|---|---|---|---|---|
| **Deluxe Twin** | ዲሉክስ ትዊን ክፍል | 豪华双床房 | Habitación Twin Deluxe | غرفة توأم ديلوكس |
| A spacious twin room with upgraded amenities, suited to friends or colleagues traveling together. | የተሻሻሉ አገልግሎቶች ያሉት ሰፊ ትዊን ክፍል፣ በጋራ ለሚጓዙ ጓደኞች ወይም ባልደረቦች ተስማሚ። | 宽敞的双床房，配备升级设施，适合结伴出行的朋友或同事。 | Una amplia habitación twin con comodidades superiores, ideal para amigos o compañeros que viajan juntos. | غرفة توأم واسعة بمرافق مطوَّرة، مناسبة للأصدقاء أو الزملاء المسافرين معًا. |

### Executive Room
| en | am | zh | es | ar |
|---|---|---|---|---|
| **Executive Room** | ኤክስኪዩቲቭ ክፍል | 行政客房 | Habitación Ejecutiva | غرفة تنفيذية |
| An elevated room with a dedicated workspace and lounge access, for business travelers. | የተለየ የስራ ቦታ እና ወደ ላውንጅ መግቢያ ያለው ከፍ ያለ ክፍል፣ ለንግድ ተጓዦች። | 配备独立办公区及贵宾廊使用权的高级客房，专为商务旅客设计。 | Una habitación superior con espacio de trabajo independiente y acceso al salón privado, para viajeros de negocios. | غرفة راقية بمساحة عمل مخصصة وإمكانية الوصول إلى الصالة الخاصة، مخصصة للمسافرين لأغراض العمل. |

### Family Suite
| en | am | zh | es | ar |
|---|---|---|---|---|
| **Family Suite** | የቤተሰብ ስዊት | 家庭套房 | Suite Familiar | جناح عائلي |
| A multi-bed suite with a separate living area, built for families. | የተለየ የመቀመጫ ቦታ ያለው ብዙ አልጋ ያለው ስዊት፣ ለቤተሰቦች የተዘጋጀ። | 配备独立起居区的多床套房，专为家庭打造。 | Una suite con varias camas y una sala de estar independiente, pensada para familias. | جناح متعدد الأسرّة مع منطقة معيشة منفصلة، مصمم للعائلات. |

### Presidential Suite
| en | am | zh | es | ar |
|---|---|---|---|---|
| **Presidential Suite** | ፕሬዚደንሻል ስዊት | 总统套房 | Suite Presidencial | الجناح الرئاسي |
| The hotel's premier suite, with a private lounge, dining area, and panoramic views. | የግል ላውንጅ፣ የምግብ ቦታ እና ሰፊ እይታዎች ያለው የሆቴሉ ልዩ ስዊት። | 酒店的尊享套房，配有私人休息室、用餐区和全景视野。 | La suite premier del hotel, con salón privado, zona de comedor y vistas panorámicas. | الجناح الفاخر في الفندق، ويضم صالة خاصة ومنطقة لتناول الطعام وإطلالات بانورامية. |

Capacity, base price, and currency are NOT translated — they stay
exactly as stored on the `RoomType` row itself (2/2/2/4/4 guests;
4,500/5,500/7,000/9,500/18,000 ETB respectively), read identically
regardless of locale.

## AI knowledge documents (`AiKnowledgeDocument.content`)

### overview
- **en:** Ageez Grand Hotel is a premium hotel in Addis Ababa, Ethiopia, offering well-appointed rooms and suites, dedicated conference facilities, and attentive service for both leisure and business travelers.
- **am:** Ageez Grand Hotel በአዲስ አበባ፣ ኢትዮጵያ የሚገኝ ልዩ ሆቴል ሲሆን፣ በሚገባ የተዘጋጁ ክፍሎችን እና ስዊቶችን፣ ለዚሁ ዓላማ የተዘጋጁ የስብሰባ ምቾቶችን፣ እና ለመዝናኛም ሆነ ለንግድ ተጓዦች ጥንቃቄ የተሞላበት አገልግሎት ይሰጣል።
- **zh:** Ageez Grand Hotel是位于埃塞俄比亚亚的斯亚贝巴的一家高端酒店，提供设施完善的客房与套房、专用会议设施，并为休闲及商务旅客提供细致周到的服务。
- **es:** Ageez Grand Hotel es un hotel premium en Adís Abeba, Etiopía, que ofrece habitaciones y suites bien equipadas, instalaciones dedicadas para conferencias y un servicio atento tanto para viajeros de ocio como de negocios.
- **ar:** فندق Ageez Grand هو فندق فاخر في أديس أبابا، إثيوبيا، يقدّم غرفًا وأجنحة مجهزة بعناية، ومرافق مخصصة للمؤتمرات، وخدمة متميزة لكل من المسافرين لأغراض الترفيه والأعمال.

### policies
- **en:** Check-in is from 2:00 PM. Checkout is by 11:00 AM. Breakfast is served 6:30-10:30 AM.
- **am:** የመግቢያ ሰዓት ከ2:00 PM ጀምሮ ነው። የመውጫ ሰዓት እስከ 11:00 AM ነው። ቁርስ ከ6:30 እስከ 10:30 AM ይቀርባል።
- **zh:** 入住时间从下午2:00开始。退房时间为上午11:00前。早餐供应时间为早上6:30至10:30。
- **es:** La entrada es a partir de las 2:00 PM. La salida es hasta las 11:00 AM. El desayuno se sirve de 6:30 a 10:30 AM.
- **ar:** يبدأ تسجيل الوصول من الساعة 2:00 ظهرًا. وموعد المغادرة حتى الساعة 11:00 صباحًا. يُقدَّم الإفطار من الساعة 6:30 حتى 10:30 صباحًا.

All four translations keep the exact same numeric times (2:00 PM /
11:00 AM / 6:30–10:30 AM) in Western digits, deliberately — see
`docs/MULTILINGUAL.md`'s note on `ar-u-nu-latn` numeral consistency; the
same discipline was applied by hand here rather than converting to any
locale-specific clock convention, to avoid introducing a translation
error.

### dining
- **en:** Ageez Grand Hotel's main restaurant is Axum Restaurant. The hotel also has a coffee lounge, Buna Lounge.
- **am:** የAgeez Grand Hotel ዋና ምግብ ቤት አክሱም ሬስቶራንት ነው። ሆቴሉ በተጨማሪም ቡና ላውንጅ የተባለ የቡና ቤት አለው።
- **zh:** Ageez Grand Hotel的主餐厅是Axum Restaurant。酒店内还设有一间咖啡廊——Buna Lounge。
- **es:** El restaurante principal de Ageez Grand Hotel es Axum Restaurant. El hotel también cuenta con un salón de café, Buna Lounge.
- **ar:** المطعم الرئيسي في فندق Ageez Grand هو مطعم أكسوم. كما يضم الفندق صالة قهوة تُدعى صالة بونا.

Venue proper names ("Axum Restaurant"/"Buna Lounge") are transliterated
into Amharic/Arabic script within this flowing prose (matching the
per-language convention Phase 2 already established for these same
names inside AI Concierge starter questions), while the structured
VENUE CARD title on `/restaurant`/`/services` always displays the exact
Latin brand string in every locale — see `docs/MULTILINGUAL.md`'s
Brand/Proper Names note for why these are two different, both correct,
contexts.

### facilities
- **en:** The hotel has 2 conference halls, a fitness center, and a business center.
- **am:** ሆቴሉ 2 የስብሰባ አዳራሾች፣ የአካል ብቃት ማዕከል እና የቢዝነስ ማዕከል አለው።
- **zh:** 酒店设有2间会议厅、一个健身中心和一个商务中心。
- **es:** El hotel cuenta con 2 salas de conferencias, un gimnasio y un centro de negocios.
- **ar:** يضم الفندق قاعتي مؤتمرات، ومركزًا للياقة البدنية، ومركز أعمال.

### services
- **en:** Available guest services: airport pickup, restaurant, room service, laundry, free Wi-Fi, fitness center, business center, conference facilities, and 24-hour reception.
- **am:** የሚገኙ የእንግዳ አገልግሎቶች፦ ከአውሮፕላን ማረፊያ አገልግሎት፣ ምግብ ቤት፣ የክፍል አገልግሎት፣ ልብስ ማጠቢያ፣ ነፃ ዋይ ፋይ፣ የአካል ብቃት ማዕከል፣ የቢዝነስ ማዕከል፣ የስብሰባ ምቾቶች፣ እና 24 ሰዓት አቀባበል።
- **zh:** 可提供的宾客服务包括：机场接送、餐厅、客房服务、洗衣服务、免费无线网络、健身中心、商务中心、会议设施，以及24小时前台服务。
- **es:** Servicios disponibles para huéspedes: traslado desde el aeropuerto, restaurante, servicio a la habitación, lavandería, Wi-Fi gratis, gimnasio, centro de negocios, instalaciones para conferencias y recepción 24 horas.
- **ar:** خدمات الضيوف المتوفرة: خدمة النقل من المطار، المطعم، خدمة الغرف، خدمة الغسيل، واي فاي مجاني، مركز اللياقة البدنية، مركز الأعمال، مرافق المؤتمرات، والاستقبال على مدار الساعة.

### payment
- **en:** Bookings are confirmed with a simulated 'Pay at Hotel' payment method — no online payment is processed in v0.1.
- **am:** ቦታ ማስያዣዎች በምሳሌያዊ 'በሆቴሉ ይክፈሉ' የክፍያ ዘዴ ይረጋገጣሉ — በ v0.1 ምንም የመስመር ላይ ክፍያ አይከናወንም።
- **zh:** 预订通过模拟的"到店支付"方式确认——v0.1版本中不处理任何在线支付。
- **es:** Las reservas se confirman mediante un método de pago simulado, 'Pagar en el hotel' — no se procesa ningún pago en línea en la v0.1.
- **ar:** يتم تأكيد الحجوزات باستخدام طريقة دفع تجريبية هي 'الدفع في الفندق' — ولا تتم معالجة أي دفع إلكتروني في الإصدار v0.1.

(`payment` isn't currently displayed on any guest page — same as the
English source — but is translated for knowledge-base completeness,
since it's the same ONE knowledge base Phase 4's AI Concierge will
eventually ground answers in across all five locales.)

## Highlight/venue chip vocabulary (`messages/<locale>.json`'s `Highlights` namespace)

Not hotel database content — this is presentation-layer vocabulary
(room-feature chips like "City View", service icons like "Free Wi-Fi",
facility-card taglines) that `src/lib/guest/roomHighlights.ts`/
`knowledgeHighlights.ts` derive from the English source text above by
phrase-matching, then look up for display via this catalog namespace.
See `docs/MULTILINGUAL.md`'s note on why this lives in the message
catalogs, not a translation table, and `messages/en.json`'s `Highlights`
namespace for the full canonical key list.
