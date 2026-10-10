import os
import re
import secrets
import uuid
from hashlib import sha256
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
from dotenv import load_dotenv
from flask import Flask, g, jsonify, request
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / '.env')
MODEL_PATH = ROOT_DIR / 'ml' / 'heart_model.pkl'
MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://127.0.0.1:27017')
MONGODB_DATABASE = os.getenv('MONGODB_DATABASE', 'healthpilot')
configured_origins = os.getenv(
    'FRONTEND_ORIGINS',
    os.getenv('FRONTEND_ORIGIN', 'http://localhost:4173,http://localhost:5173,http://127.0.0.1:5173'),
)
FRONTEND_ORIGINS = {origin.strip().rstrip('/') for origin in configured_origins.split(',') if origin.strip()}
SESSION_TTL_HOURS = 12

PAGE_IDS = (
    'overview', 'patients', 'diseases', 'doctors', 'staff', 'appointments', 'hospital-info',
    'add-record', 'analytics', 'ml-assessment', 'model-performance', 'settings',
)
LEGACY_ADMIN_PAGE_IDS = tuple(page for page in PAGE_IDS if page != 'staff')
ROLE_PAGES = {
    'patient': ('appointments', 'hospital-info', 'doctors', 'settings'),
    'doctor': ('patients', 'diseases', 'appointments', 'ml-assessment', 'model-performance'),
    'staff': ('overview', 'patients', 'doctors', 'appointments', 'add-record', 'analytics'),
    'admin': PAGE_IDS,
}
VALID_ROLES = tuple(ROLE_PAGES)
NOTEBOOK_MODEL_PERFORMANCE = {
    'model': 'Logistic Regression',
    'accuracy': 0.8852459016393442,
    'precision': 0.8387096774193549,
    'recall': 0.9285714285714286,
    'f1': 0.8813559322033898,
    'rocAuc': 0.9664502164502166,
    'rocCurve': [
        {'fpr': 0.0, 'tpr': 0.0},
        {'fpr': 0.0, 'tpr': 0.035714},
        {'fpr': 0.0, 'tpr': 0.642857},
        {'fpr': 0.030303, 'tpr': 0.642857},
        {'fpr': 0.030303, 'tpr': 0.785714},
        {'fpr': 0.060606, 'tpr': 0.785714},
        {'fpr': 0.060606, 'tpr': 0.892857},
        {'fpr': 0.151515, 'tpr': 0.892857},
        {'fpr': 0.151515, 'tpr': 0.928571},
        {'fpr': 0.181818, 'tpr': 0.928571},
        {'fpr': 0.181818, 'tpr': 0.964286},
        {'fpr': 0.30303, 'tpr': 0.964286},
        {'fpr': 0.30303, 'tpr': 1.0},
        {'fpr': 1.0, 'tpr': 1.0},
    ],
    'confusionMatrix': [[28, 5], [2, 26]],
    'datasetSize': 303,
    'testSize': 61,
    'evaluation': 'Stratified 80/20 train-test split, random_state=42',
    'source': 'notebooks/heart_disease_analysis.ipynb',
    'modelComparisons': [
        {'model': 'Logistic Regression', 'accuracy': 0.885246, 'precision': 0.838710, 'recall': 0.928571, 'f1': 0.881356, 'rocAuc': 0.966450},
        {'model': 'KNN', 'accuracy': 0.885246, 'precision': 0.862069, 'recall': 0.892857, 'f1': 0.877193},
        {'model': 'Naive Bayes', 'accuracy': 0.721311, 'precision': 0.641026, 'recall': 0.892857, 'f1': 0.746269},
        {'model': 'Decision Tree', 'accuracy': 0.737705, 'precision': 0.676471, 'recall': 0.821429, 'f1': 0.741935},
        {'model': 'Random Forest', 'accuracy': 0.868852, 'precision': 0.812500, 'recall': 0.928571, 'f1': 0.866667, 'rocAuc': 0.942641},
    ],
}

mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=3000)
database = mongo_client[MONGODB_DATABASE]

model = joblib.load(MODEL_PATH)
model_feature_order = list(getattr(model, 'feature_names_in_', [
    'age', 'sex', 'cp', 'trestbps', 'chol', 'fbs', 'restecg', 'thalach', 'exang',
    'oldpeak', 'slope', 'ca', 'thal'
]))

SEED_PATIENTS = [
    {'id': 'PT-IN-0001', 'name': 'Aarav Sharma', 'age': 52, 'city': 'Delhi', 'gender': 'Male', 'bloodGroup': 'B+', 'status': 'Monitoring', 'lastVisit': '2026-10-08', 'risk': 'Medium', 'conditions': ['hypertension'], 'demoRecord': True},
    {'id': 'PT-IN-0002', 'name': 'Ananya Iyer', 'age': 46, 'city': 'Chennai', 'gender': 'Female', 'bloodGroup': 'O+', 'status': 'Stable', 'lastVisit': '2026-10-05', 'risk': 'Low', 'conditions': ['type-2-diabetes'], 'demoRecord': True},
    {'id': 'PT-IN-0003', 'name': 'Rohan Mehta', 'age': 64, 'city': 'Mumbai', 'gender': 'Male', 'bloodGroup': 'A+', 'status': 'Monitoring', 'lastVisit': '2026-10-07', 'risk': 'High', 'conditions': ['coronary-artery-disease', 'hypertension'], 'demoRecord': True},
    {'id': 'PT-IN-0004', 'name': 'Priya Nair', 'age': 37, 'city': 'Kochi', 'gender': 'Female', 'bloodGroup': 'AB+', 'status': 'Stable', 'lastVisit': '2026-10-01', 'risk': 'Low', 'conditions': ['asthma'], 'demoRecord': True},
    {'id': 'PT-IN-0005', 'name': 'Vikram Reddy', 'age': 58, 'city': 'Hyderabad', 'gender': 'Male', 'bloodGroup': 'O-', 'status': 'Monitoring', 'lastVisit': '2026-10-09', 'risk': 'Medium', 'conditions': ['chronic-kidney-disease', 'type-2-diabetes'], 'demoRecord': True},
    {'id': 'PT-IN-0006', 'name': 'Kavya Desai', 'age': 29, 'city': 'Ahmedabad', 'gender': 'Female', 'bloodGroup': 'B-', 'status': 'Stable', 'lastVisit': '2026-09-29', 'risk': 'Low', 'conditions': ['iron-deficiency-anemia'], 'demoRecord': True},
    {'id': 'PT-IN-0007', 'name': 'Arjun Banerjee', 'age': 71, 'city': 'Kolkata', 'gender': 'Male', 'bloodGroup': 'A-', 'status': 'Critical', 'lastVisit': '2026-10-10', 'risk': 'High', 'conditions': ['coronary-artery-disease', 'chronic-obstructive-pulmonary-disease'], 'demoRecord': True},
    {'id': 'PT-IN-0008', 'name': 'Meera Kulkarni', 'age': 43, 'city': 'Pune', 'gender': 'Female', 'bloodGroup': 'AB-', 'status': 'Monitoring', 'lastVisit': '2026-10-06', 'risk': 'Medium', 'conditions': ['hypothyroidism'], 'demoRecord': True},
    {'id': 'PT-IN-0009', 'name': 'Ishaan Verma', 'age': 34, 'city': 'Jaipur', 'gender': 'Male', 'bloodGroup': 'O+', 'status': 'Stable', 'lastVisit': '2026-10-03', 'risk': 'Low', 'conditions': ['asthma'], 'demoRecord': True},
    {'id': 'PT-IN-0010', 'name': 'Sana Qureshi', 'age': 61, 'city': 'Lucknow', 'gender': 'Female', 'bloodGroup': 'B+', 'status': 'Monitoring', 'lastVisit': '2026-10-04', 'risk': 'Medium', 'conditions': ['hypertension', 'type-2-diabetes'], 'demoRecord': True},
    {'id': 'PT-IN-0011', 'name': 'Dev Patel', 'age': 55, 'city': 'Surat', 'gender': 'Male', 'bloodGroup': 'A+', 'status': 'Stable', 'lastVisit': '2026-09-30', 'risk': 'Low', 'conditions': ['iron-deficiency-anemia'], 'demoRecord': True},
    {'id': 'PT-IN-0012', 'name': 'Nisha Thomas', 'age': 48, 'city': 'Bengaluru', 'gender': 'Female', 'bloodGroup': 'O-', 'status': 'Monitoring', 'lastVisit': '2026-10-09', 'risk': 'Medium', 'conditions': ['type-2-diabetes', 'hypothyroidism'], 'demoRecord': True},
]

