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


if __name__ == '__main__':
    unittest.main()
