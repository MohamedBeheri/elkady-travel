from rest_framework import serializers

from .models import (
    AuditLog, Driver, MaintenanceRecord, TrafficFine, TripExpense, Vehicle, VehicleAssignment,
)


class VehicleSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Vehicle
        fields = [
            'id', 'plate_number', 'license_number', 'vehicle_type', 'brand', 'model',
            'year', 'capacity', 'license_expiry', 'status', 'status_display', 'notes',
            'active', 'created_at',
        ]


class DriverSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    license_type_display = serializers.CharField(source='get_license_type_display', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    # Write-only login credentials — create/link a driver login account.
    account_username = serializers.CharField(write_only=True, required=False, allow_blank=True)
    account_password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Driver
        fields = [
            'id', 'user', 'username', 'account_username', 'account_password',
            'full_name', 'phone', 'license_number',
            'license_type', 'license_type_display', 'license_expiry',
            'status', 'status_display', 'notes', 'created_at',
        ]
        read_only_fields = ['user']

    def _sync_account(self, driver, username, password):
        """Create or update the driver's login account (role=driver) and link it."""
        from apps.users.models import User
        username = (username or '').strip()
        if not username and not password:
            return
        user = driver.user
        if user is None:
            if not username:
                return
            clash = User.objects.filter(username__iexact=username).first()
            if clash:
                raise serializers.ValidationError(
                    {'account_username': 'اسم المستخدم مستخدم بالفعل، اختر اسماً آخر.'})
            user = User(username=username, role=User.Role.DRIVER, full_name=driver.full_name)
            user.set_password(password or 'driver123')
            user.save()
            driver.user = user
            driver.save(update_fields=['user'])
        else:
            changed = False
            if username and user.username.lower() != username.lower():
                if User.objects.filter(username__iexact=username).exclude(pk=user.pk).exists():
                    raise serializers.ValidationError(
                        {'account_username': 'اسم المستخدم مستخدم بالفعل، اختر اسماً آخر.'})
                user.username = username
                changed = True
            if password:
                user.set_password(password)
                changed = True
            if user.role != User.Role.DRIVER:
                user.role = User.Role.DRIVER
                changed = True
            if changed:
                user.save()

    def create(self, validated_data):
        au = validated_data.pop('account_username', None)
        ap = validated_data.pop('account_password', None)
        driver = super().create(validated_data)
        self._sync_account(driver, au, ap)
        return driver

    def update(self, instance, validated_data):
        au = validated_data.pop('account_username', None)
        ap = validated_data.pop('account_password', None)
        driver = super().update(instance, validated_data)
        self._sync_account(driver, au, ap)
        return driver


class VehicleAssignmentSerializer(serializers.ModelSerializer):
    driver_name = serializers.CharField(source='driver.full_name', read_only=True)
    vehicle_plate = serializers.CharField(source='vehicle.plate_number', read_only=True)
    route_name = serializers.CharField(source='route.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    trip_label = serializers.SerializerMethodField()

    class Meta:
        model = VehicleAssignment
        fields = [
            'id', 'date', 'driver', 'driver_name', 'vehicle', 'vehicle_plate',
            'daily_trip', 'trip_label', 'route', 'route_name', 'start_time', 'end_time',
            'status', 'status_display', 'notes', 'created_at',
        ]

    def get_trip_label(self, obj):
        if obj.daily_trip:
            return f'{obj.daily_trip.slot_label} - {obj.daily_trip.route.name}'
        return ''


class TripExpenseSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    vehicle_plate = serializers.CharField(source='vehicle.plate_number', read_only=True)
    driver_name = serializers.CharField(source='driver.full_name', read_only=True)

    class Meta:
        model = TripExpense
        fields = [
            'id', 'kind', 'kind_display', 'vehicle', 'vehicle_plate', 'driver', 'driver_name',
            'assignment', 'daily_trip', 'amount', 'quantity', 'expense_type', 'date',
            'description', 'receipt', 'notes', 'status', 'status_display',
            'reviewed_by', 'review_date', 'rejection_reason', 'created_at',
        ]
        read_only_fields = ['status', 'reviewed_by', 'review_date', 'rejection_reason']


class MaintenanceRecordSerializer(serializers.ModelSerializer):
    vehicle_plate = serializers.CharField(source='vehicle.plate_number', read_only=True)

    class Meta:
        model = MaintenanceRecord
        fields = [
            'id', 'vehicle', 'vehicle_plate', 'date', 'is_workshop', 'maintenance_type',
            'workshop_name', 'description', 'amount', 'attachment', 'notes', 'created_at',
        ]


class TrafficFineSerializer(serializers.ModelSerializer):
    vehicle_plate = serializers.CharField(source='vehicle.plate_number', read_only=True)
    driver_name = serializers.CharField(source='driver.full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = TrafficFine
        fields = [
            'id', 'vehicle', 'vehicle_plate', 'driver', 'driver_name', 'date', 'amount',
            'reason', 'status', 'status_display', 'attachment', 'notes', 'created_at',
        ]


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)

    class Meta:
        model = AuditLog
        fields = ['id', 'user', 'user_name', 'action', 'entity', 'entity_id', 'summary', 'created_at']
