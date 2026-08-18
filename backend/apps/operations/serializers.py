from rest_framework import serializers

from .models import DailyTrip, ReturnBooking, SeatRequest


class SeatRequestSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_phone = serializers.CharField(source='student.phone', read_only=True)
    university_name = serializers.CharField(source='university.name', read_only=True)
    pickup_name = serializers.CharField(source='pickup_point.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    priority_display = serializers.SerializerMethodField()

    class Meta:
        model = SeatRequest
        fields = [
            'id', 'daily_trip', 'student', 'student_name', 'student_phone',
            'subscription', 'priority_type', 'priority_display',
            'university', 'university_name', 'pickup_point', 'pickup_name',
            'status', 'status_display', 'seat_number', 'requested_at', 'queue_position',
        ]

    def get_priority_display(self, obj):
        return {'term': 'ترم', 'monthly': 'شهري', 'daily': 'يومي'}.get(obj.priority_type, obj.priority_type)


class DailyTripSerializer(serializers.ModelSerializer):
    route_name = serializers.CharField(source='route.name', read_only=True)
    route_origin = serializers.CharField(source='route.origin_label', read_only=True)
    destination_name = serializers.CharField(source='route.destination.name', read_only=True)
    slot_name = serializers.CharField(source='morning_slot.name', read_only=True)
    departure_time = serializers.TimeField(source='morning_slot.departure_time', read_only=True)
    confirmed_count = serializers.IntegerField(read_only=True)
    waiting_count = serializers.IntegerField(read_only=True)
    available_seats = serializers.IntegerField(read_only=True)

    class Meta:
        model = DailyTrip
        fields = [
            'id', 'date', 'route', 'route_name', 'route_origin', 'destination_name',
            'morning_slot', 'slot_name', 'departure_time', 'layout', 'total_seats',
            'confirmed_count', 'waiting_count', 'available_seats', 'allocated_at',
        ]


class ReturnBookingSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    university_name = serializers.CharField(source='university.name', read_only=True)
    slot_name = serializers.CharField(source='return_slot.name', read_only=True)
    departure_time = serializers.TimeField(source='return_slot.departure_time', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = ReturnBooking
        fields = [
            'id', 'student', 'student_name', 'date', 'return_slot', 'slot_name',
            'departure_time', 'university', 'university_name', 'status',
            'status_display', 'created_at',
        ]
