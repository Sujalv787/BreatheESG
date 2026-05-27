import csv
import io
import math
from decimal import Decimal
import datetime

# Hardcoded airport coordinates database with 22 major international airports
AIRPORTS = {
    'LHR': (51.4700, -0.4543),
    'JFK': (40.6413, -73.7781),
    'LAX': (33.9416, -118.4085),
    'CDG': (49.0097, 2.5479),
    'FRA': (50.0333, 8.5705),
    'DXB': (25.2532, 55.3657),
    'SIN': (1.3644, 103.9915),
    'HND': (35.5494, 139.7798),
    'SYD': (-33.9461, 151.1772),
    'ORD': (41.9742, -87.9073),
    'PEK': (40.0799, 116.5871),
    'CAN': (23.3924, 113.2988),
    'AMS': (52.3105, 4.7683),
    'DEL': (28.5562, 77.1000),
    'BOM': (19.0896, 72.8656),
    'SFO': (37.6213, -122.3790),
    'ATL': (33.6407, -84.4277),
    'DFW': (32.8998, -97.0403),
    'DEN': (39.8561, -104.6737),
    'ICN': (37.4602, 126.4407),
    'MUC': (48.3538, 11.7861),
    'HKG': (22.3080, 113.9185),
}

def haversine_distance(origin, destination):
    """
    Computes great-circle distance between two airports using the Haversine formula.
    """
    code1 = origin.strip().upper()
    code2 = destination.strip().upper()
    
    if code1 not in AIRPORTS:
        raise ValueError(f"Origin airport '{origin}' not found in airport database.")
    if code2 not in AIRPORTS:
        raise ValueError(f"Destination airport '{destination}' not found in airport database.")
        
    lat1, lon1 = AIRPORTS[code1]
    lat2, lon2 = AIRPORTS[code2]
    
    R = 6371.0  # Earth radius in kilometers
    
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c

def parse_travel_csv(file_content):
    """
    Parses Concur-style Travel CSV.
    Columns: trip_id, traveler_email, travel_date, origin, destination, transport_type, distance_km, nights
    Returns: (list of record_dicts, list of parse_errors)
    """
    records = []
    parse_errors = []
    
    file_io = io.StringIO(file_content)
    reader = csv.DictReader(file_io)
    
    required_cols = {'trip_id', 'traveler_email', 'travel_date', 'origin', 'destination', 'transport_type', 'distance_km', 'nights'}
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
            # Parse traveler & trip info
            trip_id = row.get('trip_id')
            traveler = row.get('traveler_email')
            if not traveler:
                raise ValueError("Missing traveler email")
            
            # Parse travel date (support ISO YYYY-MM-DD)
            date_str = row.get('travel_date', '')
            if not date_str:
                raise ValueError("Missing travel date")
            try:
                travel_date = datetime.date.fromisoformat(date_str)
            except ValueError:
                # Support YYYY/MM/DD
                try:
                    travel_date = datetime.datetime.strptime(date_str, "%Y/%m/%d").date()
                except ValueError:
                    raise ValueError(f"Invalid travel date format: '{date_str}'")

            origin = row.get('origin', '')
            destination = row.get('destination', '')
            transport_type = row.get('transport_type', '').upper()
            
            valid_transports = {'FLIGHT', 'TRAIN', 'CAR', 'HOTEL'}
            if transport_type not in valid_transports:
                raise ValueError(f"Invalid transport type: '{transport_type}'")

            # Parse distance_km (nullable)
            dist_str = row.get('distance_km', '')
            distance_val = None
            if dist_str:
                try:
                    distance_val = Decimal(dist_str)
                except Exception:
                    raise ValueError(f"Invalid distance_km: '{dist_str}'")
                    
            # Parse nights (nullable)
            nights_str = row.get('nights', '')
            nights_val = None
            if nights_str:
                try:
                    nights_val = Decimal(nights_str)
                except Exception:
                    raise ValueError(f"Invalid nights count: '{nights_str}'")

            # Emission calculations based on transport type
            quantity_kg_co2e = Decimal('0.0')
            value_original = Decimal('0.0')
            unit_original = ''
            category = f"Business Travel ({transport_type.capitalize()})"
            description = f"Trip: {trip_id} | Traveler: {traveler} | Origin: {origin} | Dest: {destination}"
            
            # Distance logic for flight, train, car
            if transport_type == 'FLIGHT':
                if distance_val is None:
                    # Estimate distance using great circle
                    if not origin or not destination:
                        raise ValueError("Flight distance is missing and origin/destination are incomplete.")
                    distance_calc = haversine_distance(origin, destination)
                    distance_val = Decimal(str(round(distance_calc, 2)))
                    description += f" (Est. distance: {distance_val} km)"
                
                # factor: 0.255 kg/km
                quantity_kg_co2e = distance_val * Decimal('0.255')
                value_original = distance_val
                unit_original = 'km'
                
            elif transport_type == 'TRAIN':
                if distance_val is None:
                    raise ValueError("Distance is required for train travel")
                # factor: 0.041 kg/km
                quantity_kg_co2e = distance_val * Decimal('0.041')
                value_original = distance_val
                unit_original = 'km'
                
            elif transport_type == 'CAR':
                if distance_val is None:
                    raise ValueError("Distance is required for car travel")
                # factor: 0.171 kg/km
                quantity_kg_co2e = distance_val * Decimal('0.171')
                value_original = distance_val
                unit_original = 'km'
                
            elif transport_type == 'HOTEL':
                if nights_val is None:
                    raise ValueError("Nights count is required for hotel stays")
                # factor: 31.0 kg/night
                quantity_kg_co2e = nights_val * Decimal('31.0')
                value_original = nights_val
                unit_original = 'nights'
                category = "Business Travel (Hotel)"

            records.append({
                'row_number': idx,
                'scope': '3',
                'category': category,
                'description': description,
                'quantity_kg_co2e': quantity_kg_co2e,
                'unit_original': unit_original,
                'value_original': value_original,
                'source_type': 'TRAVEL',
                'period_start': travel_date,
                'period_end': travel_date,
                'status': 'PENDING',
                'flag_reason': None,
                'raw_data': row,
            })
            
        except Exception as e:
            parse_errors.append({
                'row_number': idx,
                'error': str(e),
                'raw_data': row,
            })
            
    return records, parse_errors
