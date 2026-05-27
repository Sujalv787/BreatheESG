from rest_framework import serializers
from django.contrib.auth import get_user_model
from ingestion.models import Tenant, IngestionRun, RawRow, EmissionRecord, AuditEvent

User = get_user_model()


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Tenant
        fields = ['id', 'name', 'slug', 'created_at']


class AuditEventSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)

    class Meta:
        model  = AuditEvent
        fields = ['id', 'action', 'note', 'timestamp', 'user_email']


class RawRowSerializer(serializers.ModelSerializer):
    class Meta:
        model  = RawRow
        fields = ['id', 'row_number', 'raw_data', 'parse_error']


class IngestionRunSerializer(serializers.ModelSerializer):
    uploaded_by_email = serializers.EmailField(source='uploaded_by.email', read_only=True)

    class Meta:
        model  = IngestionRun
        fields = [
            'id', 'tenant', 'source_type', 'uploaded_by', 'uploaded_by_email',
            'file_name', 'status', 'row_count', 'error_count', 'created_at',
        ]
        read_only_fields = ['tenant', 'uploaded_by', 'status', 'row_count', 'error_count', 'created_at']


class EmissionRecordSerializer(serializers.ModelSerializer):
    # Read-only nested fields
    raw_data          = serializers.JSONField(source='raw_row.raw_data', read_only=True)
    parse_error       = serializers.CharField(source='raw_row.parse_error', read_only=True, allow_null=True)
    approved_by_email = serializers.SerializerMethodField()
    audit_events      = AuditEventSerializer(many=True, read_only=True)

    # Writable fields for PATCH
    status      = serializers.ChoiceField(choices=EmissionRecord.STATUS_CHOICES, required=False)
    flag_reason = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    note        = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model  = EmissionRecord
        fields = [
            'id', 'tenant', 'run', 'raw_row',
            'scope', 'category', 'description',
            'quantity_kg_co2e', 'unit_original', 'value_original',
            'source_type', 'period_start', 'period_end',
            'status', 'flag_reason',
            'created_at', 'approved_by', 'approved_by_email', 'approved_at',
            'raw_data', 'parse_error',
            'audit_events',
            'note',  # write-only, consumed in view
        ]
        read_only_fields = [
            'id', 'tenant', 'run', 'raw_row',
            'scope', 'category', 'description',
            'quantity_kg_co2e', 'unit_original', 'value_original',
            'source_type', 'period_start', 'period_end',
            'created_at', 'approved_by', 'approved_by_email', 'approved_at',
            'raw_data', 'parse_error', 'audit_events',
        ]

    def get_approved_by_email(self, obj):
        return obj.approved_by.email if obj.approved_by else None
