from django.contrib import admin
from ingestion.models import Tenant, User, IngestionRun, RawRow, EmissionRecord, AuditEvent

@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'created_at']
    prepopulated_fields = {'slug': ('name',)}

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ['email', 'username', 'tenant', 'is_staff']
    list_filter  = ['tenant', 'is_staff']

@admin.register(IngestionRun)
class IngestionRunAdmin(admin.ModelAdmin):
    list_display  = ['id', 'tenant', 'source_type', 'file_name', 'status', 'row_count', 'error_count', 'created_at']
    list_filter   = ['source_type', 'status', 'tenant']
    ordering      = ['-created_at']

@admin.register(RawRow)
class RawRowAdmin(admin.ModelAdmin):
    list_display = ['id', 'run', 'row_number', 'parse_error']
    list_filter  = ['run__source_type']

@admin.register(EmissionRecord)
class EmissionRecordAdmin(admin.ModelAdmin):
    list_display  = ['id', 'tenant', 'source_type', 'scope', 'category', 'quantity_kg_co2e', 'status', 'created_at']
    list_filter   = ['status', 'scope', 'source_type', 'tenant']
    ordering      = ['-created_at']

@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ['id', 'record', 'user', 'action', 'timestamp']
    ordering     = ['-timestamp']
