import os
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction
from django.conf import settings
from django.utils import timezone

from ingestion.models import Tenant, IngestionRun, RawRow, EmissionRecord
from ingestion.parsers.sap import parse_sap_csv
from ingestion.parsers.utility import parse_utility_csv
from ingestion.parsers.travel import parse_travel_csv

User = get_user_model()

class Command(BaseCommand):
    help = "Seeds the database with a default Tenant, User, and loads/parses the three sample CSV files."

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Starting database seeding process..."))
        
        # 1. Create or get Tenant
        tenant, created = Tenant.objects.get_or_create(
            slug="demo",
            defaults={"name": "Breathe ESG Demo Tenant"}
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f"Created Tenant: '{tenant.name}'"))
        else:
            self.stdout.write(self.style.WARNING(f"Tenant '{tenant.name}' already exists"))

        # 2. Create or get Analyst User
        # We must use unfiltered manager because we don't have a thread-local tenant set yet
        user_email = "analyst@demo.com"
        user_pwd = "demo1234"
        
        analyst = User.unfiltered.filter(email=user_email).first()
        if not analyst:
            analyst = User.unfiltered.create_user(
                username="analyst",
                email=user_email,
                password=user_pwd,
                tenant=tenant,
                is_staff=True,
                is_superuser=True  # useful for admin access
            )
            self.stdout.write(self.style.SUCCESS(f"Created User: '{user_email}' with password '{user_pwd}'"))
        else:
            self.stdout.write(self.style.WARNING(f"User '{user_email}' already exists"))

        # 3. Seed Sample Files
        base_dir = settings.BASE_DIR
        sample_files = [
            ("SAP", "sample_sap.csv", parse_sap_csv),
            ("UTILITY", "sample_utility.csv", parse_utility_csv),
            ("TRAVEL", "sample_travel.csv", parse_travel_csv),
        ]
        
        for source_type, file_name, parser_func in sample_files:
            file_path = os.path.join(base_dir, "sample_data", file_name)
            
            if not os.path.exists(file_path):
                self.stdout.write(self.style.ERROR(f"Sample file not found at: {file_path}"))
                continue
                
            self.stdout.write(self.style.NOTICE(f"Ingesting '{file_name}' for {source_type}..."))
            
            try:
                # Read file contents
                with open(file_path, "r", encoding="utf-8-sig") as f:
                    file_content = f.read()
                    
                # Run ingestion within atomic transaction
                with transaction.atomic():
                    # Create IngestionRun
                    run = IngestionRun.objects.create(
                        tenant=tenant,
                        source_type=source_type,
                        uploaded_by=analyst,
                        file_name=file_name,
                        status='PROCESSING'
                    )
                    
                    # Parse CSV contents
                    records_data, parse_errors = parser_func(file_content)
                    
                    saved_records_count = 0
                    saved_errors_count = 0
                    
                    # Save successful rows
                    for item in records_data:
                        row_num = item.pop('row_number')
                        raw_row_data = item.pop('raw_data')
                        
                        raw_row = RawRow.objects.create(
                            tenant=tenant,
                            run=run,
                            row_number=row_num,
                            raw_data=raw_row_data,
                            parse_error=None
                        )
                        
                        EmissionRecord.objects.create(
                            tenant=tenant,
                            run=run,
                            raw_row=raw_row,
                            **item
                        )
                        saved_records_count += 1
                        
                    # Save error rows
                    for err in parse_errors:
                        row_num = err.get('row_number', 0)
                        err_msg = err.get('error', 'Unknown parsing error')
                        raw_row_data = err.get('raw_data', {})
                        
                        RawRow.objects.create(
                            tenant=tenant,
                            run=run,
                            row_number=row_num,
                            raw_data=raw_row_data,
                            parse_error=err_msg
                        )
                        saved_errors_count += 1
                        
                    # Update IngestionRun status
                    run.row_count = saved_records_count + saved_errors_count
                    run.error_count = saved_errors_count
                    run.status = 'DONE' if saved_records_count > 0 else 'FAILED'
                    run.save()
                    
                    self.stdout.write(self.style.SUCCESS(
                        f"  Successfully processed '{file_name}': "
                        f"{saved_records_count} records saved, {saved_errors_count} errors stored."
                    ))
                    
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  Failed to ingest '{file_name}': {str(e)}"))

        self.stdout.write(self.style.SUCCESS("Database seeding completed successfully!"))
