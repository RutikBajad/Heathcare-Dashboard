# Deployment

This repository can be deployed as a public demonstration. New MongoDB databases start without patient, doctor, appointment, disease, or assessment records; the administrator creates staff accounts, and staff can add patient and doctor directory records. It is not a clinical system and must not be used with real patient information. The application is still a prototype and has not undergone a production security, privacy, compliance, or clinical review.

## Backend service

Deploy the repository root as a Python 3.11 service. The root `Procfile` starts Gunicorn and binds to the hosting provider's `PORT`. The health-check endpoint is `/health`.

Install command:

```sh
pip install -r backend/requirements.txt
```

Set these environment variables in the hosting provider's secret/configuration settings:

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | Connection string for a hosted MongoDB deployment; do not use localhost |
| `MONGODB_DATABASE` | Database name, for example `healthpilot` |
| `FRONTEND_ORIGINS` | Exact deployed frontend origin(s), comma-separated, such as `https://takecare.example.com` |
| `INITIAL_ADMIN_NAME` | Optional name for the first administrator account |
| `INITIAL_ADMIN_EMAIL` | Bootstrap administrator account ID, for example `admin@takecare` |
| `INITIAL_ADMIN_PASSWORD` | Bootstrap password of at least 8 characters; set only as a host secret |
| `ALLOW_PATIENT_REGISTRATION` | Defaults to `true`; set to `false` to disable public patient self-registration |
| `HOSPITAL_NAME` | Optional hospital name shown to signed-in patients |
| `HOSPITAL_ADDRESS` | Optional hospital address |
| `HOSPITAL_PHONE` | Optional hospital phone |
| `HOSPITAL_EMAIL` | Optional hospital email |
| `HOSPITAL_HOURS` | Optional visiting/operating hours |
| `PORT` | Set by the hosting provider |

Set both bootstrap admin credentials before deployment. The account is created during the first login when it does not already exist; changing these variables does not reset an existing account password. Patient self-registration is enabled by default: set `ALLOW_PATIENT_REGISTRATION=true` on the backend and `VITE_ALLOW_PATIENT_REGISTRATION=true` at frontend build time. Both settings must be enabled for the registration button and API to work; backend registration creates a patient profile and account in the configured MongoDB database. Disable registration on both services if public sign-up is not wanted. Use only synthetic data; this prototype is not approved for real patient information. Sign in as the administrator and create staff accounts from the Staff or Add records pages. Staff can create patient records, doctor directory records, appointments, and disease references. Doctor login accounts must be provisioned separately by an administrator in Settings and linked to a doctor directory record. Passwords for newly created accounts must be at least 8 characters. Prefer a unique password of 16 or more characters for the public administrator account; the minimum is a compatibility rule, not a strength recommendation.

The supplied `admin@takecare` value is an account ID, not an email address for mail delivery. It is accepted for sign-in and bootstrap account creation. Do not store the administrator password in this repository, a frontend environment variable, or a committed `.env` file. If an administrator account with this ID already exists in the database, bootstrap does not change its password; use the existing password or a controlled password-reset procedure.

Restrict the MongoDB database user to the application database and allow network access only from the backend host where possible. Never commit `.env` or put database credentials in frontend variables.

### Viewing and clearing database records

For MongoDB Atlas, open your project and cluster, select **Browse Collections** (sometimes labeled **Data Explorer**), then choose the configured `MONGODB_DATABASE` database. Application data is stored in collections such as `patients`, `doctors`, `appointments`, `diseases`, `accounts`, and `assessments`. Account password values are stored as password hashes, not plaintext.

The application no longer seeds records when it connects. This prevents a fresh database from filling with sample patients and appointments. It does not automatically erase records already present in an existing database. To start completely empty, configure a new database name in `MONGODB_DATABASE` for the deployment. If you intend to clear an existing database, back it up first and remove only the intended demo records in Atlas Data Explorer; do not drop the database if it contains records you want to keep.

Local and hosted databases are separate unless configured with the same MongoDB URI and database. The local development configuration may use `mongodb://127.0.0.1:27017`, while the published frontend sends requests to the API configured by `VITE_API_URL`; that hosted backend uses its own `MONGODB_URI` and `MONGODB_DATABASE`. A matching database name alone does not make them the same database. Records created against a local backend will not appear on the hosted site unless they are deliberately migrated. Dashboard directory lists include all matching records rather than silently truncating at 100.

### Importing the fictional demo workbook

