# الإعداد والتشغيل المحلي (SETUP)

> المشروع مصمَّم ليُبنى وينشر من الجوال عبر GitHub + خدمات سحابية (انظر `MOBILE_BUILD.md` و`DEPLOYMENT.md`).
> هذا الملف لمن يملك حاسوبًا أو بيئة سحابية (Codespaces مثلًا) ويريد تشغيل كل شيء محليًا.

## المتطلبات
- Node.js 22 أو أحدث
- PostgreSQL 14+ (جُرِّب على 16) مع أداة `psql`
- (للعميل فقط) المتصفح لتجربة اللعبة؛ (للـAPK) راجع `MOBILE_BUILD.md`

## الخطوات
```bash
# 1) تثبيت اعتماديات الخادم والعميل (الجذر لا يحتاج تثبيتًا)
cd server && npm install && cd ..
cd client && npm install && cd ..

# 2) قاعدة البيانات
createdb caravan
export DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/caravan
export DATABASE_SSL=false
# الترحيلات تعمل تلقائيًا عند إقلاع الخادم (RUN_MIGRATIONS=true). أو يدويًا:
cd server && npm run migrate && cd ..

# 3) تشغيل الخادم (المنفذ الافتراضي 3000)
cd server && NODE_ENV=development npm start

# 4) تشغيل العميل للتطوير (في طرفية أخرى)
cd client && VITE_SERVER_URL=http://localhost:3000 npm run dev
# افتح http://localhost:5173 — سجّل حسابًا، أنشئ شخصية، والعب. للحركة بلوحة المفاتيح: الأسهم أو WASD،
# مسافة=هجوم، E=تحدّث، F=التقاط، 1/2=المهارات.
```

## المتغيرات (الخادم)
انظر `.env.example`. لا توجد أسرار في المستودع؛ كلها من البيئة. في الإنتاج يرفض الخادم الإقلاع بلا `DATABASE_URL` و`CORS_ORIGINS`.

## الأوامر المفيدة
| الأمر | الغرض |
|---|---|
| `npm test` | اختبارات الوحدة (المشترك، الخادم، منطق العميل) — لا تحتاج قاعدة بيانات إلا اختبارات `api.test.js` (تحتاج PostgreSQL) |
| `npm run test:db` | اختبارات SQL على PostgreSQL حقيقي |
| `npm run test:integration` | محرك اللعبة كاملًا على PostgreSQL حقيقي |
| `npm run test:ui` | اختبار واجهة DOM في Chromium (يتطلب `npm i --no-save playwright && npx playwright install chromium`) |
| `npm run check:syntax` | فحص صياغة كل الملفات |
| `npm run gen:seed` | إعادة توليد بذور الكتالوج من `shared/data` |

## بنية المشروع
```
shared/    منطق مشترك بين العميل والخادم (الخريطة، الاقتصاد، الحركة، البروتوكول، البيانات)
server/    Express + Socket.IO + محرك اللعبة (GameServer مستقل عن الشبكة)
database/  ترحيلات SQL (دوال الاقتصاد الذرّية) وبذور الكتالوج
client/    Phaser (العرض) + واجهة DOM عربية RTL + Capacitor
tests/     shared, server, integration, db, client, ui
.github/   CI + بناء APK + توليد lockfiles
```
