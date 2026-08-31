# نشر «القاضي — ELKADY TRAVEL» على سيرفر Hostinger — منفصل تماماً عن MPFC

هذا الدليل ينشر البرنامج **كاملاً** (الواجهة + الـ API + قاعدة البيانات) على نفس
السيرفر (`31.97.118.178`) الذي يستضيف نظام **MPFC**، مع **عزل تام** بين النظامين.

## كيف يتحقق العزل الكامل؟

| المورد | MPFC (موجود) | ELKADY (جديد) — منفصل |
|---|---|---|
| مستخدم النظام | خاص به | مستخدم جديد `elkady` |
| مجلد التطبيق | خاص به | `/opt/elkady` |
| مدير العمليات | PM2 (Node) | **systemd** خدمة `elkady` (لا علاقة بـ PM2) |
| منفذ/سوكيت | خاص به | Unix socket `/run/elkady/gunicorn.sock` (لا منفذ مشترك) |
| قاعدة البيانات | DB خاصة به | **DB منفصلة** `elkady_db` + مستخدم `elkady_user` |
| Nginx | server block خاص به | ملف منفصل `/etc/nginx/sites-available/elkady` |
| الملفات المرفوعة | خاصة به | `/opt/elkady/backend/media` |

> Postgres يشغّل عدة قواعد بيانات في نفس الخدمة بعزل كامل عبر الصلاحيات؛ إنشاء
> قاعدة ومستخدم جديدين **لا يمسّ** قاعدة MPFC نهائياً. لن نعدّل أي ملف يخص MPFC.

الواجهة الأمامية مبنية ومرفوعة مسبقاً داخل المستودع (`backend/frontend_dist`)، لذلك
**لا حاجة لتثبيت Node على السيرفر** — بايثون فقط.

---

## المتطلبات
- دخول SSH بصلاحية `sudo`.
- Nginx و PostgreSQL مثبّتان على السيرفر بالفعل (نظام MPFC يستخدمهما).
- Python 3.11+ (`python3 --version`).

نفّذ الأوامر التالية بالترتيب على السيرفر.

---

## 1) قاعدة بيانات PostgreSQL منفصلة

```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE elkady_db;
CREATE USER elkady_user WITH PASSWORD 'ضع_كلمة_مرور_قوية_هنا';
ALTER ROLE elkady_user SET client_encoding TO 'utf8';
ALTER ROLE elkady_user SET timezone TO 'Africa/Cairo';
GRANT ALL PRIVILEGES ON DATABASE elkady_db TO elkady_user;
SQL

# لبوستجرس 15+ امنح صلاحية المخطط public (لا يؤثر على قواعد أخرى):
sudo -u postgres psql -d elkady_db -c "GRANT ALL ON SCHEMA public TO elkady_user;"
```

## 2) مستخدم النظام والمجلدات

```bash
sudo useradd --system --create-home --home-dir /opt/elkady --shell /bin/bash elkady
```

## 3) جلب الكود (المستودع خاص)

استخدم **Personal Access Token** من GitHub (أو مفتاح Deploy):

```bash
sudo -u elkady git clone https://<GITHUB_TOKEN>@github.com/MohamedBeheri/elkady-travel.git /opt/elkady
```

## 4) بيئة بايثون والتثبيت

```bash
sudo -u elkady python3 -m venv /opt/elkady/venv
sudo -u elkady /opt/elkady/venv/bin/pip install --upgrade pip
sudo -u elkady /opt/elkady/venv/bin/pip install -r /opt/elkady/backend/requirements.txt
```

## 5) ملف البيئة `.env`

```bash
sudo -u elkady cp /opt/elkady/deploy/vps/.env.example /opt/elkady/backend/.env
sudo -u elkady nano /opt/elkady/backend/.env
```
اضبط داخله:
- `SECRET_KEY` — ولّده بأمر:
  `python3 -c "import secrets; print(secrets.token_urlsafe(50))"`
