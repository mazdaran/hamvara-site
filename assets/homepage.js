(function () {
  'use strict';

  var STRINGS = {

    /* ══ ENGLISH ═══════════════════════════════════════════ */
    en: {
      _name: 'EN', _dir: 'ltr',
      brand: 'Hamvara',
      navHome: 'Home', navProducts: 'Products', navHow: 'How we work', navContact: 'Contact',
      ctaDemo: 'Request a demo', ctaProducts: 'See the products', ctaTalk: 'Talk to me',

      eyebrow: 'Manufacturing software',
      heroTitle: 'Manufacturing operations, <mark>under control.</mark>',
      heroTagline: 'Know Your Stock. Make What You Need. Deliver On Time.',
      heroLead: 'One clear view of inventory, purchasing and production — plus focused tools that turn operational data into confident decisions.',
      ctaExploreMrp: 'Explore Hamvara MRP',
      point1: 'Live inventory visibility', point2: 'Production and BOM control', point3: 'Faster operational decisions',
      proof1Title: 'Built for operations', proof1Body: 'Inventory, purchasing and production',
      proof2Title: 'Your data stays yours', proof2Body: 'Portable and self-hosted options',
      proof3Title: 'Start without friction', proof3Body: 'Free tools and guided demos',
      proof4Title: 'Made in Istanbul', proof4Body: 'English, Turkish and Persian',
      treeRoot: 'Product ecosystem', treeMrp: 'MANUFACTURING CORE', treeSku: 'DATA STANDARDIZATION',
      treeClaim: 'SUPPLIER CLAIMS', treeLoad: 'LOGISTICS PLANNING', treeGrowth: 'GROWTH OPERATIONS',
      treeNote: 'Select a branch to open the product.',
      launchTitle: 'Start with a solution', launchHint: 'OPEN A PRODUCT', launchDecision: 'DECISION SUPPORT',
      launchInventory: 'INVENTORY RISK', launchDeadline: 'TRADE DEADLINES',

      colProduct: 'Product', colDoes: 'What it does', colStatus: 'Status',
      r2b: 'Stock and warehouse control', r2c: 'Available',
      r3a: 'Custom build', r3b: 'Built around your process', r3c: 'By estimate',
      r5b: 'Cleans and standardizes Excel inventory', r5c: 'Free beta',
      r8b: 'Finds trapped capital and inventory risk', r8c: 'Free beta',
      sheetTab: 'Products',

      productsTitle: 'Products',
      productsLead: 'Each one started as a real problem in a real workshop, not as an idea on paper.',

      p2What: 'Stock and warehouse control for workshops carrying hundreds of item codes. Built on Excel and Access, so your team already knows how to use it.',
      p2f1: 'Handles 500+ item codes',
      p2f2: 'Dashboard, stock levels, movement history',
      p2f3: 'Runs offline on your own machines',
      p2Price: 'Price on estimate',

      p3Name: 'Custom build',
      p3What: 'If the work you repeat every week does not fit any product above, it gets built for your process instead of the other way round.',
      p3f1: 'Fixed scope agreed before we start',
      p3f2: 'Training for whoever will use it',
      p3f3: 'Support after delivery',
      p3Price: 'Price after estimate',

      p5What: 'Maps messy Excel or CSV inventory files, detects duplicates and missing fields, and exports clean data for Hamvara or any ERP.',
      p5f1: 'Automatic column mapping',
      p5f2: 'SKU, barcode and price validation',
      p5f3: 'Private in-browser processing',
      p5Cta: 'Try free beta',
      p5Price: 'Free during beta',

      p6What: 'Turns Excel or CSV inventory exports into a financial risk map and a prioritized action list.',
      p6f1: 'Dead stock, overstock and shortage exposure',
      p6f2: 'ABC analysis and inventory health score',
      p6f3: 'Management report with source audit trail',
      p6Cta: 'Analyze inventory',
      p6Price: 'Free beta · runs in your browser',

      dcWhat: 'Choose a production problem, find the right Hamvara plan and run a live MRP workflow before requesting a demo.',
      dcF1: 'Problem-to-solution advisor', dcF2: 'Interactive plan and price builder', dcF3: 'Live order-to-production workflow',
      dcCta: 'Open Decision Center', dcPrice: 'Interactive preview',

      p4What: 'A practical growth workspace that turns live website and channel data into a prioritized marketing plan.',
      p4f1: 'Real PageSpeed and Lighthouse website audit',
      p4f2: 'Search, analytics and social data connections',
      p4f3: 'Human-approved content and execution workflow',
      p4Cta: 'Open Growth',
      p4Price: 'Live technical audit available',

      flowTitle: 'One connected manufacturing flow',
      flowLead: 'From the first receipt to the final shipment, every team works from the same operational picture.',
      flow1Title: 'Receive materials', flow1Body: 'Capture quantities, supplier documents and barcodes at the door.',
      flow2Title: 'Know your stock', flow2Body: 'See available, reserved, quarantine and WIP stock by warehouse.',
      flow3Title: 'Plan production', flow3Body: 'Check BOM demand and material shortages before releasing work.',
      flow4Title: 'Track the floor', flow4Body: 'Follow output, time, scrap and movements while work happens.',
      flow5Title: 'Ship on time', flow5Body: 'Move finished goods, prepare shipments and protect due dates.',
      outcomesTitle: 'Turn daily friction into operational control', outcomesLead: 'Hamvara connects the decisions that spreadsheets leave apart.',
      out1Title: 'Stock data is scattered', out1Body: 'Replace disconnected files with one live view of items, locations and movements.', out1Result: 'Fewer shortages and surprises',
      out2Title: 'Production status is unclear', out2Body: 'Connect demand, BOM availability, work orders and shop-floor progress.', out2Result: 'Faster, better-informed decisions',
      out3Title: 'Costs and deadlines move', out3Body: 'Monitor material cost, margin exposure and delivery risk before they become losses.', out3Result: 'Protected margin and due dates',

      howTitle: 'From first message to installed',
      howLead: 'Four steps, no surprises in the middle.',
      s1Title: 'Talk', s1Body: 'You describe the work you repeat by hand. Usually one call is enough.',
      s2Title: 'Estimate', s2Body: 'You get the scope, the time and the price in writing before anything starts.',
      s3Title: 'Build and install', s3Body: 'It gets built, installed on your machines, and tested with your real data.',
      s4Title: 'Support', s4Body: 'Training for your team, and help when something needs changing.',

      contactTitle: 'Request a demo',
      contactLead: 'Tell me what you are doing by hand right now. I will tell you honestly whether software is worth it.',
      contactNote: 'Usually a reply the same day. English, Persian and Turkish.',
      chanEmailK: 'EMAIL', chanPhoneK: 'PHONE', chanWaIntlK: 'WHATSAPP — INTERNATIONAL', chanWaTrK: 'WHATSAPP — TÜRKİYE', chanInstagramK: 'INSTAGRAM', socialFollow: 'Follow Hamvara',
      footPlace: 'Istanbul, Türkiye',
    },

    /* ══ فارسی ═════════════════════════════════════════════ */
    fa: {
      _name: 'FA', _dir: 'rtl',
      brand: 'هموارا',
      navHome: 'خانه', navProducts: 'محصولات', navHow: 'مراحل کار', navContact: 'تماس',
      ctaDemo: 'درخواست دمو', ctaProducts: 'دیدن محصولات', ctaTalk: 'صحبت کنیم',

      eyebrow: 'نرم‌افزار تولید',
      heroTitle: 'عملیات تولید، <mark>کاملاً تحت کنترل.</mark>',
      heroTagline: 'موجودی را بشناسید. به‌اندازه نیاز تولید کنید. به‌موقع تحویل دهید.',
      heroLead: 'یک نمای روشن از موجودی، خرید و تولید؛ همراه با ابزارهای تخصصی که داده‌های عملیاتی را به تصمیم‌های مطمئن تبدیل می‌کنند.',
      ctaExploreMrp: 'مشاهده Hamvara MRP',
      point1: 'دید زنده موجودی', point2: 'کنترل تولید و BOM', point3: 'تصمیم‌های عملیاتی سریع‌تر',
      proof1Title: 'ساخته‌شده برای عملیات', proof1Body: 'انبار، خرید و تولید',
      proof2Title: 'مالک داده‌های خودتان هستید', proof2Body: 'نسخهٔ پرتابل و نصب اختصاصی',
      proof3Title: 'شروع ساده و سریع', proof3Body: 'ابزار رایگان و دموی راهنما',
      proof4Title: 'ساخته‌شده در استانبول', proof4Body: 'فارسی، ترکی و انگلیسی',
      treeRoot: 'اکوسیستم محصولات', treeMrp: 'هسته مدیریت تولید', treeSku: 'استانداردسازی داده',
      treeClaim: 'مطالبات تأمین‌کننده', treeLoad: 'برنامه‌ریزی لجستیک', treeGrowth: 'عملیات رشد',
      treeNote: 'برای ورود به هر محصول، شاخهٔ آن را انتخاب کنید.',
      launchTitle: 'با یک راهکار شروع کنید', launchHint: 'ورود به محصول', launchDecision: 'پشتیبانی تصمیم',
      launchInventory: 'ریسک موجودی', launchDeadline: 'مهلت‌های تجاری',

      colProduct: 'محصول', colDoes: 'چه کار می‌کند', colStatus: 'وضعیت',
      r2b: 'کنترل انبار و موجودی', r2c: 'آماده',
      r3a: 'ساخت سفارشی', r3b: 'ساخته‌شده روی فرآیند شما', r3c: 'با برآورد',
      r5b: 'پاک‌سازی و استانداردسازی فایل اکسل انبار', r5c: 'نسخه آزمایشی رایگان',
      r8b: 'سرمایه خوابیده و ریسک موجودی را پیدا می‌کند', r8c: 'نسخه آزمایشی رایگان',
      sheetTab: 'محصولات',

      productsTitle: 'محصولات',
      productsLead: 'هرکدام از یک مشکل واقعی در یک کارگاه واقعی شروع شده، نه از ایده‌ای روی کاغذ.',

      p2What: 'کنترل انبار برای کارگاه‌هایی با صدها کد کالا. روی اکسل و اکسس ساخته شده، پس تیم شما از قبل بلد است با آن کار کند.',
      p2f1: 'بیش از ۵۰۰ کد کالا',
      p2f2: 'داشبورد، موجودی، تاریخچهٔ حرکت کالا',
      p2f3: 'بدون اینترنت، روی سیستم خودتان',
      p2Price: 'قیمت با برآورد',

      p3Name: 'ساخت سفارشی',
      p3What: 'اگر کاری که هر هفته تکرار می‌کنید با هیچ‌کدام از محصولات بالا جور نیست، نرم‌افزار روی فرآیند شما ساخته می‌شود، نه برعکس.',
      p3f1: 'دامنهٔ کار پیش از شروع توافق می‌شود',
      p3f2: 'آموزش برای کسی که استفاده می‌کند',
      p3f3: 'پشتیبانی پس از تحویل',
      p3Price: 'قیمت پس از برآورد',

      p5What: 'فایل‌های نامرتب Excel یا CSV انبار را تطبیق می‌دهد، داده‌های تکراری و ناقص را پیدا می‌کند و خروجی استاندارد برای Hamvara یا سایر ERPها می‌سازد.',
      p5f1: 'تطبیق خودکار ستون‌ها',
      p5f2: 'کنترل SKU، بارکد و قیمت',
      p5f3: 'پردازش خصوصی در مرورگر',
      p5Cta: 'آزمایش رایگان',
      p5Price: 'در دوره آزمایشی رایگان',

      p6What: 'خروجی Excel یا CSV انبار را به نقشه ریسک مالی و فهرست اقدامات اولویت‌بندی‌شده تبدیل می‌کند.',
      p6f1: 'موجودی راکد، مازاد و ریسک کمبود',
      p6f2: 'تحلیل ABC و امتیاز سلامت موجودی',
      p6f3: 'گزارش مدیریتی همراه با ثبت منبع داده',
      p6Cta: 'تحلیل موجودی',
      p6Price: 'نسخه آزمایشی رایگان · اجرا در مرورگر',

      dcWhat: 'مشکل تولید را انتخاب کنید، پلن مناسب Hamvara را پیدا کنید و قبل از درخواست دمو جریان زنده MRP را اجرا کنید.',
      dcF1: 'راهنمای مشکل تا راهکار', dcF2: 'سازنده تعاملی پلن و قیمت', dcF3: 'جریان زنده سفارش تا تولید',
      dcCta: 'ورود به مرکز تصمیم‌گیری', dcPrice: 'پیش‌نمایش تعاملی',

      p4What: 'فضای کاری رشد که دادهٔ واقعی سایت و کانال‌ها را به برنامهٔ بازاریابی اولویت‌بندی‌شده تبدیل می‌کند.',
      p4f1: 'تحلیل واقعی سایت با PageSpeed و Lighthouse',
      p4f2: 'اتصال داده‌های جست‌وجو، آمار و شبکه‌های اجتماعی',
      p4f3: 'تولید محتوا و اجرای کارها با تأیید انسانی',
      p4Cta: 'ورود به Growth',
      p4Price: 'تحلیل فنی زنده فعال است',

      flowTitle: 'یک جریان یکپارچه تولید', flowLead: 'از نخستین دریافت تا آخرین ارسال، همه تیم‌ها با یک تصویر عملیاتی مشترک کار می‌کنند.',
      flow1Title: 'دریافت مواد', flow1Body: 'مقدار، اسناد تأمین‌کننده و بارکد را هنگام ورود ثبت کنید.',
      flow2Title: 'شناخت دقیق موجودی', flow2Body: 'موجودی آزاد، رزروشده، قرنطینه و WIP هر انبار را ببینید.',
      flow3Title: 'برنامه‌ریزی تولید', flow3Body: 'پیش از صدور کار، نیاز BOM و کمبود مواد را کنترل کنید.',
      flow4Title: 'کنترل کف کارگاه', flow4Body: 'خروجی، زمان، ضایعات و جابه‌جایی‌ها را هنگام کار دنبال کنید.',
      flow5Title: 'تحویل به‌موقع', flow5Body: 'کالای ساخته‌شده را منتقل و موعد ارسال را محافظت کنید.',
      outcomesTitle: 'اصطکاک روزانه را به کنترل عملیاتی تبدیل کنید', outcomesLead: 'Hamvara تصمیم‌هایی را به هم متصل می‌کند که فایل‌های اکسل از هم جدا نگه می‌دارند.',
      out1Title: 'اطلاعات موجودی پراکنده است', out1Body: 'فایل‌های جدا را با نمای زنده کالا، مکان و گردش موجودی جایگزین کنید.', out1Result: 'کمبود و غافلگیری کمتر',
      out2Title: 'وضعیت تولید روشن نیست', out2Body: 'تقاضا، دسترسی BOM، سفارش‌های تولید و پیشرفت کارگاه را متصل کنید.', out2Result: 'تصمیم‌های سریع‌تر و مطمئن‌تر',
      out3Title: 'هزینه و موعد تغییر می‌کند', out3Body: 'هزینه مواد، ریسک حاشیه سود و تحویل را پیش از تبدیل‌شدن به زیان پایش کنید.', out3Result: 'حفاظت از سود و موعد تحویل',

      howTitle: 'از اولین پیام تا نصب',
      howLead: 'چهار مرحله، بدون غافلگیری در میانهٔ راه.',
      s1Title: 'گفت‌وگو', s1Body: 'کاری را که دستی تکرار می‌کنید توضیح می‌دهید. معمولاً یک تماس کافی است.',
      s2Title: 'برآورد', s2Body: 'دامنهٔ کار، زمان و قیمت را کتبی می‌گیرید، پیش از آنکه چیزی شروع شود.',
      s3Title: 'ساخت و نصب', s3Body: 'ساخته می‌شود، روی سیستم شما نصب و با داده‌های واقعی خودتان تست می‌شود.',
      s4Title: 'پشتیبانی', s4Body: 'آموزش تیم، و کمک هر وقت چیزی نیاز به تغییر داشت.',

      contactTitle: 'درخواست دمو',
      contactLead: 'بگویید همین حالا چه کاری را دستی انجام می‌دهید. صادقانه می‌گویم که نرم‌افزار به آن می‌ارزد یا نه.',
      contactNote: 'معمولاً همان روز جواب می‌دهم. انگلیسی، فارسی و ترکی.',
      chanEmailK: 'ایمیل', chanPhoneK: 'تلفن', chanWaIntlK: 'واتساپ — بین‌المللی', chanWaTrK: 'واتساپ — ترکیه', chanInstagramK: 'اینستاگرام', socialFollow: 'دنبال‌کردن Hamvara',
      footPlace: 'استانبول، ترکیه',
    },

    /* ══ TÜRKÇE ════════════════════════════════════════════ */
    tr: {
      _name: 'TR', _dir: 'ltr',
      brand: 'Hamvara',
      navHome: 'Ana sayfa', navProducts: 'Ürünler', navHow: 'Nasıl çalışıyoruz', navContact: 'İletişim',
      ctaDemo: 'Demo isteyin', ctaProducts: 'Ürünleri görün', ctaTalk: 'Konuşalım',

      eyebrow: 'Üretim yazılımı',
      heroTitle: 'Üretim operasyonları, <mark>kontrol altında.</mark>',
      heroTagline: 'Stokunuzu Bilin. İhtiyacınız Kadar Üretin. Zamanında Teslim Edin.',
      heroLead: 'Stok, satın alma ve üretimin tek ve net görünümü; operasyonel verileri güvenli kararlara dönüştüren odaklı araçlarla birlikte.',
      ctaExploreMrp: 'Hamvara MRP’yi inceleyin',
      point1: 'Canlı stok görünürlüğü', point2: 'Üretim ve BOM kontrolü', point3: 'Daha hızlı operasyon kararları',
      proof1Title: 'Operasyon için tasarlandı', proof1Body: 'Stok, satın alma ve üretim',
      proof2Title: 'Veriniz size aittir', proof2Body: 'Taşınabilir ve şirket içi seçenekler',
      proof3Title: 'Kolayca başlayın', proof3Body: 'Ücretsiz araçlar ve rehberli demo',
      proof4Title: 'İstanbul’da üretildi', proof4Body: 'Türkçe, İngilizce ve Farsça',
      treeRoot: 'Ürün ekosistemi', treeMrp: 'ÜRETİM ÇEKİRDEĞİ', treeSku: 'VERİ STANDARDİZASYONU',
      treeClaim: 'TEDARİKÇİ TALEPLERİ', treeLoad: 'LOJİSTİK PLANLAMA', treeGrowth: 'BÜYÜME OPERASYONLARI',
      treeNote: 'Ürünü açmak için ilgili dalı seçin.',
      launchTitle: 'Bir çözümle başlayın', launchHint: 'ÜRÜNÜ AÇ', launchDecision: 'KARAR DESTEĞİ',
      launchInventory: 'STOK RİSKİ', launchDeadline: 'TİCARİ SON TARİHLER',

      colProduct: 'Ürün', colDoes: 'Ne yapar', colStatus: 'Durum',
      r2b: 'Stok ve depo kontrolü', r2c: 'Hazır',
      r3a: 'Özel yapım', r3b: 'Sizin sürecinize göre', r3c: 'Teklif ile',
      r5b: 'Excel stok verisini temizler ve standartlaştırır', r5c: 'Ücretsiz beta',
      r8b: 'Stoktaki bağlı sermayeyi ve riskleri bulur', r8c: 'Ücretsiz beta',
      sheetTab: 'Ürünler',

      productsTitle: 'Ürünler',
      productsLead: 'Her biri kâğıt üzerinde bir fikir olarak değil, gerçek bir atölyedeki gerçek bir sorundan doğdu.',

      p2What: 'Yüzlerce ürün kodu taşıyan atölyeler için stok ve depo kontrolü. Excel ve Access üzerine kurulu, yani ekibiniz kullanmayı zaten biliyor.',
      p2f1: '500+ ürün kodu',
      p2f2: 'Panel, stok seviyeleri, hareket geçmişi',
      p2f3: 'İnternetsiz, kendi bilgisayarlarınızda',
      p2Price: 'Fiyat teklif ile',

      p3Name: 'Özel yapım',
      p3What: 'Her hafta tekrarladığınız iş yukarıdaki ürünlere uymuyorsa, yazılım sizin sürecinize göre yapılır; tersi değil.',
      p3f1: 'Kapsam başlamadan önce yazılı olarak belirlenir',
      p3f2: 'Kullanacak kişiye eğitim',
      p3f3: 'Teslimden sonra destek',
      p3Price: 'Fiyat teklif sonrası',

      p5What: 'Dağınık Excel veya CSV stok dosyalarını eşler, tekrarları ve eksikleri bulur; Hamvara ya da diğer ERP sistemleri için temiz çıktı üretir.',
      p5f1: 'Otomatik sütun eşleme',
      p5f2: 'SKU, barkod ve fiyat kontrolü',
      p5f3: 'Tarayıcı içinde özel işlem',
      p5Cta: 'Ücretsiz betayı dene',
      p5Price: 'Beta süresince ücretsiz',

      p6What: 'Excel veya CSV stok raporlarını finansal risk haritasına ve öncelikli aksiyon listesine dönüştürür.',
      p6f1: 'Hareketsiz stok, fazla stok ve eksik stok riski',
      p6f2: 'ABC analizi ve stok sağlık puanı',
      p6f3: 'Veri kaynağı kayıtlı yönetim raporu',
      p6Cta: 'Stoğu analiz et',
      p6Price: 'Ücretsiz beta · tarayıcıda çalışır',

      dcWhat: 'Üretim sorununuzu seçin, doğru Hamvara planını bulun ve demo istemeden önce canlı MRP akışını çalıştırın.',
      dcF1: 'Problemden çözüme danışman', dcF2: 'Etkileşimli plan ve fiyat oluşturucu', dcF3: 'Siparişten üretime canlı akış',
      dcCta: 'Karar Merkezini aç', dcPrice: 'Etkileşimli önizleme',

      p4What: 'Canlı web sitesi ve kanal verilerini öncelikli bir pazarlama planına dönüştüren pratik büyüme çalışma alanı.',
      p4f1: 'Gerçek PageSpeed ve Lighthouse web sitesi analizi',
      p4f2: 'Arama, analiz ve sosyal veri bağlantıları',
      p4f3: 'İnsan onaylı içerik ve uygulama akışı',
      p4Cta: 'Growth\u2019u aç',
      p4Price: 'Canlı teknik analiz hazır',

      flowTitle: 'Tek ve bağlantılı üretim akışı', flowLead: 'İlk mal kabulden son sevkiyata kadar tüm ekipler aynı operasyon görünümüyle çalışır.',
      flow1Title: 'Malzeme kabulü', flow1Body: 'Miktarları, tedarikçi belgelerini ve barkodları girişte kaydedin.',
      flow2Title: 'Stokunuzu bilin', flow2Body: 'Kullanılabilir, rezerve, karantina ve WIP stoklarını depo bazında görün.',
      flow3Title: 'Üretimi planlayın', flow3Body: 'İşi başlatmadan önce BOM talebini ve malzeme eksiklerini kontrol edin.',
      flow4Title: 'Sahayı takip edin', flow4Body: 'Üretim sürerken çıktı, süre, fire ve hareketleri izleyin.',
      flow5Title: 'Zamanında sevk edin', flow5Body: 'Mamulleri taşıyın, sevkiyatı hazırlayın ve teslim tarihlerini koruyun.',
      outcomesTitle: 'Günlük sorunları operasyon kontrolüne dönüştürün', outcomesLead: 'Hamvara, elektronik tabloların ayrı bıraktığı kararları birbirine bağlar.',
      out1Title: 'Stok verileri dağınık', out1Body: 'Ayrı dosyaları ürün, konum ve hareketlerin tek canlı görünümüyle değiştirin.', out1Result: 'Daha az eksik ve sürpriz',
      out2Title: 'Üretim durumu belirsiz', out2Body: 'Talep, BOM uygunluğu, iş emirleri ve saha ilerlemesini bağlayın.', out2Result: 'Daha hızlı, daha doğru kararlar',
      out3Title: 'Maliyet ve tarihler değişiyor', out3Body: 'Malzeme maliyetini, marj ve teslimat riskini kayba dönüşmeden izleyin.', out3Result: 'Korunan marj ve teslim tarihleri',

      howTitle: 'İlk mesajdan kuruluma',
      howLead: 'Dört adım, arada sürpriz yok.',
      s1Title: 'Konuşma', s1Body: 'Elle tekrarladığınız işi anlatırsınız. Genelde tek bir görüşme yeter.',
      s2Title: 'Teklif', s2Body: 'Kapsamı, süreyi ve fiyatı yazılı alırsınız; hiçbir şey başlamadan önce.',
      s3Title: 'Yapım ve kurulum', s3Body: 'Yazılır, bilgisayarlarınıza kurulur ve kendi gerçek verilerinizle test edilir.',
      s4Title: 'Destek', s4Body: 'Ekibinize eğitim ve bir şeyin değişmesi gerektiğinde yardım.',

      contactTitle: 'Demo isteyin',
      contactLead: 'Şu anda elle ne yaptığınızı anlatın. Yazılıma değip değmeyeceğini dürüstçe söyleyeyim.',
      contactNote: 'Genellikle aynı gün yanıt. İngilizce, Farsça ve Türkçe.',
      chanEmailK: 'E-POSTA', chanPhoneK: 'TELEFON', chanWaIntlK: 'WHATSAPP — ULUSLARARASI', chanWaTrK: 'WHATSAPP — TÜRKİYE', chanInstagramK: 'INSTAGRAM', socialFollow: 'Hamvara’yı takip edin',
      footPlace: 'İstanbul, Türkiye',
    },
  };

  var STORAGE_KEY = 'hamvara.lang';
  var current = 'en';

  function detect() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && STRINGS[saved]) return saved;
    } catch (e) {}
    var pref = (navigator.languages || [navigator.language || 'en']).join(',').toLowerCase();
    if (/(^|,)fa/.test(pref)) return 'fa';
    if (/(^|,)tr/.test(pref)) return 'tr';
    return 'en';
  }

  function t(key) {
    var pack = STRINGS[current] || STRINGS.en;
    return pack[key] !== undefined ? pack[key] : STRINGS.en[key];
  }

  function apply() {
    document.querySelectorAll('[data-t]').forEach(function (node) {
      var text = t(node.getAttribute('data-t'));
      if (typeof text === 'string' && text.trim()) node.textContent = text;
    });
    document.querySelectorAll('[data-t-html]').forEach(function (node) {
      var markup = t(node.getAttribute('data-t-html'));
      if (typeof markup === 'string' && markup.trim()) node.innerHTML = markup;
    });

    var pack = STRINGS[current] || STRINGS.en;
    document.documentElement.lang = current;
    document.documentElement.dir = pack._dir;
    document.title = pack.brand + ' — ' + t('heroLead').split('.')[0];
  }

  function setLang(code) {
    if (!STRINGS[code]) return;
    current = code;
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) {}
    apply();
  }

  function trackEvent(name, parameters) {
    if (typeof window.gtag === 'function') window.gtag('event', name, parameters || {});
  }

  var picker = document.getElementById('lang');
  picker.addEventListener('change', function () {
    setLang(picker.value);
    trackEvent('language_change', { language: picker.value });
  });

  document.addEventListener('click', function (event) {
    var siteMenu = document.querySelector('.site-menu');
    if (siteMenu && siteMenu.open && !siteMenu.contains(event.target)) siteMenu.removeAttribute('open');
    var link = event.target.closest('a');
    if (!link) return;
    if (siteMenu && siteMenu.contains(link)) siteMenu.removeAttribute('open');
    var href = link.getAttribute('href') || '';
    if (href.indexOf('mailto:') === 0) {
      trackEvent('generate_lead', { method: 'email' });
    } else if (href.indexOf('wa.me/') !== -1) {
      trackEvent('generate_lead', { method: 'whatsapp' });
    } else if (href.indexOf('instagram.com/hamvaramrp') !== -1) {
      trackEvent('social_click', { platform: 'instagram' });
    } else if (href === '/sku-bridge/') {
      trackEvent('select_content', { content_type: 'product', item_id: 'sku_bridge' });
    } else if (href === '/inventory-intelligence/') {
      trackEvent('select_content', { content_type: 'product', item_id: 'inventory_intelligence' });
    } else if (href === '/decision-center/') {
      trackEvent('select_content', { content_type: 'product', item_id: 'decision_center' });
    } else if (href === '/growth/') {
      trackEvent('select_content', { content_type: 'product', item_id: 'hamvara_growth' });
    } else if (href === '#contact') {
      trackEvent('contact_intent', { placement: link.getAttribute('data-t') || 'contact_link' });
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    var siteMenu = document.querySelector('.site-menu');
    if (siteMenu && siteMenu.open) {
      siteMenu.removeAttribute('open');
      siteMenu.querySelector('summary').focus();
    }
  });

  /* Automatic command-center tour: a lightweight in-page video made from
     four illustrative product views. Visitors can also choose a frame manually. */
  var commandShell = document.querySelector('.command-shell');
  var sceneButtons = Array.prototype.slice.call(document.querySelectorAll('[data-scene]'));
  var scenePanels = Array.prototype.slice.call(document.querySelectorAll('[data-scene-panel]'));
  var activeScene = 0;
  var sceneTimer = null;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function showScene(index) {
    activeScene = (index + scenePanels.length) % scenePanels.length;
    sceneButtons.forEach(function (button, i) {
      button.classList.toggle('on', i === activeScene);
      button.setAttribute('aria-pressed', String(i === activeScene));
    });
    scenePanels.forEach(function (panel, i) {
      panel.classList.toggle('on', i === activeScene);
      panel.setAttribute('aria-hidden', String(i !== activeScene));
    });
    if (window.innerWidth <= 680 && sceneButtons[activeScene]) {
      var sceneNav = sceneButtons[activeScene].parentElement;
      var sceneButton = sceneButtons[activeScene];
      sceneNav.scrollTo({ left: sceneButton.offsetLeft - (sceneNav.clientWidth - sceneButton.offsetWidth) / 2, behavior: 'smooth' });
    }
    if (commandShell) {
      commandShell.classList.remove('playing');
      void commandShell.offsetWidth;
      if (!reduceMotion) commandShell.classList.add('playing');
    }
  }

  function startSceneTour() {
    if (reduceMotion || scenePanels.length < 2) return;
    window.clearInterval(sceneTimer);
    sceneTimer = window.setInterval(function () { showScene(activeScene + 1); }, 4600);
    if (commandShell) commandShell.classList.add('playing');
  }

  sceneButtons.forEach(function (button, index) {
    button.addEventListener('click', function () { showScene(index); startSceneTour(); });
  });
  if (commandShell) {
    commandShell.addEventListener('mouseenter', function () { window.clearInterval(sceneTimer); commandShell.classList.remove('playing'); });
    commandShell.addEventListener('mouseleave', startSceneTour);
    var swipeStartX = 0;
    commandShell.addEventListener('touchstart', function (event) {
      swipeStartX = event.changedTouches[0].clientX;
      window.clearInterval(sceneTimer);
    }, { passive: true });
    commandShell.addEventListener('touchend', function (event) {
      var distance = event.changedTouches[0].clientX - swipeStartX;
      if (Math.abs(distance) > 42) showScene(activeScene + (distance < 0 ? 1 : -1));
      startSceneTour();
    }, { passive: true });
  }
  showScene(0);
  startSceneTour();

  document.getElementById('year').textContent = new Date().getFullYear();

  current = detect();
  picker.value = current;
  apply();
  picker.disabled = false;
})();