SEED_DOCTORS = [
    {'id': 'DR-IN-0001', 'name': 'Dr. Aditi Rao', 'specialty': 'Cardiology', 'department': 'Heart Health', 'city': 'Bengaluru', 'availability': 'Available', 'demoRecord': True},
    {'id': 'DR-IN-0002', 'name': 'Dr. Kabir Malhotra', 'specialty': 'Endocrinology', 'department': 'Metabolic Health', 'city': 'Delhi', 'availability': 'Available', 'demoRecord': True},
    {'id': 'DR-IN-0003', 'name': 'Dr. Meenakshi Iyer', 'specialty': 'General Medicine', 'department': 'Primary Care', 'city': 'Chennai', 'availability': 'On rounds', 'demoRecord': True},
    {'id': 'DR-IN-0004', 'name': 'Dr. Sameer Kulkarni', 'specialty': 'Nephrology', 'department': 'Kidney Care', 'city': 'Pune', 'availability': 'Available', 'demoRecord': True},
    {'id': 'DR-IN-0005', 'name': 'Dr. Farah Khan', 'specialty': 'Pulmonology', 'department': 'Respiratory Care', 'city': 'Hyderabad', 'availability': 'Consulting', 'demoRecord': True},
    {'id': 'DR-IN-0006', 'name': 'Dr. Arvind Mukherjee', 'specialty': 'Diagnostics', 'department': 'Imaging', 'city': 'Kolkata', 'availability': 'Available', 'demoRecord': True},
    {'id': 'DR-IN-0007', 'name': 'Dr. Neha Desai', 'specialty': 'Family Medicine', 'department': 'Primary Care', 'city': 'Ahmedabad', 'availability': 'Available', 'demoRecord': True},
    {'id': 'DR-IN-0008', 'name': 'Dr. Joseph Mathew', 'specialty': 'Internal Medicine', 'department': 'General Medicine', 'city': 'Kochi', 'availability': 'On rounds', 'demoRecord': True},
]

SEED_APPOINTMENTS = [
    {'id': 'AP-IN-0001', 'patient': 'Aarav Sharma', 'date': '2026-10-12', 'time': '09:00', 'doctor': 'Dr. Meenakshi Iyer', 'status': 'Confirmed', 'reason': 'Blood pressure follow-up', 'demoRecord': True},
    {'id': 'AP-IN-0002', 'patient': 'Ananya Iyer', 'date': '2026-10-12', 'time': '10:30', 'doctor': 'Dr. Kabir Malhotra', 'status': 'Confirmed', 'reason': 'Diabetes review', 'demoRecord': True},
    {'id': 'AP-IN-0003', 'patient': 'Rohan Mehta', 'date': '2026-10-13', 'time': '11:15', 'doctor': 'Dr. Aditi Rao', 'status': 'Pending', 'reason': 'Cardiology consultation', 'demoRecord': True},
    {'id': 'AP-IN-0004', 'patient': 'Priya Nair', 'date': '2026-10-13', 'time': '14:00', 'doctor': 'Dr. Farah Khan', 'status': 'Confirmed', 'reason': 'Asthma review', 'demoRecord': True},
    {'id': 'AP-IN-0005', 'patient': 'Vikram Reddy', 'date': '2026-10-14', 'time': '09:45', 'doctor': 'Dr. Sameer Kulkarni', 'status': 'Confirmed', 'reason': 'Kidney function follow-up', 'demoRecord': True},
    {'id': 'AP-IN-0006', 'patient': 'Kavya Desai', 'date': '2026-10-14', 'time': '13:30', 'doctor': 'Dr. Neha Desai', 'status': 'Rescheduled', 'reason': 'Anemia review', 'demoRecord': True},
    {'id': 'AP-IN-0007', 'patient': 'Arjun Banerjee', 'date': '2026-10-15', 'time': '10:00', 'doctor': 'Dr. Aditi Rao', 'status': 'Pending', 'reason': 'Cardiology follow-up', 'demoRecord': True},
    {'id': 'AP-IN-0008', 'patient': 'Meera Kulkarni', 'date': '2026-10-16', 'time': '15:00', 'doctor': 'Dr. Meenakshi Iyer', 'status': 'Confirmed', 'reason': 'Thyroid panel review', 'demoRecord': True},
    {'id': 'AP-IN-0009', 'patient': 'Ishaan Verma', 'date': '2026-10-19', 'time': '09:30', 'doctor': 'Dr. Farah Khan', 'status': 'Confirmed', 'reason': 'Respiratory checkup', 'demoRecord': True},
    {'id': 'AP-IN-0010', 'patient': 'Sana Qureshi', 'date': '2026-10-20', 'time': '12:00', 'doctor': 'Dr. Kabir Malhotra', 'status': 'Pending', 'reason': 'Metabolic health follow-up', 'demoRecord': True},
]

