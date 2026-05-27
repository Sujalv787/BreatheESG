import csv
import io
from decimal import Decimal
import datetime

def parse_iso_date(date_str):
    date_str = date_str.strip()
    try:
        return datetime.date.fromisoformat(date_str)
    except ValueError:
        pass
    # Support datetime format if timezone is attached or T is present
    try:
        if 'T' in date_str:
            return datetime.datetime.strptime(date_str.split('T')[0], "%Y-%m-%d").date()
        return datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        pass
    raise ValueError(f"Invalid ISO date format: '{date_str}'")

def parse_utility_csv(file_content):
    """
    Parses Utility Portal CSV.
    Columns: meter_id, site_name, billing_period_start, billing_period_end, kwh_consumption, tariff_code, supplier
    Returns: (list of record_dicts, list of parse_errors)
    """
    records = []
    parse_errors = []
    
    file_io = io.StringIO(file_content)
    reader = csv.DictReader(file_io)
    
    required_cols = {'meter_id', 'site_name', 'billing_period_start', 'billing_period_end', 'kwh_consumption', 'tariff_code', 'supplier'}
    if reader.fieldnames:
        reader.fieldnames = [f.strip() for f in reader.fieldnames]
        missing = required_cols - set(reader.fieldnames)
        if missing:
            return [], [{'row_number': 0, 'error': f"Missing columns: {missing}", 'raw_data': {}}]
    else:
        return [], [{'row_number': 0, 'error': "CSV file is empty or headers are missing.", 'raw_data': {}}]

    for idx, row in enumerate(reader, start=1):
        row = {k: (v.strip() if v else '') for k, v in row.items()}
        try:
            # Parse kwh_consumption
            kwh_str = row.get('kwh_consumption', '0')
            try:
                kwh_val = Decimal(kwh_str)
            except Exception:
                raise ValueError(f"Invalid consumption 'kwh_consumption': '{kwh_str}'")
            
            # Parse dates
            start_str = row.get('billing_period_start', '')
            end_str = row.get('billing_period_end', '')
            if not start_str or not end_str:
                raise ValueError("Missing billing period dates")
            
            start_date = parse_iso_date(start_str)
            end_date = parse_iso_date(end_str)
            
            if start_date > end_date:
                raise ValueError(f"Start date '{start_date}' is after end date '{end_date}'")

            # Check billing period length (days)
            duration_days = (end_date - start_date).days
            flagged = False
            flag_reason = None
            if duration_days < 25 or duration_days > 35:
                flagged = True
                flag_reason = f"Non-standard billing period of {duration_days} days (expected 25-35 days)"
            
            # Convert kWh -> kg CO2e using factor 0.20707
            factor = Decimal('0.20707')
            quantity_kg_co2e = kwh_val * factor
            
            meter_id = row.get('meter_id')
            site_name = row.get('site_name')
            supplier = row.get('supplier')
            tariff = row.get('tariff_code')
            
            records.append({
                'row_number': idx,
                'scope': '2',
                'category': 'Electricity Consumption',
                'description': f"Meter: {meter_id} | Site: {site_name} | Supplier: {supplier} | Tariff: {tariff}",
                'quantity_kg_co2e': quantity_kg_co2e,
                'unit_original': 'kWh',
                'value_original': kwh_val,
                'source_type': 'UTILITY',
                'period_start': start_date,
                'period_end': end_date,
                'status': 'FLAGGED' if flagged else 'PENDING',
                'flag_reason': flag_reason,
                'raw_data': row,
            })
            
        except Exception as e:
            parse_errors.append({
                'row_number': idx,
                'error': str(e),
                'raw_data': row,
            })
            
    return records, parse_errors
