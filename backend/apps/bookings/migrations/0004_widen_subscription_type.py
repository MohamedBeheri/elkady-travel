from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0003_subscription_morning_slot_subscription_return_slot'),
        ('config_app', '0008_booking_toggles_and_daily_pricing'),
    ]

    operations = [
        migrations.AlterField(
            model_name='subscription',
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
    ]
