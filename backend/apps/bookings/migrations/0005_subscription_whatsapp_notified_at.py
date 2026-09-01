from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('bookings', '0004_widen_subscription_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='subscription',
            name='whatsapp_notified_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='آخر إشعار واتساب'),
        ),
    ]
