from rest_framework import viewsets, status, permissions
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, JSONParser
from django.db import transaction
from django.utils import timezone
from django.db.models import Sum, Count
from django.contrib.auth import get_user_model

from ingestion.models import Tenant, IngestionRun, RawRow, EmissionRecord, AuditEvent
from ingestion.serializers import (
    IngestionRunSerializer, EmissionRecordSerializer, RawRowSerializer
)
from ingestion.parsers.sap import parse_sap_csv
from ingestion.parsers.utility import parse_utility_csv
from ingestion.parsers.travel import parse_travel_csv

User = get_user_model()


# ─── Helpers ────────────────────────────────────────────────────────────────

def _run_ingestion(request, source_type, parser_func):
    """Shared logic for all three ingest endpoints."""
    if 'file' not in request.FILES:
        return Response({'error': 'No file uploaded. Use key "file".'}, status=status.HTTP_400_BAD_REQUEST)

    tenant = getattr(request.user, 'tenant', None)
    if not tenant:
        return Response({'error': 'User has no tenant assigned.'}, status=status.HTTP_403_FORBIDDEN)

    uploaded_file = request.FILES['file']
    try:
        file_content = uploaded_file.read().decode('utf-8-sig')
    except Exception as e:
        return Response({'error': f'Cannot read file: {e}'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        with transaction.atomic():
            run = IngestionRun.objects.create(
                tenant=tenant,
                source_type=source_type,
                uploaded_by=request.user,
                file_name=uploaded_file.name,
                status='PROCESSING',
            )

            records_data, parse_errors = parser_func(file_content)

            saved = 0
            errored = 0

            for item in records_data:
                row_num  = item.pop('row_number')
                raw_data = item.pop('raw_data')
                raw_row = RawRow.objects.create(
                    tenant=tenant, run=run,
                    row_number=row_num, raw_data=raw_data, parse_error=None,
                )
                EmissionRecord.objects.create(tenant=tenant, run=run, raw_row=raw_row, **item)
                saved += 1

            for err in parse_errors:
                RawRow.objects.create(
                    tenant=tenant, run=run,
                    row_number=err.get('row_number', 0),
                    raw_data=err.get('raw_data', {}),
                    parse_error=err.get('error', 'Unknown error'),
                )
                errored += 1

            run.row_count   = saved + errored
            run.error_count = errored
            run.status      = 'DONE' if saved > 0 else 'FAILED'
            run.save()

        return Response(IngestionRunSerializer(run).data, status=status.HTTP_201_CREATED)

    except Exception as e:
        return Response({'error': f'Ingestion failed: {e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ─── Ingest Views ────────────────────────────────────────────────────────────

class IngestSAPView(APIView):
    parser_classes = [MultiPartParser]
    def post(self, request):
        return _run_ingestion(request, 'SAP', parse_sap_csv)

class IngestUtilityView(APIView):
    parser_classes = [MultiPartParser]
    def post(self, request):
        return _run_ingestion(request, 'UTILITY', parse_utility_csv)

class IngestTravelView(APIView):
    parser_classes = [MultiPartParser]
    def post(self, request):
        return _run_ingestion(request, 'TRAVEL', parse_travel_csv)


# ─── Ingestion Run ViewSet ───────────────────────────────────────────────────

class IngestionRunViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = IngestionRunSerializer

    def get_queryset(self):
        qs = IngestionRun.objects.all().order_by('-created_at')
        source_type = self.request.query_params.get('source_type')
        run_status  = self.request.query_params.get('status')
        if source_type: qs = qs.filter(source_type=source_type)
        if run_status:  qs = qs.filter(status=run_status)
        return qs

    @action(detail=True, methods=['get'], url_path='errors')
    def errors(self, request, pk=None):
        run = self.get_object()
        rows = RawRow.objects.filter(run=run, parse_error__isnull=False).exclude(parse_error='')
        return Response(RawRowSerializer(rows, many=True).data)


# ─── Emission Record ViewSet ─────────────────────────────────────────────────

class EmissionRecordViewSet(viewsets.ModelViewSet):
    serializer_class = EmissionRecordSerializer
    parser_classes   = [JSONParser, MultiPartParser]
    http_method_names = ['get', 'patch', 'post', 'head', 'options']

    def get_queryset(self):
        qs = EmissionRecord.objects.select_related(
            'raw_row', 'approved_by', 'run'
        ).prefetch_related('audit_events__user').order_by('-created_at')

        for param in ('status', 'scope', 'source_type'):
            val = self.request.query_params.get(param)
            if val: qs = qs.filter(**{param: val})

        run = self.request.query_params.get('run')
        if run: qs = qs.filter(run_id=run)

        return qs

    def partial_update(self, request, *args, **kwargs):
        """PATCH /api/records/{id}/ — update status + write audit event."""
        record     = self.get_object()
        old_status = record.status
        new_status = request.data.get('status', old_status)
        note       = request.data.get('note', '')
        flag_reason= request.data.get('flag_reason', '')

        allowed = {'PENDING', 'APPROVED', 'REJECTED', 'FLAGGED'}
        if new_status not in allowed:
            return Response({'error': f'Invalid status "{new_status}".'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            record.status = new_status

            if new_status == 'APPROVED':
                record.approved_by  = request.user
                record.approved_at  = timezone.now()
                record.flag_reason  = None
            elif new_status == 'FLAGGED':
                if not flag_reason.strip():
                    return Response({'error': 'flag_reason is required when flagging.'}, status=status.HTTP_400_BAD_REQUEST)
                record.flag_reason  = flag_reason
                record.approved_by  = None
                record.approved_at  = None
            else:
                record.approved_by  = None
                record.approved_at  = None

            record.save()

            if old_status != new_status:
                AuditEvent.objects.create(
                    record=record,
                    user=request.user,
                    action=new_status,
                    note=note or f'Status changed from {old_status} to {new_status}.',
                )

        # Re-fetch with prefetch so audit_events are included in response
        record = EmissionRecord.objects.select_related(
            'raw_row', 'approved_by', 'run'
        ).prefetch_related('audit_events__user').get(pk=record.pk)
        return Response(EmissionRecordSerializer(record).data)

    @action(detail=False, methods=['post'], url_path='bulk-approve', parser_classes=[JSONParser])
    def bulk_approve(self, request):
        ids  = request.data.get('ids', [])
        note = request.data.get('note', 'Bulk approved.')
        if not ids:
            return Response({'error': 'No ids provided.'}, status=status.HTTP_400_BAD_REQUEST)

        tenant = getattr(request.user, 'tenant', None)
        with transaction.atomic():
            records = EmissionRecord.objects.filter(id__in=ids)
            if tenant:
                records = records.filter(tenant=tenant)
            updated = 0
            for rec in records:
                if rec.status != 'APPROVED':
                    rec.status      = 'APPROVED'
                    rec.approved_by = request.user
                    rec.approved_at = timezone.now()
                    rec.flag_reason = None
                    rec.save()
                    AuditEvent.objects.create(record=rec, user=request.user, action='APPROVED', note=note)
                    updated += 1

        return Response({'message': f'Approved {updated} record(s).'})

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        qs = self.get_queryset()

        scope_data = {s: 0.0 for s in ('1', '2', '3')}
        for row in qs.values('scope').annotate(total=Sum('quantity_kg_co2e')):
            if row['scope'] in scope_data:
                scope_data[row['scope']] = float(row['total'] or 0)

        status_data = {s: 0 for s in ('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED')}
        total = 0
        for row in qs.values('status').annotate(count=Count('id')):
            if row['status'] in status_data:
                status_data[row['status']] = row['count']
                total += row['count']

        return Response({
            'total_records':       total,
            'total_co2e_overall':  sum(scope_data.values()),
            'by_scope':            scope_data,
            'by_status':           status_data,
        })