SEED_DISEASES = [
    {'id': 'hypertension', 'name': 'Hypertension', 'category': 'Cardiovascular', 'description': 'Persistently elevated blood pressure requiring clinical assessment and follow-up.', 'demoRecord': True},
    {'id': 'coronary-artery-disease', 'name': 'Coronary artery disease', 'category': 'Cardiovascular', 'description': 'Reduced blood flow to the heart muscle due to coronary artery narrowing.', 'demoRecord': True},
    {'id': 'type-2-diabetes', 'name': 'Type 2 diabetes', 'category': 'Endocrine', 'description': 'Chronic condition affecting blood glucose regulation; diagnosis requires clinical testing.', 'demoRecord': True},
    {'id': 'asthma', 'name': 'Asthma', 'category': 'Respiratory', 'description': 'Inflammatory airway condition with variable respiratory symptoms.', 'demoRecord': True},
    {'id': 'chronic-kidney-disease', 'name': 'Chronic kidney disease', 'category': 'Renal', 'description': 'Long-term reduction in kidney function requiring ongoing clinical monitoring.', 'demoRecord': True},
    {'id': 'iron-deficiency-anemia', 'name': 'Iron-deficiency anemia', 'category': 'Hematology', 'description': 'Low iron affecting hemoglobin production; requires appropriate clinical evaluation.', 'demoRecord': True},
    {'id': 'hypothyroidism', 'name': 'Hypothyroidism', 'category': 'Endocrine', 'description': 'Reduced thyroid hormone production, assessed with clinical history and laboratory tests.', 'demoRecord': True},
    {'id': 'chronic-obstructive-pulmonary-disease', 'name': 'Chronic obstructive pulmonary disease', 'category': 'Respiratory', 'description': 'Chronic airflow limitation that requires clinician-led diagnosis and care.', 'demoRecord': True},
]

SEED_USERS = [
    {'id': 'USR-IN-0001', 'name': 'HealthPilot Demo Admin', 'email': 'admin@healthpilot.local', 'role': 'Administrator', 'demoRecord': True},
    {'id': 'USR-IN-0002', 'name': 'HealthPilot Demo Clinician', 'email': 'clinician@healthpilot.local', 'role': 'Clinician', 'demoRecord': True},
    {'id': 'USR-IN-0003', 'name': 'HealthPilot Demo Analyst', 'email': 'analyst@healthpilot.local', 'role': 'Analyst', 'demoRecord': True},
]

SEED_SEARCH_HISTORY = [
    {'id': 'SEARCH-DEMO-0001', 'userId': 'USR-IN-0001', 'query': 'hypertension', 'createdAt': '2026-10-09T10:00:00+00:00', 'demoRecord': True},
    {'id': 'SEARCH-DEMO-0002', 'userId': 'USR-IN-0002', 'query': 'cardiology', 'createdAt': '2026-10-09T11:30:00+00:00', 'demoRecord': True},
    {'id': 'SEARCH-DEMO-0003', 'userId': 'USR-IN-0003', 'query': 'Bengaluru', 'createdAt': '2026-10-10T08:15:00+00:00', 'demoRecord': True},
]


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def ensure_database():
    mongo_client.admin.command('ping')
    seeded_collections = (
        ('patients', SEED_PATIENTS),
        ('doctors', SEED_DOCTORS),
        ('appointments', SEED_APPOINTMENTS),
        ('diseases', SEED_DISEASES),
        ('users', SEED_USERS),
        ('search_history', SEED_SEARCH_HISTORY),
    )
    for collection_name, seed_records in seeded_collections:
        collection = database[collection_name]
        if collection.count_documents({}) == 0:
            collection.insert_many(seed_records)
    assessments = database.assessments
    if assessments.count_documents({}) == 0:
        for patient, input_values in zip(SEED_PATIENTS[:6], [
            {'age': 52, 'sex': 1, 'cp': 2, 'trestbps': 138, 'chol': 235, 'fbs': 0, 'restecg': 1, 'thalach': 150, 'exang': 0, 'oldpeak': 1.1, 'slope': 2, 'ca': 0, 'thal': 3},
            {'age': 46, 'sex': 0, 'cp': 3, 'trestbps': 124, 'chol': 210, 'fbs': 0, 'restecg': 0, 'thalach': 165, 'exang': 0, 'oldpeak': 0.4, 'slope': 1, 'ca': 0, 'thal': 3},
            {'age': 64, 'sex': 1, 'cp': 4, 'trestbps': 150, 'chol': 280, 'fbs': 1, 'restecg': 2, 'thalach': 125, 'exang': 1, 'oldpeak': 2.3, 'slope': 2, 'ca': 2, 'thal': 7},
            {'age': 37, 'sex': 0, 'cp': 2, 'trestbps': 118, 'chol': 190, 'fbs': 0, 'restecg': 0, 'thalach': 172, 'exang': 0, 'oldpeak': 0.2, 'slope': 1, 'ca': 0, 'thal': 3},
            {'age': 58, 'sex': 1, 'cp': 3, 'trestbps': 142, 'chol': 245, 'fbs': 1, 'restecg': 1, 'thalach': 138, 'exang': 1, 'oldpeak': 1.8, 'slope': 2, 'ca': 1, 'thal': 6},
            {'age': 29, 'sex': 0, 'cp': 1, 'trestbps': 112, 'chol': 175, 'fbs': 0, 'restecg': 0, 'thalach': 180, 'exang': 0, 'oldpeak': 0.0, 'slope': 1, 'ca': 0, 'thal': 3},
        ], strict=True):
            frame = pd.DataFrame([input_values])[model_feature_order]
            prediction = int(model.predict(frame)[0])
            probabilities = model.predict_proba(frame)[0]
            assessments.insert_one({
                'id': f"ASSESS-DEMO-{patient['id']}",
                'model': 'heart-disease',
                'patientId': patient['id'],
                'patientName': patient['name'],
                'inputs': input_values,
                'prediction': prediction,
                'class_names': ['No heart disease', 'Heart disease'],
                'probability': float(probabilities[1]) if len(probabilities) > 1 else float(probabilities[0]),
                'risk_level': 'High risk' if prediction == 1 else 'Low risk',
                'confidence': round(float(max(probabilities) * 100), 1),
                'createdAt': patient['lastVisit'],
                'demoRecord': True,
            })


def public_account(account):
    return {
        'id': account['id'],
        'name': account['name'],
        'email': account['email'],
        'role': account['role'],
        'patientId': account.get('patientId'),
        'doctorName': account.get('doctorName'),
        'allowedPages': account.get('allowedPages', list(ROLE_PAGES[account['role']])),
    }


def migrate_legacy_admin_pages(account):
    if account['role'] == 'admin' and set(account.get('allowedPages', ())) == set(LEGACY_ADMIN_PAGE_IDS):
        account['allowedPages'] = list(ROLE_PAGES['admin'])
        database.accounts.update_one({'id': account['id']}, {'$set': {'allowedPages': account['allowedPages']}})
    return account


