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

    class Meta:
        model = Driver
        fields = [
            'id', 'user', 'username', 'full_name', 'phone', 'license_number',
            'license_type', 'license_type_display', 'license_expiry',
            'status', 'status_display', 'notes', 'created_at',
        ]


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
            return f'{obj.daily_trip.morning_slot.name} - {obj.daily_trip.route.name}'
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
