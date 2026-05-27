import csv
import io
from decimal import Decimal
import datetime

def parse_sap_date(date_str):
    date_str = date_str.strip()
    # Handle YYYYMMDD
    try:
        return datetime.datetime.strptime(date_str, "%Y%m%d").date()
    except ValueError:
        pass
    # Handle DD.MM.YYYY
    try:
        return datetime.datetime.strptime(date_str, "%d.%m.%Y").date()
    except ValueError:
        pass
    raise ValueError(f"Invalid SAP date format: '{date_str}'")

def parse_sap_csv(file_content):
    """
    Parses SAP Flat File CSV.
    Columns: WERKS, MATNR, MENGE, MEINS, BUDAT, KOSTL, TXZ01
    Returns: (list of record_dicts, list of parse_errors)
    """
    records = []
    parse_errors = []
    
    # Read the file using standard csv reader
    file_io = io.StringIO(file_content)
    reader = csv.DictReader(file_io)
    
    # Check for empty files or missing columns
    required_cols = {'WERKS', 'MATNR', 'MENGE', 'MEINS', 'BUDAT', 'KOSTL', 'TXZ01'}
    if reader.fieldnames:
        # Strip whitespace from headers
        reader.fieldnames = [f.strip() for f in reader.fieldnames]
        missing = required_cols - set(reader.fieldnames)
        if missing:
            return [], [{'row_number': 0, 'error': f"Missing columns: {missing}", 'raw_data': {}}]
    else:
        return [], [{'row_number': 0, 'error': "CSV file is empty or headers are missing.", 'raw_data': {}}]

    for idx, row in enumerate(reader, start=1):
        # Strip whitespace from values
        row = {k: (v.strip() if v else '') for k, v in row.items()}
        try:
            # Parse quantity (MENGE)
            menge_str = row.get('MENGE', '0')
            try:
                value_original = Decimal(menge_str)
            except Exception:
                raise ValueError(f"Invalid quantity value 'MENGE': '{menge_str}'")

            # Parse date (BUDAT)
            budat_str = row.get('BUDAT', '')
            if not budat_str:
                raise ValueError("Missing posting date 'BUDAT'")
            posting_date = parse_sap_date(budat_str)

            # Analyze units (MEINS)
            unit = row.get('MEINS', '').upper()
            description = row.get('TXZ01', '')
            desc_lower = description.lower()
            
            # Determine material density & emission factors
            density = Decimal('1.0')
            emission_factor = Decimal('0.5') # default Scope 3 factor (procurement)
            scope = '3'
            category = 'Purchased Goods and Services'
            flagged = False
            flag_reason = None
            
            # Density & Scope mapping based on description
            is_fuel = False
            if 'diesel' in desc_lower:
                density = Decimal('0.835')
                emission_factor = Decimal('2.68') # Scope 1 factor
                scope = '1'
                category = 'Fuel Combustion (Diesel)'
                is_fuel = True
            elif 'petrol' in desc_lower or 'gasoline' in desc_lower:
                density = Decimal('0.745')
                emission_factor = Decimal('2.31') # Scope 1 factor
                scope = '1'
                category = 'Fuel Combustion (Petrol)'
                is_fuel = True
            elif any(k in desc_lower for k in ['fuel', 'oil', 'gas']):
                density = Decimal('1.0')
                emission_factor = Decimal('2.50') # default fuel factor
                scope = '1'
                category = 'Fuel Combustion (Other)'
                is_fuel = True
            
            # Check unit (MEINS) unrecognized or convert L to kg
            recognized_units = {'L', 'LIT', 'LTR', 'KG', 'KILOGRAM'}
            quantity_kg = value_original
            
            if unit not in recognized_units:
                flagged = True
                flag_reason = f"Unrecognized unit: '{unit}'"
            elif unit in {'L', 'LIT', 'LTR'}:
                quantity_kg = value_original * density
            
            # Compute emissions
            quantity_kg_co2e = quantity_kg * emission_factor
            
            records.append({
                'row_number': idx,
                'scope': scope,
                'category': category,
                'description': f"WERKS: {row.get('WERKS')} | MATNR: {row.get('MATNR')} | {description}",
                'quantity_kg_co2e': quantity_kg_co2e,
                'unit_original': row.get('MEINS'),
                'value_original': value_original,
                'source_type': 'SAP',
                'period_start': posting_date,
                'period_end': posting_date,
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
