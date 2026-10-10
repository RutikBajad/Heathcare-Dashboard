# Deployment

This repository can be deployed as a **synthetic-data demonstration**. It is not a clinical system and must not be used with real patient information. The application includes role-based sign-in and API authorization, but is still a prototype and has not undergone a production security, privacy, compliance, or clinical review.

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
| `INITIAL_ADMIN_EMAIL` | Email for the bootstrap administrator; set with its password |
| `INITIAL_ADMIN_PASSWORD` | Unique bootstrap password of at least 12 characters; set as a host secret |
| `HOSPITAL_NAME` | Optional hospital name shown to signed-in patients |
| `HOSPITAL_ADDRESS` | Optional hospital address |
| `HOSPITAL_PHONE` | Optional hospital phone |
| `HOSPITAL_EMAIL` | Optional hospital email |
| `HOSPITAL_HOURS` | Optional visiting/operating hours |
| `PORT` | Set by the hosting provider |

Set both bootstrap admin credentials before deployment. The account is created on the first login/identity request when it does not already exist; changing these variables does not reset an existing account password. Patients can self-register. Administrators create staff accounts from the Staff or Add records pages, and create doctor or additional administrator accounts from Settings; doctor accounts must be linked to a doctor directory record. Administrators can narrow each account's visible pages within that role's permissions.

Restrict the MongoDB database user to the application database and allow network access only from the backend host where possible. Never commit `.env` or put database credentials in frontend variables.

## Frontend service

Build the `frontend` directory with:

```sh
npm ci
npm run build
```

Use Node.js `^20.19.0` or `>=22.12.0` for the Vite 8 build.

Publish `frontend/dist`. Configure `VITE_API_URL` to the backend's base URL **without** a trailing slash or `/api` (for example, `https://takecare-api.example.com`). Vite embeds this value into the built JavaScript, so set it before building. For a same-origin deployment that reverse-proxies `/api` and `/health` to the backend, leave `VITE_API_URL` unset.

Add the frontend's exact origin to the backend's `FRONTEND_ORIGINS`; do not use `*`. Rebuild the frontend after changing `VITE_API_URL`.

## Demo deployment checklist

1. Create a hosted MongoDB database and a database user limited to that database. Configure the provider's network allowlist for the backend host.
2. Deploy the backend from the repository root using the included `Procfile`, install `backend/requirements.txt`, and set the backend environment variables above. Use a unique bootstrap administrator password and keep it in the provider's secret store.
3. Deploy `frontend/dist` as a static site. Set `VITE_API_URL` to the backend base URL before building, or configure the host to serve the frontend and reverse-proxy `/api` and `/health` to the backend.
4. Configure the static host's SPA fallback so application routes return `index.html`. Add only the deployed frontend origin to `FRONTEND_ORIGINS`, then rebuild/redeploy the frontend if its API URL changes.
5. Visit the backend `/health` endpoint, sign in as the bootstrap administrator, and verify the dashboard and Staff directory load. Use only disposable synthetic records while testing role-specific access.
6. Confirm the deployed site uses HTTPS and that no `.env` file, database URI, or bootstrap password is included in the frontend build or repository.

## Before hosting with real users

Do not expose this application to real patient data or treat its model output as medical advice. Before any real clinical deployment, obtain an independent security review; implement operational controls such as rate limiting, account recovery, audit/retention policies, monitoring, and managed secret rotation; secure sensitive data in transit and at rest; establish appropriate privacy/compliance controls and tested backups; and review the model clinically. CORS only restricts browser origins; it is not authentication.