def ensure_bootstrap_admin():
    email = os.getenv('INITIAL_ADMIN_EMAIL', '').strip().lower()
    password = os.getenv('INITIAL_ADMIN_PASSWORD', '')
    if not email and not password:
        return
    if not email or len(password) < 12:
        raise RuntimeError('Set both INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD (at least 12 characters).')
    ensure_account_indexes()
    if database.accounts.find_one({'email': email}):
        return
    database.accounts.insert_one({
        'id': f"USR-{uuid.uuid4().hex[:12].upper()}",
        'name': os.getenv('INITIAL_ADMIN_NAME', 'Administrator').strip() or 'Administrator',
        'email': email,
        'passwordHash': generate_password_hash(password, method='scrypt'),
        'role': 'admin',
        'allowedPages': list(ROLE_PAGES['admin']),
        'createdAt': utc_now(),
    })


def ensure_account_indexes():
    database.accounts.create_index('email', unique=True)


def create_session(account):
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc).timestamp() + SESSION_TTL_HOURS * 3600
    database.sessions.insert_one({
        'tokenHash': sha256(token.encode('utf-8')).hexdigest(),
        'userId': account['id'],
        'expiresAt': datetime.fromtimestamp(expires_at, timezone.utc),
        'createdAt': utc_now(),
    })
    return token


@app.before_request
def authenticate_api_request():
    if not request.path.startswith('/api/') or request.method == 'OPTIONS':
        return None
    if request.endpoint in {'auth_login', 'auth_register'}:
        return None

    authorization = request.headers.get('Authorization', '')
    scheme, _, token = authorization.partition(' ')
    if scheme.lower() != 'bearer' or not token:
        return jsonify({'error': 'Sign in is required.'}), 401
    session = database.sessions.find_one({
        'tokenHash': sha256(token.encode('utf-8')).hexdigest(),
        'expiresAt': {'$gt': datetime.now(timezone.utc)},
    })
    if not session:
        return jsonify({'error': 'Your session has expired. Sign in again.'}), 401
    account = database.accounts.find_one({'id': session['userId']})
    if not account:
        return jsonify({'error': 'This account is no longer available.'}), 401
    g.current_user = migrate_legacy_admin_pages(account)

    endpoint = request.endpoint
    method = request.method
    page_by_request = {
        ('dashboard_data', 'GET'): None,
        ('hospital_info_api', 'GET'): 'hospital-info',
        ('patients_api', 'GET'): 'patients',
        ('patients_api', 'POST'): 'add-record',
        ('update_patient', 'PUT'): 'patients',
        ('doctors_api', 'GET'): 'doctors',
        ('doctors_api', 'POST'): 'add-record',
        ('diseases_api', 'GET'): 'diseases',
        ('diseases_api', 'POST'): 'diseases',
        ('appointments_api', 'GET'): 'appointments',
        ('appointments_api', 'POST'): 'appointments',
        ('update_appointment', 'PUT'): 'appointments',
        ('users_api', 'GET'): 'settings',
        ('users_api', 'POST'): 'settings',
        ('update_user', 'PUT'): 'settings',
        ('auth_accounts', 'GET'): 'settings',
        ('auth_accounts', 'POST'): 'settings',
        ('update_account_permissions', 'PUT'): 'settings',
        ('search_api', 'POST'): None,
        ('search_history_api', 'GET'): 'settings',
        ('assessments_api', 'GET'): 'ml-assessment',
        ('model_performance_api', 'GET'): 'model-performance',
        ('model_performance_api', 'POST'): 'model-performance',
        ('predict_heart_disease', 'POST'): 'ml-assessment',
        ('auth_logout', 'POST'): None,
        ('auth_me', 'GET'): None,
    }
    if (endpoint, method) not in page_by_request:
        return jsonify({'error': 'This operation is not available.'}), 403
    required_page = page_by_request[(endpoint, method)]
    allowed_pages = account.get('allowedPages', list(ROLE_PAGES[account['role']]))
    if endpoint == 'auth_accounts' and method == 'POST' and account['role'] == 'admin':
        required_page = 'settings' if 'settings' in allowed_pages else 'add-record'
    if endpoint == 'auth_accounts' and method == 'GET' and account['role'] == 'admin' and 'settings' not in allowed_pages:
        required_page = 'staff'
    if endpoint == 'diseases_api' and method == 'POST' and account['role'] == 'staff':
        required_page = 'add-record'
    if required_page and required_page not in allowed_pages:
        return jsonify({'error': 'Your account does not have access to this page.'}), 403

    allowed_roles = {
        'hospital_info_api': {'patient', 'admin'},
        'patients_api': {'doctor', 'staff', 'admin'},
        'update_patient': {'doctor', 'admin'},
        'doctors_api': {'patient', 'staff', 'admin'},
        'diseases_api': {'doctor', 'staff', 'admin'},
        'appointments_api': {'patient', 'doctor', 'staff', 'admin'},
        'update_appointment': {'doctor', 'admin'},
        'users_api': {'admin'},
        'auth_accounts': {'admin'},
        'update_account_permissions': {'admin'},
        'search_history_api': {'admin'},
        'assessments_api': {'doctor', 'admin'},
        'model_performance_api': {'doctor', 'admin'},
        'predict_heart_disease': {'doctor', 'admin'},
    }
    if account['role'] not in allowed_roles.get(endpoint, set(VALID_ROLES)):
        return jsonify({'error': 'Your account is not allowed to perform this action.'}), 403
    if endpoint == 'patients_api' and method == 'POST' and account['role'] == 'doctor':
        return jsonify({'error': 'Doctor accounts can update existing patient records, but cannot create patient accounts.'}), 403
    if endpoint == 'doctors_api' and method == 'POST' and account['role'] not in {'staff', 'admin'}:
        return jsonify({'error': 'Only staff or administrators can add doctor directory records.'}), 403
    if endpoint == 'appointments_api' and method == 'POST' and account['role'] == 'doctor':
        return jsonify({'error': 'Doctor accounts can review and update appointments, but cannot create them.'}), 403
    if endpoint == 'model_performance_api' and method == 'POST' and account['role'] == 'doctor':
        return jsonify({'error': 'Only administrators can publish model-performance data.'}), 403
    return None


def records(collection_name, query=None, limit=100):
    return list(database[collection_name].find(query or {}, {'_id': 0}).sort('_id', -1).limit(limit))


def json_body():
    payload = request.get_json()
    if not isinstance(payload, dict):
        return None, (jsonify({'error': 'A JSON object is required.'}), 400)
    return payload, None


def required_text(payload, field):
    value = payload.get(field)
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip()


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin')
    if origin and origin.rstrip('/') in FRONTEND_ORIGINS:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        response.vary.add('Origin')
    return response


@app.errorhandler(PyMongoError)
def handle_database_error(_error):
    app.logger.exception('MongoDB operation failed: %s', _error)
    return jsonify({'error': 'MongoDB is unavailable or the database operation failed.'}), 503


