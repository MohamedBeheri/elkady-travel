from rest_framework import serializers

from .models import Subscription


class SubscriptionSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_national_id = serializers.CharField(source='student.national_id', read_only=True)
    student_phone = serializers.CharField(source='student.phone', read_only=True)
    route_name = serializers.CharField(source='route.name', read_only=True)
    destination_name = serializers.CharField(source='route.destination.name', read_only=True)
    university_name = serializers.CharField(source='university.name', read_only=True)
    pickup_name = serializers.CharField(source='pickup_point.name', read_only=True)
    pickup_center = serializers.CharField(source='pickup_point.center', read_only=True)
    pickup_center_display = serializers.CharField(source='pickup_point.get_center_display', read_only=True)
    type_display = serializers.CharField(source='get_subscription_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    method_name = serializers.CharField(source='payment_method.name', read_only=True)

    class Meta:
        model = Subscription
        fields = [
            'id', 'student', 'student_name', 'student_national_id', 'student_phone',
            'subscription_type', 'type_display', 'route', 'route_name',
            'destination_name', 'university', 'university_name',
            'pickup_point', 'pickup_name', 'pickup_center', 'pickup_center_display',
            'amount', 'status', 'status_display',
            'payment_method', 'method_name', 'payment_reference', 'payment_proof',
            'submitted_at', 'verified_at', 'verified_by', 'rejection_reason',
            'created_at',
        ]
        read_only_fields = [
            'status', 'submitted_at', 'verified_at', 'verified_by', 'created_at',
        ]


class SubscriptionCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subscription
        fields = [
            'id', 'subscription_type', 'route', 'university', 'pickup_point', 'amount',
        ]

    def create(self, validated_data):
        request = self.context['request']
        return Subscription.objects.create(student=request.user, **validated_data)
