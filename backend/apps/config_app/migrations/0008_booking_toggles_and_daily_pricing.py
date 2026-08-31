from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('config_app', '0007_paymentaccount_transfer_link_qr'),
    ]

    operations = [
        migrations.AlterField(
            model_name='pricingrule',
            name='subscription_type',
            field=models.CharField(
                choices=[
                    ('term', 'ترم'),
                    ('monthly', 'شهري'),
                    ('daily', 'يومي'),
                    ('daily_go', 'يومي — ذهاب فقط'),
                    ('daily_return', 'يومي — عودة فقط'),
                    ('daily_round', 'يومي — ذهاب وعودة'),
                ],
                max_length=15,
                verbose_name='نوع الاشتراك',
            ),
        ),
        migrations.AddField(
            model_name='companysettings',
            name='booking_term_open',
            field=models.BooleanField(default=True, verbose_name='حجز الترم مفتوح'),
        ),
        migrations.AddField(
            model_name='companysettings',
            name='booking_monthly_open',
            field=models.BooleanField(default=True, verbose_name='حجز الشهري مفتوح'),
        ),
        migrations.AddField(
            model_name='companysettings',
            name='booking_daily_open',
            field=models.BooleanField(default=True, verbose_name='الحجز اليومي مفتوح'),
        ),
    ]