@app.route('/health', methods=['GET', 'OPTIONS'])
def health():
    if request.method == 'OPTIONS':
        return '', 204
    ensure_database()
    return jsonify({'status': 'ok', 'database': MONGODB_DATABASE})


@app.route('/api/auth/register', methods=['POST', 'OPTIONS'])
def auth_register():
    if request.method == 'OPTIONS':
        return '', 204
    ensure_database()
    ensure_account_indexes()
    payload, error = json_body()
    if error:
        return error
    name = required_text(payload, 'name')
    email = required_text(payload, 'email')
    password = payload.get('password')
    city = required_text(payload, 'city') or ''
    if not name or not email or not isinstance(password, str) or len(password) < 12:
        return jsonify({'error': 'Name, email, and a password of at least 12 characters are required.'}), 400
    email = email.lower()
    if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
        return jsonify({'error': 'Enter a valid email address.'}), 400
    try:
        age = int(payload.get('age'))
    except (TypeError, ValueError):
        return jsonify({'error': 'Age must be a whole number.'}), 400
    if not 0 <= age <= 120:
        return jsonify({'error': 'Age must be between 0 and 120.'}), 400
    if database.accounts.find_one({'email': email}):
        return jsonify({'error': 'An account with this email already exists.'}), 409

    patient_id = f"PT-{uuid.uuid4().hex[:8].upper()}"
    patient = {
        'id': patient_id,
        'name': name,
        'age': age,
        'city': city,
        'gender': required_text(payload, 'gender') or '',
        'status': 'Stable',
        'lastVisit': datetime.now().date().isoformat(),
        'risk': 'Low',
        'conditions': [],
        'createdAt': utc_now(),
    }
    account = {
        'id': f"USR-{uuid.uuid4().hex[:12].upper()}",
        'name': name,
        'email': email,
        'passwordHash': generate_password_hash(password, method='scrypt'),
        'role': 'patient',
        'patientId': patient_id,
        'allowedPages': list(ROLE_PAGES['patient']),
        'createdAt': utc_now(),
    }
    database.patients.insert_one(patient)
    database.accounts.insert_one(account)
    return jsonify({'token': create_session(account), 'user': public_account(account)}), 201


@app.route('/api/auth/login', methods=['POST', 'OPTIONS'])
def auth_login():
    if request.method == 'OPTIONS':
        return '', 204
    ensure_database()
    ensure_bootstrap_admin()
    ensure_account_indexes()
    payload, error = json_body()
    if error:
        return error
    email = required_text(payload, 'email')
    password = payload.get('password')
    if not email or not isinstance(password, str):
        return jsonify({'error': 'Email and password are required.'}), 400
    account = database.accounts.find_one({'email': email.lower()})
    if not account or not check_password_hash(account['passwordHash'], password):
        return jsonify({'error': 'Email or password is incorrect.'}), 401
    account = migrate_legacy_admin_pages(account)
    return jsonify({'token': create_session(account), 'user': public_account(account)})


@app.route('/api/auth/me', methods=['GET', 'OPTIONS'])
def auth_me():
    if request.method == 'OPTIONS':
        return '', 204
    ensure_database()
    ensure_bootstrap_admin()
    return jsonify(public_account(g.current_user))


@app.route('/api/auth/logout', methods=['POST', 'OPTIONS'])
def auth_logout():
    if request.method == 'OPTIONS':
        return '', 204
    scheme, _, token = request.headers.get('Authorization', '').partition(' ')
    if scheme.lower() == 'bearer' and token:
        database.sessions.delete_one({'tokenHash': sha256(token.encode('utf-8')).hexdigest()})
    return jsonify({'message': 'Signed out.'})


@app.route('/api/auth/accounts', methods=['GET', 'POST', 'OPTIONS'])
def auth_accounts():
    if request.method == 'OPTIONS':
        return '', 204
    ensure_database()
    ensure_account_indexes()
    if request.method == 'GET':
        accounts = records('accounts')
        if 'settings' not in g.current_user.get('allowedPages', ROLE_PAGES[g.current_user['role']]):
            accounts = [account for account in accounts if account.get('role') == 'staff']
        return jsonify([public_account(account) for account in accounts])
    payload, error = json_body()
    if error:
        return error
    name = required_text(payload, 'name')
    email = required_text(payload, 'email')
    password = payload.get('password')
    role = required_text(payload, 'role')
    if not name or not email or not isinstance(password, str) or len(password) < 12:
        return jsonify({'error': 'Name, email, and a password of at least 12 characters are required.'}), 400
    if role not in {'admin', 'doctor', 'staff'}:
        return jsonify({'error': 'Administrators can provision only admin, doctor, or staff accounts.'}), 400
    email = email.lower()
    if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
        return jsonify({'error': 'Enter a valid email address.'}), 400
    if database.accounts.find_one({'email': email}):
        return jsonify({'error': 'An account with this email already exists.'}), 409
    doctor_name = required_text(payload, 'doctorName')
    if role == 'doctor' and (not doctor_name or not database.doctors.find_one({'name': doctor_name})):
        return jsonify({'error': 'Select a doctor record to link to this account.'}), 400
    account = {
        'id': f"USR-{uuid.uuid4().hex[:12].upper()}",
        'name': name,
        'email': email,
        'passwordHash': generate_password_hash(password, method='scrypt'),
        'role': role,
        'doctorName': doctor_name if role == 'doctor' else None,
        'allowedPages': list(ROLE_PAGES[role]),
        'createdAt': utc_now(),
    }
    database.accounts.insert_one(account)
    if role == 'staff':
        database.users.insert_one({
            'id': f"USR-{uuid.uuid4().hex[:8].upper()}",
            'accountId': account['id'],
            'name': name,
            'email': email,
            'role': 'Staff',
            'createdAt': utc_now(),
        })
    return jsonify(public_account(account)), 201


@app.route('/api/auth/accounts/<account_id>', methods=['PUT', 'OPTIONS'])
def update_account_permissions(account_id):
    if request.method == 'OPTIONS':
        return '', 204
    ensure_database()
    payload, error = json_body()
    if error:
        return error
    allowed_pages = payload.get('allowedPages')
    if not isinstance(allowed_pages, list) or any(page not in PAGE_IDS for page in allowed_pages):
        return jsonify({'error': 'allowedPages must be a list of valid page identifiers.'}), 400
    account = database.accounts.find_one({'id': account_id})
    if not account:
        return jsonify({'error': 'Account was not found.'}), 404
    if not set(allowed_pages).issubset(ROLE_PAGES[account['role']]):
        return jsonify({'error': 'Page access cannot exceed the permissions assigned to the account role.'}), 400
    if account['role'] == 'admin' and 'settings' not in allowed_pages:
        return jsonify({'error': 'Administrator accounts must retain Settings access to manage accounts.'}), 400
    database.accounts.update_one({'id': account_id}, {'$set': {'allowedPages': allowed_pages}})
    return jsonify(public_account(database.accounts.find_one({'id': account_id})))


