from django.db import models
from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager
from django.conf import settings
from django.utils import timezone
from ingestion.middleware import get_current_tenant

class Tenant(models.Model):
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class TenantUserManager(DjangoUserManager):
    def get_queryset(self):
        qs = super().get_queryset()
        tenant = get_current_tenant()
        if tenant:
            return qs.filter(tenant=tenant)
        return qs

class User(AbstractUser):
    email = models.EmailField(unique=True)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, null=True, blank=True)

    objects = TenantUserManager()
    unfiltered = DjangoUserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        return self.email

class TenantManager(models.Manager):
    def get_queryset(self):
        qs = super().get_queryset()
        tenant = get_current_tenant()
        if tenant:
            return qs.filter(tenant=tenant)
        return qs

class TenantBaseModel(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)

    objects = TenantManager()
    unfiltered = models.Manager()

    class Meta:
        abstract = True

class IngestionRun(TenantBaseModel):
    SOURCE_CHOICES = [
        ('SAP', 'SAP'),
        ('UTILITY', 'Utility'),
        ('TRAVEL', 'Travel'),
    ]
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('PROCESSING', 'Processing'),
        ('DONE', 'Done'),
        ('FAILED', 'Failed'),
    ]

    source_type = models.CharField(max_length=20, choices=SOURCE_CHOICES)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    file_name = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    row_count = models.IntegerField(default=0)
    error_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.source_type} Run - {self.file_name} ({self.status})"

class RawRow(TenantBaseModel):
    run = models.ForeignKey(IngestionRun, on_delete=models.CASCADE, related_name='raw_rows')
    row_number = models.IntegerField()
    raw_data = models.JSONField()
    parse_error = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"Row {self.row_number} (Run {self.run_id})"

class EmissionRecord(TenantBaseModel):
    SCOPE_CHOICES = [
        ('1', 'Scope 1'),
        ('2', 'Scope 2'),
        ('3', 'Scope 3'),
    ]
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
        ('FLAGGED', 'Flagged'),
    ]

    run = models.ForeignKey(IngestionRun, on_delete=models.CASCADE, related_name='records')
    raw_row = models.ForeignKey(RawRow, on_delete=models.CASCADE, related_name='records')
    scope = models.CharField(max_length=10, choices=SCOPE_CHOICES)
    category = models.CharField(max_length=100)
    description = models.TextField()
    quantity_kg_co2e = models.DecimalField(max_digits=18, decimal_places=4)
    unit_original = models.CharField(max_length=50)
    value_original = models.DecimalField(max_digits=18, decimal_places=4)
    source_type = models.CharField(max_length=20, choices=IngestionRun.SOURCE_CHOICES)
    period_start = models.DateField()
    period_end = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    flag_reason = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_records')
    approved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"EmissionRecord {self.id} ({self.category} - {self.quantity_kg_co2e} kg CO2e)"

class AuditEvent(models.Model):
    record = models.ForeignKey(EmissionRecord, on_delete=models.CASCADE, related_name='audit_events')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='audit_events')
    action = models.CharField(max_length=50)
    note = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Audit {self.action} on Record {self.record_id} by {self.user.email}"