The root-level `healthcare_demo_data_aug_to_nov_2026.xlsx` is labeled fictional demo data. To load it into the hosted `healthpilot` database, set `MONGODB_URI` in the ignored local `.env` file to the hosted MongoDB connection string; never paste or commit the URI. Install `backend/requirements.txt`, then run `python backend/import_demo_data.py` for a validation-only dry run. Review the reported database name and collection counts, then run `python backend/import_demo_data.py --apply` to write the records. The importer refuses localhost and any database other than `healthpilot`, checks foreign-key references and ID collisions before writing, and is safe to rerun for records marked as demo data. Staff and patient demo-account passwords are stored as password hashes, not plaintext. This imports fictional patient records and demo login accounts, so do not use the workbook or imported accounts with real patient information.

## Frontend service

Build the `frontend` directory with:

```sh
npm ci
npm run build
```

Use Node.js `^20.19.0` or `>=22.12.0` for the Vite 8 build.

Publish `frontend/dist`. Configure `VITE_API_URL` to the backend's base URL **without** a trailing slash or `/api` (for example, `https://takecare-api.example.com`). Vite embeds this value into the built JavaScript, so set it before building. For a same-origin deployment that reverse-proxies `/api` and `/health` to the backend, leave `VITE_API_URL` unset.

Add the frontend's exact origin to the backend's `FRONTEND_ORIGINS`; do not use `*`. Rebuild the frontend after changing `VITE_API_URL`.

## Public demo deployment on Render and MongoDB Atlas

1. Push the repository to GitHub. Create a MongoDB Atlas cluster and a database user with access only to the application database. Add the backend host's outbound IPs to the Atlas network access list; avoid allowing access from `0.0.0.0/0` where the host supports stable outbound IPs.
2. In Render, create a **Web Service** from the repository root. Use Python 3.11, build command `pip install -r backend/requirements.txt`, and start command `gunicorn --chdir backend app:app --bind 0.0.0.0:$PORT`. Add the backend environment variables from the table above. Set `INITIAL_ADMIN_EMAIL` to `admin@takecare`, set `INITIAL_ADMIN_PASSWORD` in Render's secret field to a unique strong password (16+ characters recommended), set `ALLOW_PATIENT_REGISTRATION=true`, and set `FRONTEND_ORIGINS` to the exact HTTPS URL of the static site after creating it. Set the Render health check path to `/health`.
3. Create a **Static Site** in Render from the same repository with root directory `frontend`, build command `npm ci && npm run build`, and publish directory `dist`. Set `VITE_API_URL` to the backend service's HTTPS base URL without a trailing slash or `/api`; set `VITE_ALLOW_PATIENT_REGISTRATION=true`. Trigger a new deploy after setting these build variables.
4. Add the static site's exact HTTPS origin (scheme and host, no path) to the backend's `FRONTEND_ORIGINS` environment variable, then redeploy the backend. Do not use a wildcard origin.
5. Wait for both services to finish deploying. Open `https://<backend-host>/health`; it should return a healthy response. Open the static site, sign in as `admin@takecare` using the secret configured on the backend, and check the dashboard and Settings. The record directories should be empty until you add records.
6. Confirm HTTPS is active, the patient registration option works, and the bootstrap password and MongoDB URI do not appear in the repository or built frontend. Configure provider-side backups and alerts before adding records.

For other hosts, apply the same settings: run the backend using the included `Procfile`, publish `frontend/dist`, set `VITE_API_URL` before building, and allow only the deployed frontend origin in `FRONTEND_ORIGINS`.

## Demo deployment checklist

1. Create a hosted MongoDB database and a database user limited to that database. Configure the provider's network allowlist for the backend host.
2. Deploy the backend from the repository root using the included `Procfile`, install `backend/requirements.txt`, and set the backend environment variables above. Use a unique bootstrap administrator password and keep it in the provider's secret store. Set `ALLOW_PATIENT_REGISTRATION=true` to offer patient self-registration, or `false` for an administrator-only demo.
3. Deploy `frontend/dist` as a static site. Set `VITE_API_URL` to the backend base URL before building, or configure the host to serve the frontend and reverse-proxy `/api` and `/health` to the backend.
4. Configure the static host's SPA fallback so application routes return `index.html`. Add only the deployed frontend origin to `FRONTEND_ORIGINS`, then rebuild/redeploy the frontend if its API URL changes.
5. Visit the backend `/health` endpoint, sign in as the bootstrap administrator, and verify the dashboard and Staff directory load. Use only disposable synthetic records while testing role-specific access.
6. Confirm the deployed site uses HTTPS and that no `.env` file, database URI, or bootstrap password is included in the frontend build or repository. Confirm unauthenticated API requests are rejected and that patient registration behaves according to `ALLOW_PATIENT_REGISTRATION`.

## Before hosting with real users

Do not expose this application to real patient data or treat its model output as medical advice. Before any real clinical deployment, obtain an independent security review; implement operational controls such as rate limiting, account recovery, audit/retention policies, monitoring, and managed secret rotation; secure sensitive data in transit and at rest; establish appropriate privacy/compliance controls and tested backups; and review the model clinically. CORS only restricts browser origins; it is not authentication.