@app.route('/api/hospital', methods=['GET', 'OPTIONS'])
def hospital_info_api():
    if request.method == 'OPTIONS':
        return '', 204
    return jsonify({
        'name': os.getenv('HOSPITAL_NAME', 'TakeCare Community Hospital'),
        'address': os.getenv('HOSPITAL_ADDRESS', 'Contact the hospital for location information.'),
        'phone': os.getenv('HOSPITAL_PHONE', 'Contact the hospital for phone information.'),
        'email': os.getenv('HOSPITAL_EMAIL', 'Contact the hospital for email information.'),
        'hours': os.getenv('HOSPITAL_HOURS', 'Contact the hospital for current hours.'),
    })


@app.route('/api/dashboard', methods=['GET', 'OPTIONS'])
def dashboard_data():
    if request.method == 'OPTIONS':
        return '', 204
    ensure_database()
    account = g.current_user
    role = account['role']
    is_admin = role == 'admin'
    allowed_pages = set(account.get('allowedPages', ROLE_PAGES[role]))
    patient = database.patients.find_one({'id': account.get('patientId')}, {'_id': 0}) if role == 'patient' else None
    appointment_query = {'patientId': patient['id']} if patient else {}
    if role == 'doctor':
        appointment_query = {'doctor': account.get('doctorName') or account['name']}
    today = datetime.now().date().isoformat()
    today_appointment_count = database.appointments.count_documents({
        'patientId': patient['id'],
        'date': today,
    }) if patient and 'appointments' in allowed_pages else 0
    performance = None
    if role in {'doctor', 'admin'} and 'model-performance' in allowed_pages:
        performance = database.model_performance.find_one({}, {'_id': 0}, sort=[('_id', -1)]) or NOTEBOOK_MODEL_PERFORMANCE
    staff_page_only = is_admin and 'staff' in allowed_pages and 'settings' not in allowed_pages
    users = records('users') if is_admin and {'settings', 'staff'} & allowed_pages else []
    accounts = records('accounts') if is_admin and {'settings', 'staff'} & allowed_pages else []
    if staff_page_only:
        users = [user for user in users if str(user.get('role', '')).lower() == 'staff']
        accounts = [user for user in accounts if user.get('role') == 'staff']
    return jsonify({
        'patients': [patient] if patient and 'appointments' in allowed_pages else (records('patients') if role in {'doctor', 'staff', 'admin'} and 'patients' in allowed_pages else []),
        'doctors': records('doctors') if role in {'patient', 'staff', 'admin'} and 'doctors' in allowed_pages else [],
        'appointments': records('appointments', appointment_query) if role != 'patient' and 'appointments' in allowed_pages else [],
        'todayAppointmentCount': today_appointment_count,
        'todayDate': today,
        'diseases': records('diseases') if role in {'doctor', 'staff', 'admin'} and 'diseases' in allowed_pages else [],
        'users': users,
        'accounts': [public_account(user) for user in accounts],
        'assessments': records('assessments', limit=100) if role in {'doctor', 'admin'} and 'ml-assessment' in allowed_pages else [],
        'searchHistory': records('search_history', {'userId': account['id']}, limit=25) if is_admin and 'settings' in allowed_pages else [],
        'modelPerformance': performance,
    })


@app.route('/api/patients', methods=['GET', 'POST', 'OPTIONS'])
def patients_api():
    if request.method == 'OPTIONS':
        return '', 204
    ensure_database()
    if request.method == 'GET':
        return jsonify(records('patients'))
    payload, error = json_body()
    if error:
        return error
    name = required_text(payload, 'name')
    try:
        age = int(payload.get('age', 45))
    except (TypeError, ValueError):
        return jsonify({'error': 'Age must be a whole number.'}), 400
    if not name or age < 0 or age > 120:
        return jsonify({'error': 'A patient name and age between 0 and 120 are required.'}), 400
    patient = {
        'id': f"PT-{uuid.uuid4().hex[:8].upper()}",
        'name': name,
        'age': age,
        'city': required_text(payload, 'city') or '',
        'gender': required_text(payload, 'gender') or '',
        'bloodGroup': required_text(payload, 'bloodGroup') or '',
        'status': payload.get('status', 'Stable'),
        'lastVisit': required_text(payload, 'lastVisit') or datetime.now().date().isoformat(),
        'risk': payload.get('risk', 'Low'),
        'conditions': payload.get('conditions', []),
        'createdAt': utc_now(),
    }
    if not isinstance(patient['conditions'], list) or any(not isinstance(value, str) for value in patient['conditions']):
        return jsonify({'error': 'Conditions must be a list of disease identifiers.'}), 400
    if patient['conditions'] and database.diseases.count_documents({'id': {'$in': patient['conditions']}}) != len(set(patient['conditions'])):
        return jsonify({'error': 'One or more selected diseases do not exist.'}), 400
    database.patients.insert_one(patient)
    return jsonify(database.patients.find_one({'id': patient['id']}, {'_id': 0})), 201


@app.route('/api/patients/<patient_id>', methods=['PUT', 'OPTIONS'])
def update_patient(patient_id):
    if request.method == 'OPTIONS':
        return '', 204
    ensure_database()
    payload, error = json_body()
    if error:
        return error
    allowed_fields = {'name', 'age', 'city', 'gender', 'bloodGroup', 'status', 'lastVisit', 'risk', 'conditions'}
    if g.current_user['role'] == 'doctor':
        allowed_fields = {'status', 'lastVisit', 'risk', 'conditions'}
    updates = {key: payload[key] for key in allowed_fields if key in payload}
    if not updates:
        return jsonify({'error': 'At least one patient field is required.'}), 400
    if 'name' in updates and not required_text({'name': updates['name']}, 'name'):
        return jsonify({'error': 'Patient name cannot be empty.'}), 400
    if 'age' in updates:
        try:
            updates['age'] = int(updates['age'])
        except (TypeError, ValueError):
            return jsonify({'error': 'Age must be a whole number.'}), 400
        if updates['age'] < 0 or updates['age'] > 120:
            return jsonify({'error': 'Age must be between 0 and 120.'}), 400
    if 'conditions' in updates and (
        not isinstance(updates['conditions'], list)
        or any(not isinstance(value, str) for value in updates['conditions'])
    ):
        return jsonify({'error': 'Conditions must be a list of disease identifiers.'}), 400
    if 'conditions' in updates and database.diseases.count_documents({'id': {'$in': updates['conditions']}}) != len(set(updates['conditions'])):
        return jsonify({'error': 'One or more selected diseases do not exist.'}), 400
    result = database.patients.update_one({'id': patient_id}, {'$set': updates})
    if result.matched_count == 0:
        return jsonify({'error': 'Patient was not found.'}), 404
    return jsonify(database.patients.find_one({'id': patient_id}, {'_id': 0}))


