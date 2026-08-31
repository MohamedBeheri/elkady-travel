from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('config_app', '0006_pickuptime'),
    ]

    operations = [
        migrations.AddField(
            model_name='paymentaccount',
            name='transfer_link',
            field=models.URLField(blank=True, max_length=500, verbose_name='لينك التحويل'),
        ),
        migrations.AddField(
            model_name='paymentaccount',
            name='qr_image',
            field=models.ImageField(blank=True, null=True, upload_to='payments/qr/', verbose_name='كود QR'),
        ),
    ]
