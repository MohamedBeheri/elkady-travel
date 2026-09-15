import re

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User, normalize_email, normalize_phone


def validate_phone_11(value):
    """Normalize (Arabic→Latin, strip spaces) then require exactly 11 digits."""
    value = normalize_phone(value)
    if value and not re.fullmatch(r'[0-9]{11}', value):
        raise serializers.ValidationError('رقم الهاتف يجب أن يكون ١١ رقماً.')
    return value


def ensure_unique_phone(value, exclude_pk=None):
    """Reject a phone that already belongs to another user (blank is ignored)."""
    value = normalize_phone(value)
    if not value:
        return value
    qs = User.objects.filter(phone=value)
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    if qs.exists():
        raise serializers.ValidationError('رقم الهاتف مستخدم بالفعل لمستخدم آخر.')
    return value


def ensure_unique_email(value, exclude_pk=None):
    """Reject an email that already belongs to another user (blank/None is ignored)."""
    value = normalize_email(value)
    if not value:
        return value
    qs = User.objects.filter(email__iexact=value)
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    if qs.exists():
        raise serializers.ValidationError('البريد الإلكتروني مستخدم بالفعل لمستخدم آخر.')
    return value


def ensure_unique_username(value, exclude_pk=None):
    """Case-insensitive uniqueness check for username (belt-and-braces on top of DB)."""
    if not value:
        return value
    qs = User.objects.filter(username__iexact=value)
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    if qs.exists():
        raise serializers.ValidationError('اسم المستخدم مستخدم بالفعل.')
    return value


class UserSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    university_name = serializers.CharField(source='university.name', read_only=True)
    college_name = serializers.CharField(source='college.name', read_only=True)
    gender_display = serializers.CharField(source='get_gender_display', read_only=True)
    year_display = serializers.CharField(source='get_academic_year_display', read_only=True)
    center_display = serializers.CharField(source='get_center_display', read_only=True)
    pickup_name = serializers.CharField(source='pickup_point.name', read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'full_name', 'email', 'role', 'role_display',
            'national_id', 'phone', 'center', 'center_display',
            'pickup_point', 'pickup_name', 'address',
            'date_of_birth', 'gender', 'gender_display',
            'university', 'university_name', 'college', 'college_name',
            'academic_year', 'year_display', 'is_active',
        ]


class UserWriteSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, min_length=6)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'password', 'full_name', 'email', 'role',
            'national_id', 'phone', 'center', 'pickup_point', 'address', 'date_of_birth', 'gender',
            'university', 'college', 'academic_year', 'is_active',
        ]

    def validate_phone(self, value):
        pk = self.instance.pk if self.instance else None
        return ensure_unique_phone(validate_phone_11(value), exclude_pk=pk)

    def validate_username(self, value):
        pk = self.instance.pk if self.instance else None
        return ensure_unique_username(value, exclude_pk=pk)

    def validate_email(self, value):
        pk = self.instance.pk if self.instance else None
        return ensure_unique_email(value, exclude_pk=pk)

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = User(**validated_data)
        user.set_password(password or User.objects.make_random_password())
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class StudentRegisterSerializer(serializers.ModelSerializer):
    """Public student self-registration. Reuses profile on later bookings (§2)."""
    password = serializers.CharField(write_only=True, min_length=6)
    email = serializers.EmailField(required=True, allow_blank=False)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'password', 'full_name', 'email',
            'phone', 'center', 'pickup_point', 'address', 'date_of_birth', 'gender',
            'university', 'college', 'academic_year',
        ]

    def validate_phone(self, value):
        return ensure_unique_phone(validate_phone_11(value))

    def validate_username(self, value):
        return ensure_unique_username(value)

    def validate_email(self, value):
        return ensure_unique_email(value)

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(role=User.Role.STUDENT, **validated_data)
        user.set_password(password)
        user.save()
        return user


class TripsTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user).data
        return data