@app.route('/api/doctors', methods=['GET', 'POST', 'OPTIONS'])
def doctors_api():
    if request.method == 'OPTIONS':
        return '', 204
    ensure_database()
    if request.method == 'GET':
        return jsonify(records('doctors'))
    payload, error = json_body()
    if error:
        return error
    name = required_text(payload, 'name')
    specialty = required_text(payload, 'specialty')
    department = required_text(payload, 'department')
    if not name or not specialty or not department:
        return jsonify({'error': 'Name, specialty, and department are required.'}), 400
    doctor = {
        'id': f"DR-{uuid.uuid4().hex[:8].upper()}",
        'name': name,
        'specialty': specialty,
        'department': department,
        'city': required_text(payload, 'city') or '',
        'availability': payload.get('availability', 'Available'),
        'createdAt': utc_now(),
    }
    database.doctors.insert_one(doctor)
    return jsonify(database.doctors.find_one({'id': doctor['id']}, {'_id': 0})), 201


@app.route('/api/diseases', methods=['GET', 'POST', 'OPTIONS'])
def diseases_api():
    if request.method == 'OPTIONS':
        return '', 204
    ensure_database()
    if request.method == 'GET':
        return jsonify(records('diseases'))
    payload, error = json_body()
    if error:
        return error
    name = required_text(payload, 'name')
    category = required_text(payload, 'category')
    description = required_text(payload, 'description')
    if not name or not category or not description:
        return jsonify({'error': 'Name, category, and description are required.'}), 400
    disease_id = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    if database.diseases.find_one({'id': disease_id}):
        return jsonify({'error': 'A disease with this name already exists.'}), 409
    disease = {'id': disease_id, 'name': name, 'category': category, 'description': description, 'createdAt': utc_now()}
    database.diseases.insert_one(disease)
    return jsonify(database.diseases.find_one({'id': disease_id}, {'_id': 0})), 201


@app.route('/api/appointments', methods=['GET', 'POST', 'OPTIONS'])
def appointments_api():
    if request.method == 'OPTIONS':
        return '', 204
    ensure_database()
    if request.method == 'GET':
        if g.current_user['role'] == 'patient':
            patient = database.patients.find_one({'id': g.current_user.get('patientId')})
            today = datetime.now().date().isoformat()
            count = database.appointments.count_documents({
                'patientId': patient['id'],
                'date': today,
            }) if patient else 0
            return jsonify({'todayAppointmentCount': count, 'todayDate': today})
        query = {}
        if g.current_user['role'] == 'doctor':
            query = {'doctor': g.current_user.get('doctorName') or g.current_user['name']}
        return jsonify(records('appointments', query))
    payload, error = json_body()
    if error:
        return error
    if g.current_user['role'] == 'patient':
        patient = database.patients.find_one({'id': g.current_user.get('patientId')})
        if not patient:
            return jsonify({'error': 'The patient profile linked to this account was not found.'}), 404
        payload['patient'] = patient['name']
    patient = None
    required_fields = ('patient', 'doctor', 'date', 'time')
    appointment = {field: required_text(payload, field) for field in required_fields}
    if any(value is None for value in appointment.values()):
        return jsonify({'error': 'Patient, doctor, date, and time are required.'}), 400
    patient = patient or database.patients.find_one({'name': appointment['patient']})
    if not patient:
        return jsonify({'error': 'Select a patient from the patient directory.'}), 400
    if not database.doctors.find_one({'name': appointment['doctor']}):
        return jsonify({'error': 'Select a doctor from the directory.'}), 400
    try:
        datetime.strptime(appointment['date'], '%Y-%m-%d')
        datetime.strptime(appointment['time'], '%H:%M')
    except ValueError:
        return jsonify({'error': 'Enter a valid appointment date and time.'}), 400
    status = 'Pending' if g.current_user['role'] == 'patient' else payload.get('status', 'Confirmed')
    if status not in {'Confirmed', 'Pending', 'Completed', 'Rescheduled', 'Cancelled'}:
        return jsonify({'error': 'Select a valid appointment status.'}), 400
    appointment.update({
        'id': f"AP-{uuid.uuid4().hex[:8].upper()}",
        'status': status,
        'reason': required_text(payload, 'reason') or 'Consultation',
        'patientId': patient['id'],
        'createdAt': utc_now(),
    })
    database.appointments.insert_one(appointment)
    if g.current_user['role'] == 'patient':
        today = datetime.now().date().isoformat()
        return jsonify({
            'message': 'Appointment request submitted.',
            'todayAppointmentCount': database.appointments.count_documents({
                'patientId': patient['id'],
                'date': today,
            }),
            'todayDate': today,
        }), 201
    return jsonify(database.appointments.find_one({'id': appointment['id']}, {'_id': 0})), 201


@app.route('/api/appointments/<appointment_id>', methods=['PUT', 'OPTIONS'])
def update_appointment(appointment_id):
    if request.method == 'OPTIONS':
        return '', 204
    ensure_database()
    payload, error = json_body()
    if error:
        return error
    status = required_text(payload, 'status')
    if status not in {'Confirmed', 'Pending', 'Completed', 'Rescheduled', 'Cancelled'}:
        return jsonify({'error': 'Select a valid appointment status.'}), 400
    query = {'id': appointment_id}
    if g.current_user['role'] == 'doctor':
        query['doctor'] = g.current_user.get('doctorName') or g.current_user['name']
    result = database.appointments.update_one(query, {'$set': {'status': status}})
    if not result.matched_count:
        return jsonify({'error': 'Appointment was not found or is not assigned to your account.'}), 404
    return jsonify(database.appointments.find_one({'id': appointment_id}, {'_id': 0}))


@app.route('/api/users', methods=['GET', 'POST', 'OPTIONS'])
def users_api():
    if request.method == 'OPTIONS':
        return '', 204
    ensure_database()
    if request.method == 'GET':
        return jsonify(records('users'))
    payload, error = json_body()
    if error:
        return error
    name = required_text(payload, 'name')
    email = required_text(payload, 'email')
    role = required_text(payload, 'role')
    if not name or not email or not role:
        return jsonify({'error': 'Name, email, and role are required.'}), 400
    user = {'id': f"USR-{uuid.uuid4().hex[:8].upper()}", 'name': name, 'email': email, 'role': role, 'createdAt': utc_now()}
    database.users.insert_one(user)
    return jsonify(database.users.find_one({'id': user['id']}, {'_id': 0})), 201


@app.route('/api/users/<user_id>', methods=['PUT', 'OPTIONS'])
def update_user(user_id):
    if request.method == 'OPTIONS':
        return '', 204
    ensure_database()
    payload, error = json_body()
    if error:
        return error
    updates = {field: required_text(payload, field) for field in ('name', 'email', 'role') if field in payload}
    if not updates or any(value is None for value in updates.values()):
        return jsonify({'error': 'Provide a non-empty name, email, or role to update.'}), 400
    result = database.users.update_one({'id': user_id}, {'$set': updates})
    if result.matched_count == 0:
        return jsonify({'error': 'User was not found.'}), 404
    return jsonify(database.users.find_one({'id': user_id}, {'_id': 0}))


