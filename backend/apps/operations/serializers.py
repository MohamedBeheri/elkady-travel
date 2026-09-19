from rest_framework import serializers

from .models import DailyReschedule, DailyTrip, ReturnBooking, SeatRequest


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
    destination_name = serializers.SerializerMethodField()
    slot_name = serializers.CharField(source='slot_label', read_only=True)
    direction_display = serializers.CharField(source='get_direction_display', read_only=True)
    confirmed_count = serializers.IntegerField(read_only=True)
    waiting_count = serializers.IntegerField(read_only=True)
    available_seats = serializers.IntegerField(read_only=True)
    # Capacity/layout follow the live admin config (SeatCapacity), not the
    # snapshot stored when the trip was first created — so every screen shows
    # the same numbers the admin set in الإعدادات.
    total_seats = serializers.IntegerField(source='effective_capacity', read_only=True)
    occupancy_percent = serializers.SerializerMethodField()
    is_full = serializers.SerializerMethodField()

    class Meta:
        model = DailyTrip
        fields = [
            'id', 'date', 'route', 'route_name', 'route_origin', 'destination_name',
            'direction', 'direction_display', 'morning_slot', 'return_slot',
            'slot_name', 'layout', 'total_seats',
            'confirmed_count', 'waiting_count', 'available_seats', 'allocated_at',
            'occupancy_percent', 'is_full',
        ]

    def get_destination_name(self, obj):
        return obj.route.destination_for(obj.direction).name

    def get_occupancy_percent(self, obj):
        cap = obj.effective_capacity or 0
        if cap <= 0:
            return 0
        return round(obj.confirmed_count * 100 / cap)

    def get_is_full(self, obj):
        return obj.available_seats <= 0 and obj.effective_capacity > 0


class ReturnBookingSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    university_name = serializers.CharField(source='university.name', read_only=True)
    slot_name = serializers.CharField(source='return_slot.name', read_only=True)
    departure_time = serializers.TimeField(source='return_slot.departure_time', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    direction = serializers.SerializerMethodField()

    class Meta:
        model = ReturnBooking
        fields = [
            'id', 'student', 'student_name', 'date', 'return_slot', 'slot_name',
            'departure_time', 'university', 'university_name', 'route', 'direction', 'status',
            'status_display', 'created_at',
        ]

    def get_direction(self, obj):
        # Return trip = destination → origin (reverse of the going route).
        if obj.route:
            return f'{obj.route.destination.name} ← {obj.route.origin_label}'
        return ''


class DailyRescheduleSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_phone = serializers.CharField(source='student.phone', read_only=True)
    old_trip_label = serializers.SerializerMethodField()
    new_trip_label = serializers.SerializerMethodField()

    class Meta:
        model = DailyReschedule
        fields = [
            'id', 'student', 'student_name', 'student_phone', 'subscription',
            'old_trip_label', 'new_trip_label', 'created_at',
        ]

    def _label(self, trip):
        if not trip:
            return '—'
        slot = trip.return_slot if trip.direction == 'return' else trip.morning_slot
        return f'{trip.route.name} — {slot.name if slot else "—"} — {trip.date} ({trip.get_direction_display()})'

    def get_old_trip_label(self, obj):
        return self._label(obj.old_trip)

    def get_new_trip_label(self, obj):
        return self._label(obj.new_trip)