- `DATABASE_URL` — بنفس كلمة مرور الخطوة 1.
- `ALLOWED_HOSTS` — دومين ELKADY و/أو `31.97.118.178`.
- `SECURE_SSL_REDIRECT=False` مبدئياً (نفعّلها بعد TLS).

## 6) الهجرات والملفات الثابتة والبيانات الأولية

```bash
cd /opt/elkady/backend
sudo -u elkady /opt/elkady/venv/bin/python manage.py migrate --no-input
sudo -u elkady /opt/elkady/venv/bin/python manage.py collectstatic --no-input

# بيانات أولية (حسابات النظام + المسارات + الأسطول). مرة واحدة فقط:
sudo -u elkady /opt/elkady/venv/bin/python manage.py seed_demo
sudo -u elkady /opt/elkady/venv/bin/python manage.py seed_fleet
```
> حسابات الدخول الافتراضية بعد seed: `admin/admin123` — **غيّر كلمة المرور فوراً**
> من صفحة المستخدمين أو عبر `createsuperuser`.

## 7) خدمة systemd المعزولة

```bash
sudo cp /opt/elkady/deploy/vps/elkady.service /etc/systemd/system/elkady.service
sudo mkdir -p /opt/elkady/backend/media
sudo chown -R elkady:www-data /opt/elkady/backend/media
sudo systemctl daemon-reload
sudo systemctl enable --now elkady
sudo systemctl status elkady --no-pager      # يجب أن تكون active (running)
```

## 8) Nginx — server block منفصل

```bash
sudo cp /opt/elkady/deploy/vps/elkady-nginx.conf /etc/nginx/sites-available/elkady
sudo nano /etc/nginx/sites-available/elkady        # غيّر server_name للدومين
sudo ln -s /etc/nginx/sites-available/elkady /etc/nginx/sites-enabled/elkady
sudo nginx -t          # اختبار — يجب أن ينجح دون لمس بلوك MPFC
sudo systemctl reload nginx
```

## 9) شهادة TLS (اختياري لكن موصى به — يحتاج دومين)

```bash
sudo certbot --nginx -d elkady.example.com
# بعد نجاحها، في .env اضبط:
#   SECURE_SSL_REDIRECT=True
#   CSRF_TRUSTED_ORIGINS=https://elkady.example.com
# ثم:
sudo systemctl restart elkady
```

## 10) الجدار الناري (إن كنت تستخدم الوصول بالـ IP والمنفذ — Option B)

```bash
sudo ufw allow 8090
```

---

## التحديث لاحقاً (بعد أي git push)

```bash
sudo -u elkady bash /opt/elkady/deploy/vps/update.sh
```
(يحتاج سطر sudo داخل السكربت صلاحية إعادة تشغيل الخدمة؛ أو نفّذ يدوياً:
`sudo systemctl restart elkady`.)

---

## (اختياري) نقل بيانات جهازك الحالية إلى السيرفر

نسختك المحلية على SQLite. لنقل نفس البيانات بدل seed:

على جهازك:
```bash
cd backend
source venv/bin/activate
python manage.py dumpdata --natural-foreign --natural-primary \
  -e contenttypes -e auth.permission -e admin.logentry -e sessions \
  --indent 2 -o /tmp/elkady_data.json
```
انسخ الملف للسيرفر ثم (بدل الخطوة 6 seed):
```bash
scp /tmp/elkady_data.json user@31.97.118.178:/tmp/
# على السيرفر بعد migrate:
sudo -u elkady /opt/elkady/venv/bin/python manage.py loaddata /tmp/elkady_data.json
```

---

## فحص سريع للعزل
- `sudo systemctl status elkady` خدمة مستقلة (ليست في PM2).
- `sudo -u postgres psql -c "\l"` تُظهر `elkady_db` بجانب قاعدة MPFC — منفصلتان.
- MPFC يبقى يعمل كما هو (لم نلمس بلوكه في Nginx ولا خدماته).