@app.route('/api/search', methods=['POST', 'OPTIONS'])
def search_api():
    if request.method == 'OPTIONS':
        return '', 204
    ensure_database()
    payload, error = json_body()
    if error:
        return error
    query = required_text(payload, 'query')
    if not query:
        return jsonify({'error': 'A search query is required.'}), 400
    database.search_history.insert_one({
        'id': str(uuid.uuid4()),
        'userId': g.current_user['id'],
        'query': query,
        'createdAt': utc_now(),
    })
    pattern = re.compile(re.escape(query), re.IGNORECASE)
    role = g.current_user['role']
    allowed_pages = set(g.current_user.get('allowedPages', ROLE_PAGES[role]))
    result_sets = {
        'patients': records('patients', {'$or': [
            {'name': pattern}, {'id': pattern}, {'status': pattern}, {'city': pattern},
            {'gender': pattern}, {'bloodGroup': pattern}, {'conditions': pattern},
        ]}) if role in {'doctor', 'staff', 'admin'} and 'patients' in allowed_pages else [],
        'doctors': records('doctors', {'$or': [
            {'name': pattern}, {'specialty': pattern}, {'department': pattern},
            {'city': pattern}, {'availability': pattern},
        ]}) if role in {'patient', 'staff', 'admin'} and 'doctors' in allowed_pages else [],
        'appointments': records('appointments', {'$and': [
            {'$or': [{'patient': pattern}, {'doctor': pattern}, {'status': pattern}, {'reason': pattern}]},
            *([{'doctor': g.current_user.get('doctorName') or g.current_user['name']}] if role == 'doctor' else []),
        ]}) if role in {'doctor', 'staff', 'admin'} and 'appointments' in allowed_pages else [],
        'diseases': records('diseases', {'$or': [{'name': pattern}, {'category': pattern}, {'id': pattern}]})
        if role in {'doctor', 'staff', 'admin'} and 'diseases' in allowed_pages else [],
        'users': records('users', {'$or': [{'name': pattern}, {'email': pattern}, {'role': pattern}]})
        if role == 'admin' and 'settings' in allowed_pages else [],
    }
    if role == 'patient':
        result_sets['appointments'] = []
    return jsonify({'query': query, 'results': result_sets})


@app.route('/api/search-history', methods=['GET', 'OPTIONS'])
def search_history_api():
    if request.method == 'OPTIONS':
        return '', 204
    ensure_database()
    return jsonify(records('search_history', {'userId': g.current_user['id']}, limit=25))


@app.route('/api/assessments', methods=['GET', 'OPTIONS'])
def assessments_api():
    if request.method == 'OPTIONS':
        return '', 204
    ensure_database()
    return jsonify(records('assessments', limit=100))


@app.route('/api/model-performance', methods=['GET', 'POST', 'OPTIONS'])
def model_performance_api():
    if request.method == 'OPTIONS':
        return '', 204
    ensure_database()
    if request.method == 'GET':
        return jsonify(database.model_performance.find_one({}, {'_id': 0}, sort=[('_id', -1)]) or NOTEBOOK_MODEL_PERFORMANCE)
    payload, error = json_body()
    if error:
        return error
    metric_fields = ('accuracy', 'precision', 'recall', 'f1', 'rocAuc')
    metrics = {}
    for field in metric_fields:
        value = payload.get(field)
        if value is not None:
            try:
                value = float(value)
            except (TypeError, ValueError):
                return jsonify({'error': f'{field} must be a number between 0 and 1.'}), 400
            if not 0 <= value <= 1:
                return jsonify({'error': f'{field} must be a number between 0 and 1.'}), 400
            metrics[field] = value
    if not metrics:
        return jsonify({'error': 'At least one valid performance metric is required.'}), 400
    for field in ('rocCurve', 'confusionMatrix'):
        if field in payload:
            metrics[field] = payload[field]
    if 'rocCurve' in metrics:
        curve = metrics['rocCurve']
        if not isinstance(curve, list) or any(
            not isinstance(point, dict)
            or not isinstance(point.get('fpr'), (int, float))
            or not isinstance(point.get('tpr'), (int, float))
            or not 0 <= point['fpr'] <= 1
            or not 0 <= point['tpr'] <= 1
            for point in curve
        ):
            return jsonify({'error': 'rocCurve must be a list of points with fpr and tpr values between 0 and 1.'}), 400
    if 'confusionMatrix' in metrics:
        matrix = metrics['confusionMatrix']
        if (
            not isinstance(matrix, list)
            or len(matrix) != 2
            or any(not isinstance(row, list) or len(row) != 2 for row in matrix)
            or any(not isinstance(value, (int, float)) or value < 0 for row in matrix for value in row)
        ):
            return jsonify({'error': 'confusionMatrix must be a 2-by-2 matrix of non-negative numbers.'}), 400
    metrics.update({'model': payload.get('model', 'heart-disease'), 'createdAt': utc_now()})
    database.model_performance.insert_one(metrics)
    metrics.pop('_id', None)
    return jsonify(metrics), 201


@app.route('/api/predict/heart-disease', methods=['POST', 'OPTIONS'])
def predict_heart_disease():
    if request.method == 'OPTIONS':
        return '', 204

    payload, error = json_body()
    if error:
        return error
    missing = [field for field in model_feature_order if field not in payload]
    if missing:
        return jsonify({'error': f'Missing required fields: {missing}'}), 400

    try:
        values = {field: float(payload[field]) for field in model_feature_order}
    except (TypeError, ValueError):
        return jsonify({'error': 'All model inputs must be numeric.'}), 400

    try:
        frame = pd.DataFrame([values])[model_feature_order]
        prediction = int(model.predict(frame)[0])
        probabilities = model.predict_proba(frame)[0]
        positive_probability = float(probabilities[1]) if len(probabilities) > 1 else float(probabilities[0])
        result = {
            'prediction': prediction,
            'class_names': ['No heart disease', 'Heart disease'],
            'probability': positive_probability,
            'risk_level': 'High risk' if prediction == 1 else 'Low risk',
            'confidence': round(float(max(probabilities) * 100), 1),
        }
    except Exception:
        app.logger.exception('Heart disease model prediction failed')
        return jsonify({'error': 'Heart disease prediction failed.'}), 500

    ensure_database()
    assessment = {
        'id': str(uuid.uuid4()),
        'model': 'heart-disease',
        'inputs': values,
        **result,
        'createdAt': utc_now(),
    }
    database.assessments.insert_one(assessment)
    assessment.pop('_id', None)
    return jsonify(assessment)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', '5001')), debug=False)
