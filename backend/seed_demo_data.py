"""Idempotently seed synthetic Indian healthcare records into the configured MongoDB."""

import app


LEGACY_DEMO_IDS = {
    'patients': ['PT-2048', 'PT-2049', 'PT-2050', 'PT-2051', 'PT-2052', 'PT-2053'],
    'doctors': ['DR-1001', 'DR-1002', 'DR-1003', 'DR-1004'],
    'appointments': ['AP-3001', 'AP-3002', 'AP-3003', 'AP-3004', 'AP-3005'],
    'users': ['demo-user'],
}

SEED_RECORDS = {
    'patients': app.SEED_PATIENTS,
    'doctors': app.SEED_DOCTORS,
    'appointments': app.SEED_APPOINTMENTS,
    'diseases': app.SEED_DISEASES,
    'users': app.SEED_USERS,
    'search_history': app.SEED_SEARCH_HISTORY,
}


def seed_demo_data():
    app.ensure_database()
    for collection_name, document_ids in LEGACY_DEMO_IDS.items():
        app.database[collection_name].delete_many({'id': {'$in': document_ids}})

    totals = {}
    for collection_name, seed_records in SEED_RECORDS.items():
        collection = app.database[collection_name]
        for record in seed_records:
            collection.replace_one({'id': record['id']}, record, upsert=True)
        totals[collection_name] = collection.count_documents({})

    for patient in app.SEED_PATIENTS:
        assessment_id = f"ASSESS-DEMO-{patient['id']}"
        assessment = app.database.assessments.find_one({'id': assessment_id}, {'_id': 0})
        if assessment is None:
            continue
        assessment.update({'patientId': patient['id'], 'patientName': patient['name'], 'demoRecord': True})
        app.database.assessments.replace_one({'id': assessment_id}, assessment, upsert=True)
    totals['assessments'] = app.database.assessments.count_documents({})
    totals['model_performance'] = app.database.model_performance.count_documents({})
    return totals


if __name__ == '__main__':
    app.ensure_database()
    counts = seed_demo_data()
    print(f"Seeded MongoDB database '{app.MONGODB_DATABASE}': {counts}")
