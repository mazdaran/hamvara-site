"""Proposed trial offers: presentation only; no account or billing activation."""
from html import escape

COPY = {
    'en': {
        'label': 'PROPOSED LAUNCH OFFER',
        'title': 'Try a real workflow before you commit.',
        'notice': 'Offer preview: trials are not open yet. Request details to agree scope and a start date; this page does not create an account or start a trial.',
        'mrpTitle': 'MRP: 30 days with your workflow',
        'mrp': ['No card required. No automatic paid conversion.',
                'Proposed scope: one company, one site and up to 3 named users.',
                'One 30-minute setup session and one 20-minute results review, by appointment.',
                'Evaluate a goods receipt, one BOM, material requirements and one production order.',
                'The 30 days start when your workspace is ready and you agree the start date.'],
        'mrpPrice': 'After the trial: proposed price $590 USD per year for this scope, before tax (about $49.17/month, billed annually). Custom migration and integrations are quoted separately.',
        'mrpCta': 'Ask about the 30-day pilot',
        'skuTitle': 'SKU Bridge: test your own file',
        'sku': ['Keep the free preview of the first 200 rows.',
                'Proposed export trial: up to 3 successful downloads and 200 exported rows in total, within 30 days; whichever limit is reached first.',
                'No card required. Failed exports do not consume the allowance.',
                'Review the result against your destination import template before subscribing.'],
        'skuPrice': 'After the allowance: proposed price $12 USD/month or $120 USD/year, before tax. No automatic purchase.',
        'skuCta': 'Ask about a sample export',
        'exit': 'Planned exit: no automatic charge at trial expiry. MRP accounts get 14 additional days to view and export their data; new entries stop. Retention and deletion terms will be shown before activation.',
        'stepsTitle': 'A month with a clear outcome',
        'steps': [('Days 1–7', 'Set up a small product list and check opening stock.'), ('Days 8–14', 'Record a receipt and test one BOM and its shortages.'), ('Days 15–21', 'Follow one production order with your team.'), ('Days 22–30', 'Review the result and decide whether to subscribe.')],
    },
    'fa': {
        'label': 'پیشنهاد دورهٔ آزمایشی برای عرضه',
        'title': 'پیش از خرید، یک گردش کار واقعی را امتحان کنید.',
        'notice': 'پیش‌نمایش پیشنهاد: ثبت‌نام آزمایشی هنوز باز نیست. برای هماهنگی محدوده و تاریخ شروع درخواست بدهید؛ این صفحه حسابی ایجاد نمی‌کند و دوره‌ای را آغاز نمی‌کند.',
        'mrpTitle': 'MRP: سی روز با گردش کار خودتان',
        'mrp': ['بدون کارت بانکی و بدون تبدیل خودکار به اشتراک پولی.',
                'محدودهٔ پیشنهادی: یک شرکت، یک محل فعالیت و حداکثر ۳ کاربر مشخص.',
                'یک جلسهٔ راه‌اندازی ۳۰ دقیقه‌ای و یک جلسهٔ بررسی نتیجهٔ ۲۰ دقیقه‌ای، با هماهنگی زمان.',
                'آزمایش یک رسید کالا، یک BOM، نیاز مواد و یک سفارش تولید.',
                '۳۰ روز از آماده‌شدن محیط و توافق با شما دربارهٔ تاریخ شروع محاسبه می‌شود.'],
        'mrpPrice': 'پس از آزمایش: قیمت پیشنهادی برای همین محدوده، سالانه ۵۹۰ دلار پیش از مالیات است؛ معادل حدود ۴۹٫۱۷ دلار در ماه با پرداخت سالانه. مهاجرت اختصاصی اطلاعات و اتصال به سیستم‌های دیگر جداگانه قیمت‌گذاری می‌شود.',
        'mrpCta': 'درخواست اطلاعات پایلوت ۳۰روزه',
        'skuTitle': 'SKU Bridge: با فایل خودتان امتحان کنید',
        'sku': ['پیش‌نمایش رایگان ۲۰۰ ردیف اول حفظ می‌شود.',
                'خروجی آزمایشی پیشنهادی: حداکثر ۳ دانلود موفق و در مجموع ۲۰۰ ردیف خروجی، طی ۳۰ روز؛ با رسیدن به هرکدام از سقف‌ها دوره پایان می‌یابد.',
                'بدون کارت بانکی؛ خروجی ناموفق از سهمیه کم نمی‌کند.',
                'پیش از خرید، نتیجه را با قالب ورود اطلاعات سیستم مقصد خود مقایسه کنید.'],
        'skuPrice': 'پس از سهمیهٔ آزمایشی: قیمت پیشنهادی ۱۲ دلار ماهانه یا ۱۲۰ دلار سالانه، پیش از مالیات است. خرید خودکاری انجام نمی‌شود.',
        'skuCta': 'درخواست اطلاعات خروجی نمونه',
        'exit': 'پایان دورهٔ پیشنهادی: مبلغی خودکار برداشت نمی‌شود. حساب MRP چهارده روز دیگر برای مشاهده و خروجی اطلاعات در دسترس می‌ماند و ثبت جدید متوقف می‌شود. شرایط نگهداری و حذف اطلاعات پیش از فعال‌سازی اعلام خواهد شد.',
        'stepsTitle': 'یک ماه با نتیجهٔ مشخص',
        'steps': [('روز ۱ تا ۷', 'فهرست کوچکی از کالاها را آماده و موجودی اولیه را کنترل کنید.'), ('روز ۸ تا ۱۴', 'رسید کالا، یک BOM و کسری مواد آن را امتحان کنید.'), ('روز ۱۵ تا ۲۱', 'یک سفارش تولید را همراه تیم پیگیری کنید.'), ('روز ۲۲ تا ۳۰', 'نتیجه را بررسی و دربارهٔ خرید تصمیم بگیرید.')],
    },
    'tr': {
        'label': 'ÖNERİLEN LANSMAN DENEMESİ',
        'title': 'Satın almadan önce gerçek bir iş akışını deneyin.',
        'notice': 'Teklif önizlemesi: deneme kayıtları henüz açık değil. Kapsamı ve başlangıç tarihini belirlemek için bilgi isteyin; bu sayfa hesap oluşturmaz veya deneme başlatmaz.',
        'mrpTitle': 'MRP: kendi iş akışınızla 30 gün',
        'mrp': ['Kart gerekmez. Otomatik ücretli abonelik başlamaz.',
                'Önerilen kapsam: bir şirket, bir tesis ve en fazla 3 kişisel kullanıcı hesabı.',
                'Randevuyla bir 30 dakikalık kurulum ve bir 20 dakikalık sonuç değerlendirme görüşmesi.',
                'Bir mal kabulü, bir reçete (BOM), malzeme ihtiyaçları ve bir üretim emrini değerlendirin.',
                '30 gün, çalışma alanı hazır olduğunda ve başlangıç tarihinde anlaştığımızda başlar.'],
        'mrpPrice': 'Denemeden sonra bu kapsam için önerilen fiyat: vergiler hariç yıllık 590 USD (aylık yaklaşık 49,17 USD karşılığı; yıllık tahsil edilir). Özel veri taşıma ve entegrasyonlar ayrıca fiyatlandırılır.',
        'mrpCta': '30 günlük pilot hakkında bilgi alın',
        'skuTitle': 'SKU Bridge: kendi dosyanızla deneyin',
        'sku': ['İlk 200 satırın ücretsiz önizlemesi korunur.',
                'Önerilen dışa aktarım denemesi: 30 gün içinde en fazla 3 başarılı indirme ve toplam 200 çıktı satırı; ilk dolan sınır geçerlidir.',
                'Kart gerekmez. Başarısız dışa aktarımlar kotadan düşmez.',
                'Abone olmadan önce sonucu hedef sisteminizin içe aktarım şablonuyla karşılaştırın.'],
        'skuPrice': 'Deneme kotasından sonra önerilen fiyat: vergiler hariç aylık 12 USD veya yıllık 120 USD. Otomatik satın alma yapılmaz.',
        'skuCta': 'Örnek çıktı hakkında bilgi alın',
        'exit': 'Planlanan deneme sonu: otomatik tahsilat yapılmaz. MRP hesabında verileri görüntülemek ve dışa aktarmak için 14 gün daha tanınır; yeni kayıtlar durdurulur. Saklama ve silme koşulları etkinleştirmeden önce gösterilir.',
        'stepsTitle': 'Sonucu belli bir deneme ayı',
        'steps': [('1–7. gün', 'Küçük bir ürün listesi hazırlayın ve açılış stokunu kontrol edin.'), ('8–14. gün', 'Mal kabulünü, bir reçeteyi ve malzeme eksiklerini deneyin.'), ('15–21. gün', 'Ekibinizle bir üretim emrini takip edin.'), ('22–30. gün', 'Sonucu değerlendirin ve aboneliğe karar verin.')],
    },
}


def trial_offer(lang):
    c = COPY[lang]
    e = escape
    cards = ''
    for key, subject in [('mrp', 'Hamvara%20MRP%2030-day%20pilot'), ('sku', 'SKU%20Bridge%20sample%20export')]:
        items = ''.join(f'<li>{e(item)}</li>' for item in c[key])
        cards += f'<article class="price-card"><h3>{e(c[key+"Title"])}</h3><ul>{items}</ul><p>{e(c[key+"Price"])}</p><a class="button outline" href="mailto:info@hamvara.com?subject={subject}">{e(c[key+"Cta"])}</a></article>'
    steps = ''.join(f'<li><strong>{e(title)}</strong><p>{e(body)}</p></li>' for title, body in c['steps'])
    return f'<section id="trial-offer" class="section shell trial-offer" aria-labelledby="trial-title"><span class="eyebrow">{e(c["label"])}</span><h2 id="trial-title">{e(c["title"])}</h2><p class="pricing-notice">{e(c["notice"])}</p><div class="pricing-grid">{cards}</div><h3>{e(c["stepsTitle"])}</h3><ol class="trial-steps">{steps}</ol><p class="fine-print">{e(c["exit"])}</p></section>'
