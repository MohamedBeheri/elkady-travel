from rest_framework import serializers

from .models import Quotation, TourismRequest, VehicleType


class VehicleTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleType
        fields = '__all__'


class QuotationSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Quotation
        fields = [
            'id', 'request', 'price', 'validity_date', 'notes',
            'status', 'status_display', 'created_by', 'created_at',
        ]
        read_only_fields = ['created_by', 'created_at']


class TourismRequestSerializer(serializers.ModelSerializer):
    vehicle_name = serializers.CharField(source='vehicle_type.name', read_only=True)
    trip_type_display = serializers.CharField(source='get_trip_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    quotations = QuotationSerializer(many=True, read_only=True)

    class Meta:
        model = TourismRequest
        fields = [
            'id', 'customer', 'full_name', 'phone', 'national_id', 'address',
            'origin', 'destination', 'travel_date', 'vehicle_type', 'vehicle_name',
            'travelers', 'trip_type', 'trip_type_display', 'notes',
            'status', 'status_display', 'created_at', 'quotations',
        ]
        read_only_fields = ['status', 'created_at']
