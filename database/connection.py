from arango import ArangoClient
import os
import sys

ARANGO_HOST = os.getenv("ARANGO_HOST", "http://localhost:8529")
ARANGO_USER = os.getenv("ARANGO_USER", "root")
ARANGO_PASSWORD = os.getenv("ARANGO_PASSWORD", "skyscholar_dev_password")
DB_NAME = "skyscholar_data"

COLLECTION_FLIGHTS = "flights"
COLLECTION_TELEMETRY = "telemetry"
COLLECTION_STATIONS = "ground_stations"
COLLECTION_INVENTORY = "inventory_items"
COLLECTION_PAYLOAD_SCHEMAS = "payload_schemas"
COLLECTION_AUDIT_EVENTS = "audit_events"
COLLECTION_FLIGHT_PLANS = "flight_plans"

EDGE_STATION_INVENTORY = "station_inventory"
EDGE_FLIGHT_TELEMETRY = "flight_telemetry"
EDGE_FLIGHT_PAYLOAD = "flight_payload"

STANDARD_PRESSURE_LEVELS = [
    {"level_id": "surface", "name": "Surface", "pressure_hpa": None, "altitude_approx_m": 0},
    {"level_id": "1000hpa", "name": "1000 hPa", "pressure_hpa": 1000, "altitude_approx_m": 110},
    {"level_id": "925hpa", "name": "925 hPa", "pressure_hpa": 925, "altitude_approx_m": 800},
    {"level_id": "850hpa", "name": "850 hPa", "pressure_hpa": 850, "altitude_approx_m": 1500},
    {"level_id": "700hpa", "name": "700 hPa", "pressure_hpa": 700, "altitude_approx_m": 3000},
    {"level_id": "600hpa", "name": "600 hPa", "pressure_hpa": 600, "altitude_approx_m": 4200},
    {"level_id": "500hpa", "name": "500 hPa", "pressure_hpa": 500, "altitude_approx_m": 5600},
    {"level_id": "400hpa", "name": "400 hPa", "pressure_hpa": 400, "altitude_approx_m": 7200},
    {"level_id": "300hpa", "name": "300 hPa", "pressure_hpa": 300, "altitude_approx_m": 9200},
    {"level_id": "250hpa", "name": "250 hPa", "pressure_hpa": 250, "altitude_approx_m": 10400},
    {"level_id": "200hpa", "name": "200 hPa", "pressure_hpa": 200, "altitude_approx_m": 11800},
    {"level_id": "150hpa", "name": "150 hPa", "pressure_hpa": 150, "altitude_approx_m": 13600},
    {"level_id": "100hpa", "name": "100 hPa", "pressure_hpa": 100, "altitude_approx_m": 16200},
    {"level_id": "70hpa", "name": "70 hPa", "pressure_hpa": 70, "altitude_approx_m": 18400},
    {"level_id": "50hpa", "name": "50 hPa", "pressure_hpa": 50, "altitude_approx_m": 20600},
    {"level_id": "30hpa", "name": "30 hPa", "pressure_hpa": 30, "altitude_approx_m": 23800},
    {"level_id": "20hpa", "name": "20 hPa", "pressure_hpa": 20, "altitude_approx_m": 26500},
    {"level_id": "10hpa", "name": "10 hPa", "pressure_hpa": 10, "altitude_approx_m": 31000},
]

GRAPH_NAME = "skyscholar_graph"

DOCUMENT_COLLECTIONS = [
    COLLECTION_FLIGHTS,
    COLLECTION_TELEMETRY,
    COLLECTION_STATIONS,
    COLLECTION_INVENTORY,
    COLLECTION_PAYLOAD_SCHEMAS,
    COLLECTION_AUDIT_EVENTS,
    COLLECTION_FLIGHT_PLANS,
]

EDGE_COLLECTIONS = [
    EDGE_STATION_INVENTORY,
    EDGE_FLIGHT_TELEMETRY,
    EDGE_FLIGHT_PAYLOAD,
]

client = None
db = None


def connect_db():
    global client, db
    try:
        client = ArangoClient(hosts=ARANGO_HOST)

        sys_db = client.db("_system", username=ARANGO_USER, password=ARANGO_PASSWORD)

        if not sys_db.has_database(DB_NAME):
            sys_db.create_database(DB_NAME)

        db = client.db(DB_NAME, username=ARANGO_USER, password=ARANGO_PASSWORD)

        for col_name in DOCUMENT_COLLECTIONS:
            if not db.has_collection(col_name):
                db.create_collection(col_name)

        for edge_name in EDGE_COLLECTIONS:
            if not db.has_collection(edge_name):
                db.create_collection(edge_name, edge=True)

        _ensure_graph(db)
        _ensure_indexes(db)

        print(f"Connected to ArangoDB at {ARANGO_HOST}, database: {DB_NAME}", flush=True)
        return True
    except Exception as e:
        print(f"ArangoDB connection failed: {e}", file=sys.stderr, flush=True)
        return False


def _ensure_graph(db):
    new_edge_definitions = [
        {
            "edge_collection": EDGE_STATION_INVENTORY,
            "from_vertex_collections": [COLLECTION_STATIONS],
            "to_vertex_collections": [COLLECTION_INVENTORY],
        },
        {
            "edge_collection": EDGE_FLIGHT_TELEMETRY,
            "from_vertex_collections": [COLLECTION_FLIGHTS],
            "to_vertex_collections": [COLLECTION_TELEMETRY],
        },
        {
            "edge_collection": EDGE_FLIGHT_PAYLOAD,
            "from_vertex_collections": [COLLECTION_FLIGHTS],
            "to_vertex_collections": [COLLECTION_PAYLOAD_SCHEMAS],
        },
    ]
    if not db.has_graph(GRAPH_NAME):
        db.create_graph(GRAPH_NAME, edge_definitions=new_edge_definitions)
        return
    graph = db.graph(GRAPH_NAME)
    existing_edges = {ed["edge_collection"] for ed in graph.edge_definitions()}
    for edge_def in new_edge_definitions:
        if edge_def["edge_collection"] not in existing_edges:
            graph.create_edge_definition(
                edge_collection=edge_def["edge_collection"],
                from_vertex_collections=edge_def["from_vertex_collections"],
                to_vertex_collections=edge_def["to_vertex_collections"],
            )


def _ensure_indexes(db):
    db.collection(COLLECTION_FLIGHTS).add_persistent_index(fields=["flight_id"], unique=True)
    db.collection(COLLECTION_STATIONS).add_persistent_index(fields=["station_id"], unique=True)
    db.collection(COLLECTION_PAYLOAD_SCHEMAS).add_persistent_index(fields=["schema_id"], unique=True)
    db.collection(COLLECTION_TELEMETRY).add_persistent_index(fields=["flight_id", "timestamp"])
    db.collection(COLLECTION_INVENTORY).add_persistent_index(fields=["station_id", "item_type"])
    db.collection(COLLECTION_AUDIT_EVENTS).add_persistent_index(fields=["event_id"], unique=True)
    db.collection(COLLECTION_AUDIT_EVENTS).add_persistent_index(fields=["seq"], unique=True)
    db.collection(COLLECTION_AUDIT_EVENTS).add_persistent_index(fields=["entity_type", "entity_id"])
    db.collection(COLLECTION_AUDIT_EVENTS).add_persistent_index(fields=["event_type"])
    db.collection(COLLECTION_FLIGHT_PLANS).add_persistent_index(fields=["plan_id"], unique=True)


def disconnect_db():
    global client, db
    client = None
    db = None


def get_db():
    return db
