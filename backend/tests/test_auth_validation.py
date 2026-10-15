import unittest
from unittest.mock import patch

import app as backend_app
from app import (
    MIN_PASSWORD_LENGTH,
    is_valid_account_identifier,
    is_valid_email,
    is_valid_password,
)


class AuthValidationTests(unittest.TestCase):
    def test_admin_account_id_without_public_email_domain_is_accepted(self):
        self.assertTrue(is_valid_account_identifier('admin@takecare'))
        self.assertFalse(is_valid_email('admin@takecare'))

    def test_account_ids_reject_malformed_values(self):
        for value in ('', 'admin', '@takecare', 'admin@', 'admin @takecare', 'a@b@c'):
            with self.subTest(value=value):
                self.assertFalse(is_valid_account_identifier(value))

    def test_patient_registration_requires_a_conventional_email(self):
        self.assertTrue(is_valid_email('patient@example.com'))
        self.assertFalse(is_valid_email('patient@takecare'))

    def test_password_minimum_is_eight_characters(self):
        self.assertEqual(MIN_PASSWORD_LENGTH, 8)
        self.assertFalse(is_valid_password('1234567'))
        self.assertTrue(is_valid_password('12345678'))
        self.assertFalse(is_valid_password(None))

    def test_patient_registration_is_rejected_without_connecting_to_database(self):
        with patch.object(backend_app, 'PATIENT_REGISTRATION_ENABLED', False):
            with patch.object(backend_app, 'ensure_database') as ensure_database:
                response = backend_app.app.test_client().post('/api/auth/register', json={})

        self.assertEqual(response.status_code, 403)
        ensure_database.assert_not_called()

    def test_patient_registration_creates_a_linked_patient_and_account(self):
        payload = {
            'name': 'Synthetic Patient',
            'age': 42,
            'email': 'patient@example.com',
            'password': 'synthetic-password',
        }
        with patch.object(backend_app, 'PATIENT_REGISTRATION_ENABLED', True):
            with patch.object(backend_app, 'ensure_database'):
                with patch.object(backend_app, 'database') as database:
                    database.accounts.find_one.return_value = None
                    with patch.object(backend_app, 'create_session', return_value='session-token'):
                        response = backend_app.app.test_client().post('/api/auth/register', json=payload)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json['token'], 'session-token')
        patient = database.patients.insert_one.call_args.args[0]
        account = database.accounts.insert_one.call_args.args[0]
        self.assertEqual(account['patientId'], patient['id'])
        self.assertEqual(account['role'], 'patient')

    def test_database_check_only_connects_and_does_not_seed_records(self):
        with patch.object(backend_app, 'mongo_client') as mongo_client:
            with patch.object(backend_app, 'database') as database:
                backend_app.ensure_database()

        mongo_client.admin.command.assert_called_once_with('ping')
        database.assert_not_called()

    def test_records_are_not_truncated_unless_a_limit_is_requested(self):
        documents = [{'_id': index, 'id': f'PT-{index}'} for index in range(150)]

        class Cursor(list):
            def sort(self, field, direction):
                return Cursor(sorted(self, key=lambda record: record[field], reverse=direction < 0))

            def limit(self, value):
                return Cursor(self[:value])

        with patch.object(backend_app, 'database') as database:
            database.__getitem__.return_value.find.return_value = Cursor(documents)
            all_records = backend_app.records('patients')
            limited_records = backend_app.records('patients', limit=25)

        self.assertEqual(len(all_records), 150)
        self.assertEqual(len(limited_records), 25)

    def test_model_performance_persists_repository_metrics_when_collection_is_empty(self):
        stored_performance = {}

        def find_one(query, projection, sort=None):
            if query.get('_id') == {'$ne': backend_app.DEFAULT_MODEL_PERFORMANCE_ID}:
                return None
            if query.get('_id') == backend_app.DEFAULT_MODEL_PERFORMANCE_ID:
                return {key: value for key, value in stored_performance.items() if key != '_id'}
            return None

        def update_one(query, update, upsert):
            self.assertTrue(upsert)
            stored_performance.update(query)
            stored_performance.update(update['$setOnInsert'])

        with patch.object(backend_app, 'database') as database:
            collection = database.model_performance
            with patch.object(collection, 'find_one', side_effect=find_one):
                with patch.object(collection, 'update_one', side_effect=update_one) as update:
                    performance = backend_app.model_performance_data()

        self.assertEqual(performance['model'], 'Logistic Regression')
        self.assertEqual(performance['accuracy'], 0.885246)
        self.assertEqual(performance['rocAuc'], 0.96645)
        self.assertEqual(performance['confusionMatrix'], [[28, 5], [2, 26]])
        self.assertEqual(len(performance['modelComparisons']), 5)
        self.assertEqual(performance['datasetSize'], 303)
        self.assertEqual(performance['testSize'], 61)
        self.assertEqual(len(performance['rocCurve']), 14)
        self.assertEqual(performance['rocCurve'][0], {'fpr': 0.0, 'tpr': 0.0})
        self.assertEqual(performance['rocCurve'][-1], {'fpr': 1.0, 'tpr': 1.0})
        update.assert_called_once()

    def test_staff_can_create_patient_and_doctor_records(self):
        self.assertIn('patients', backend_app.ROLE_PAGES['staff'])
        self.assertIn('doctors', backend_app.ROLE_PAGES['staff'])
        self.assertIn('add-record', backend_app.ROLE_PAGES['staff'])


if __name__ == '__main__':
    unittest.main()
