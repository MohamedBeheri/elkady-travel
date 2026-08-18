from rest_framework import serializers

from .models import (
    CompanySettings, Destination, MorningSlot, PaymentAccount, PaymentMethod,
    PickupPoint, PricingRule, ReturnSlot, Route, SeatCapacity, University,
)


class DestinationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Destination
        fields = '__all__'


class UniversitySerializer(serializers.ModelSerializer):
    destination_name = serializers.CharField(source='destination.name', read_only=True)

    class Meta:
        model = University
        fields = ['id', 'name', 'name_en', 'destination', 'destination_name', 'active']


class PickupPointSerializer(serializers.ModelSerializer):
    route_label = serializers.CharField(source='route.origin_label', read_only=True)

    class Meta:
        model = PickupPoint
        fields = ['id', 'route', 'route_label', 'name', 'location', 'sequence', 'active']


class RouteSerializer(serializers.ModelSerializer):
    destination_name = serializers.CharField(source='destination.name', read_only=True)
    pickup_points = PickupPointSerializer(many=True, read_only=True)

    class Meta:
        model = Route
        fields = [
            'id', 'code', 'origin_label', 'name', 'name_en',
            'destination', 'destination_name', 'active', 'pickup_points',
        ]


class MorningSlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = MorningSlot
        fields = '__all__'


class ReturnSlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReturnSlot
        fields = '__all__'


class SeatCapacitySerializer(serializers.ModelSerializer):
    route_name = serializers.CharField(source='route.name', read_only=True)
    slot_name = serializers.CharField(source='morning_slot.name', read_only=True)

    class Meta:
        model = SeatCapacity
        fields = ['id', 'route', 'route_name', 'morning_slot', 'slot_name', 'total_seats']


class PricingRuleSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source='get_subscription_type_display', read_only=True)
    route_name = serializers.CharField(source='route.name', read_only=True)

    class Meta:
        model = PricingRule
        fields = [
            'id', 'subscription_type', 'type_display', 'route', 'route_name',
            'price', 'effective_date', 'active',
        ]


class PaymentMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentMethod
        fields = '__all__'


class PaymentAccountSerializer(serializers.ModelSerializer):
    method_name = serializers.CharField(source='method.name', read_only=True)
    method_code = serializers.CharField(source='method.code', read_only=True)

    class Meta:
        model = PaymentAccount
        fields = [
            'id', 'method', 'method_name', 'method_code',
            'holder_name', 'number', 'instructions', 'active',
        ]


class CompanySettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanySettings
        fields = ['id', 'name', 'tagline', 'phone', 'logo']
