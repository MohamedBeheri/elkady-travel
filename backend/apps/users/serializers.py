from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


class UserSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    university_name = serializers.CharField(source='university.name', read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'full_name', 'role', 'role_display',
            'national_id', 'phone', 'address', 'university', 'university_name', 'is_active',
        ]


class UserWriteSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, min_length=6)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'password', 'full_name', 'role',
            'national_id', 'phone', 'address', 'university', 'is_active',
        ]

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

    class Meta:
        model = User
        fields = [
            'id', 'username', 'password', 'full_name',
            'national_id', 'phone', 'address', 'university',
        ]

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
