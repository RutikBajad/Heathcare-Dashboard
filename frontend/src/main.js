import './styles/main.css';
import { Chart } from 'chart.js/auto';

const app = document.querySelector('#app');
const configuredApiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '');
const API_BASE_URL = `${configuredApiUrl.replace(/\/$/, '')}/api`;

const state = {
  theme: localStorage.getItem('theme') || 'light',
  authToken: sessionStorage.getItem('healthpilot-token') || '',
  currentUser: null,
  authMode: 'login',
  authError: '',
  currentPage: 'overview',
  doctorFilter: 'all',
  appointmentFilter: 'all',
  assessmentTab: 'heart',
  recordType: 'patient',
  formFeedback: '',
  appointmentFormOpen: false,
  diseaseFormOpen: false,
  sidebarOpen: window.innerWidth > 1024,
  patientRecords: [],
  doctors: [],
  appointments: [],
  todayAppointmentCount: 0,
  todayDate: '',
  diseases: [],
  users: [],
  accounts: [],
  hospitalInfo: null,
  assessments: [],
  searchHistory: [],
  modelPerformance: null,
  searchQuery: '',
  searchResults: null,
  searchFeedback: '',
  selectedRecord: null,
  dataError: '',
  dataNotice: '',
};

const navItems = [
  { id: 'overview', label: 'Overview' },
  { id: 'patients', label: 'Patients' },
  { id: 'diseases', label: 'Diseases' },
  { id: 'doctors', label: 'Doctors' },
  { id: 'staff', label: 'Staff' },
  { id: 'appointments', label: 'Appointments' },
  { id: 'hospital-info', label: 'Hospital information' },
  { id: 'add-record', label: 'Add records' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'ml-assessment', label: 'ML Assessment' },
  { id: 'model-performance', label: 'Model Performance' },
  { id: 'settings', label: 'Settings' },
];

const rolePages = {
  patient: ['appointments', 'hospital-info', 'doctors', 'settings'],
  doctor: ['patients', 'diseases', 'appointments', 'ml-assessment', 'model-performance'],
  staff: ['overview', 'patients', 'doctors', 'appointments', 'add-record', 'analytics'],
  admin: navItems.map((item) => item.id),
};

const recentActivity = [
  { name: 'Ananya Iyer', action: 'Diabetes review scheduled', time: '18 min ago' },
  { name: 'Rohan Mehta', action: 'Cardiology consultation requested', time: '42 min ago' },
  { name: 'Dr. Aditi Rao', action: 'Cardiac follow-up completed', time: '1 hr ago' },
  { name: 'Vikram Reddy', action: 'Kidney function review shared', time: '2 hrs ago' },
];

const chartPalette = {
  primary: '#0f766e',
  teal: '#2dd4bf',
  blue: '#3b82f6',
  gold: '#f59e0b',
  red: '#f87171',
  slate: '#64748b',
};

function userCanAccess(page) {
  return Boolean(state.currentUser?.allowedPages?.includes(page));
}

function renderAuthPage() {
  const isRegister = state.authMode === 'register';
  return `
    <main class="auth-shell">
      <section class="panel auth-panel">
        <div class="logo-mark">
          <div class="logo-dot"></div>
          <div><strong>HealthPilot</strong><div class="muted">Secure care dashboard</div></div>
        </div>
        <h1 class="page-title">${isRegister ? 'Create a patient account' : 'Welcome back'}</h1>
        <p class="page-subtitle">${isRegister ? 'Register to request and manage your appointments.' : 'Sign in with your account to continue.'}</p>
        ${state.authError ? `<div class="data-error" role="alert">${escapeHtml(state.authError)}</div>` : ''}
        <form id="auth-form" class="form-grid auth-form">
          ${isRegister ? `
            <div class="form-field"><label for="auth-name">Full name</label><input id="auth-name" name="name" autocomplete="name" required /></div>
            <div class="form-field"><label for="auth-age">Age</label><input id="auth-age" name="age" type="number" min="0" max="120" required /></div>
            <div class="form-field"><label for="auth-city">City</label><input id="auth-city" name="city" autocomplete="address-level2" /></div>
            <div class="form-field"><label for="auth-gender">Gender</label><select id="auth-gender" name="gender"><option value="">Select gender</option><option>Female</option><option>Male</option><option>Other</option><option>Prefer not to say</option></select></div>
          ` : ''}
          <div class="form-field"><label for="auth-email">Email</label><input id="auth-email" name="email" type="email" autocomplete="email" required /></div>
          <div class="form-field"><label for="auth-password">Password</label><input id="auth-password" name="password" type="password" autocomplete="${isRegister ? 'new-password' : 'current-password'}" ${isRegister ? 'minlength="12"' : ''} required />${isRegister ? '<span class="muted">At least 12 characters.</span>' : ''}</div>
          <div class="form-actions" style="grid-column:1/-1;"><button class="primary-button" type="submit">${isRegister ? 'Create patient account' : 'Sign in'}</button></div>
        </form>
        <p class="auth-switch">${isRegister ? 'Already registered?' : 'New patient?'} <button class="link-button" type="button" data-action="toggle-auth">${isRegister ? 'Sign in' : 'Create an account'}</button></p>
        <p class="muted auth-note">Staff, doctor, and administrator accounts are provisioned by an administrator.</p>
      </section>
    </main>
  `;
}

function renderIcon(iconName) {
  const icons = {
    overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V20h14v-9.5"/><path d="M9 20v-7h6v7"/></svg>',
    patients: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1"/><circle cx="10" cy="7" r="3"/><path d="M22 19v-1a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    diseases: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M3 12h18"/><circle cx="12" cy="12" r="9"/></svg>',
    doctors: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M2 12h20"/><circle cx="12" cy="12" r="7"/></svg>',
    appointments: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>',
    'hospital-info': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-5h6v5"/><path d="M9 9h.01M15 9h.01"/></svg>',
    'add-record': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
    analytics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18h18"/><path d="M7 14l3-3 3 2 5-7"/><path d="M18 6h2v2"/></svg>',
    'ml-assessment': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V6a3 3 0 1 1 6 0v5"/><path d="M5 12h14"/><rect x="4" y="12" width="16" height="8" rx="2"/></svg>',
    'model-performance': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15h4l2-6 4 10 2-4h4"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-.4-1.1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 4.34 17l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.8a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4 8.6a1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 6.99 3.8l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2.8a2 2 0 1 1 4 0v.09c0 .4.14.79.4 1.1.26.3.64.5 1 .6a1.7 1.7 0 0 0 1.87-.34l.06-.06A2 2 0 1 1 19.66 7l-.06.06A1.7 1.7 0 0 0 19.4 9c.25.28.4.67.4 1.1v.09a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.1.4 1.7 1.7 0 0 0-.6 1Z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6"/><path d="m16 16 5 5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 0 1 11.2 3a9 9 0 1 0 9.8 9.8Z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.93 19.07 1.41-1.41"/><path d="m17.66 6.34 1.41-1.41"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1"/><circle cx="10" cy="7" r="3"/><path d="M20 19v-1a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-8"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>',
  };
  return icons[iconName] || '';
}

function getStatusClass(status) {
  const normalized = status.toLowerCase();
  if (normalized.includes('stable') || normalized.includes('confirmed') || normalized.includes('completed') || normalized.includes('available')) return 'badge badge-success';
  if (normalized.includes('pending') || normalized.includes('monitoring') || normalized.includes('rescheduled') || normalized.includes('on rounds')) return 'badge badge-warning';
  if (normalized.includes('critical') || normalized.includes('danger') || normalized.includes('consulting')) return 'badge badge-danger';
  return 'badge badge-info';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

const recordTypeLabels = {
  patients: 'Patient',
  doctors: 'Doctor',
  appointments: 'Appointment',
  diseases: 'Disease',
  users: 'User profile',
};

function formatRecordField(value) {
  if (Array.isArray(value)) return value.length ? value.map(formatRecordField).join(', ') : 'None';
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, nestedValue]) => `${formatFieldLabel(key)}: ${formatRecordField(nestedValue)}`).join('; ');
  }
  if (value === null || value === undefined || value === '') return 'Not provided';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function formatFieldLabel(field) {
  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function renderRecordDetail() {
  const selected = state.selectedRecord;
  if (!selected) {
    return '<section class="panel"><p class="muted">Choose a record from search results to view its details.</p></section>';
  }

  const { type, record } = selected;
  const title = record.name || (type === 'appointments' ? record.reason : record.patient) || record.id || recordTypeLabels[type];
  const fields = Object.entries(record)
    .filter(([key]) => key !== '_id')
    .map(([key, value]) => `
      <div class="record-detail-field">
        <dt>${escapeHtml(formatFieldLabel(key))}</dt>
        <dd>${escapeHtml(formatRecordField(value))}</dd>
      </div>
    `).join('');

  let relatedRecords = [];
  let relatedType = '';
  if (type === 'patients') {
    relatedType = 'Related appointments';
    relatedRecords = state.appointments.filter((appointment) => appointment.patient === record.name);
  } else if (type === 'doctors') {
    relatedType = 'Related appointments';
    relatedRecords = state.appointments.filter((appointment) => appointment.doctor === record.name);
  } else if (type === 'diseases') {
    relatedType = 'Patients with this condition';
    relatedRecords = state.patientRecords.filter((patient) => (patient.conditions || []).includes(record.id));
  }

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">${escapeHtml(title)}</h1>
        <p class="page-subtitle">${escapeHtml(recordTypeLabels[type] || 'Record')} details</p>
      </div>
      <button class="secondary-button" type="button" data-action="back-to-search">Back to search results</button>
    </div>
    <section class="panel">
      <div class="panel-header"><h2 class="panel-title">Record information</h2></div>
      <dl class="record-detail-grid">${fields}</dl>
    </section>
    ${relatedType ? `
      <section class="panel" style="margin-top:1.25rem;">
        <div class="panel-header"><h2 class="panel-title">${relatedType}</h2></div>
        ${relatedRecords.length ? `
          <div class="search-results-grid">
            ${relatedRecords.map((relatedRecord) => `
              <button class="search-record-card" type="button" data-related-type="${type === 'diseases' ? 'patients' : 'appointments'}" data-related-id="${escapeHtml(relatedRecord.id || '')}">
                <strong>${escapeHtml(relatedRecord.name || relatedRecord.patient || relatedRecord.reason || relatedRecord.id)}</strong>
                <span>${escapeHtml([relatedRecord.date, relatedRecord.time, relatedRecord.doctor, relatedRecord.status].filter(Boolean).join(' · '))}</span>
              </button>
            `).join('')}
          </div>
        ` : '<p class="muted">No related records found.</p>'}
      </section>
    ` : ''}
  `;
}

function renderSearchResultsPage() {
  const entries = Object.entries(state.searchResults || {});
  const resultCount = entries.reduce((total, [, records]) => total + records.length, 0);
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Search results</h1>
        <p class="page-subtitle">${resultCount} record${resultCount === 1 ? '' : 's'} found for “${escapeHtml(state.searchQuery)}”. Select a record to view its full profile.</p>
      </div>
      <button class="secondary-button" type="button" data-action="new-search">New search</button>
    </div>
    ${resultCount ? entries.filter(([, records]) => records.length).map(([type, records]) => `
      <section class="panel search-results-section">
        <div class="panel-header"><h2 class="panel-title">${escapeHtml(recordTypeLabels[type] || type)} records</h2><span class="value-pill">${records.length}</span></div>
        <div class="search-results-grid">
          ${records.map((record) => {
            const title = record.name || record.patient || record.id || 'Record';
            const details = [record.id, record.specialty, record.reason, record.category, record.email, record.status]
              .filter(Boolean)
              .join(' · ');
            return `
              <button class="search-record-card" type="button" data-record-type="${type}" data-record-id="${escapeHtml(record.id || '')}">
                <strong>${escapeHtml(title)}</strong>
                <span>${escapeHtml(details || recordTypeLabels[type])}</span>
                <span class="search-record-link">View full profile →</span>
              </button>
            `;
          }).join('')}
        </div>
      </section>
    `).join('') : '<section class="panel"><p class="muted">No records matched that search. Try another name, ID, city, condition, or status.</p></section>'}
  `;
}

function getDemographicCounts() {
  const counts = Array(6).fill(0);
  state.patientRecords.forEach((patient) => {
    const age = Number(patient.age);
    const band = age < 30 ? 0 : age < 40 ? 1 : age < 50 ? 2 : age < 60 ? 3 : age < 70 ? 4 : 5;
    counts[band] += 1;
  });
  return counts;
}

function getPatientActivityByMonth() {
  const months = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (6 - index));
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: date.toLocaleString(undefined, { month: 'short' }),
      count: 0,
    };
  });
  state.patientRecords.forEach((patient) => {
    if (!patient.lastVisit) return;
    const visitDate = new Date(`${patient.lastVisit}T00:00:00`);
    const month = months.find((item) => item.key === `${visitDate.getFullYear()}-${visitDate.getMonth()}`);
    if (month) month.count += 1;
  });
  return months;
}

function getAppointmentWeekdayCounts() {
  const counts = Array(7).fill(0);
  state.appointments.forEach((appointment) => {
    const day = new Date(`${appointment.date}T00:00:00`).getDay();
    counts[day] += 1;
  });
  return counts;
}

function renderOverview() {
  const kpis = [
    { label: 'Patients', value: state.patientRecords.length, change: 'MongoDB records', icon: 'users' },
    { label: 'Doctors', value: state.doctors.length, change: 'MongoDB records', icon: 'doctors' },
    { label: 'Appointments', value: state.appointments.length, change: 'MongoDB records', icon: 'appointments' },
    { label: 'Assessments', value: state.assessments.length, change: 'Saved predictions', icon: 'ml-assessment' },
  ];

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Clinical overview</h1>
        <p class="page-subtitle">MongoDB-backed snapshot of current patients, care teams, and appointments.</p>
      </div>
      <button class="primary-button" type="button"><span>${renderIcon('plus')}</span> Export report</button>
    </div>
    <section class="overview-hero">
      <div class="hero-copy">
        <span class="hero-badge">Care pulse</span>
        <h2>Patient and care-team records are connected.</h2>
        <p>Counts and charts use MongoDB records. Recent activity is illustrative demo content.</p>
        <div class="hero-actions">
          <button class="primary-button" type="button">View alerts</button>
          <button class="secondary-button" type="button">Download summary</button>
        </div>
      </div>
      <div class="hero-metrics">
        <div class="mini-stat">
          <span class="muted">Patient records</span>
          <strong>${state.patientRecords.length}</strong>
        </div>
        <div class="mini-stat accent">
          <span class="muted">High-risk patients</span>
          <strong>${state.patientRecords.filter((patient) => patient.risk.toLowerCase() === 'high').length}</strong>
        </div>
        <div class="mini-stat">
          <span class="muted">Appointments</span>
          <strong>${state.appointments.length}</strong>
        </div>
      </div>
    </section>
    <div class="grid grid-4">
      ${kpis.map((item) => `
        <article class="stat-card">
          <div class="stat-header">
            <span>${item.label}</span>
            <span class="stat-icon">${renderIcon(item.icon)}</span>
          </div>
          <p class="stat-value">${item.value}</p>
          <span class="stat-change">▲ ${item.change}</span>
        </article>
      `).join('')}
    </div>
    <div class="grid grid-2" style="margin-top: 1.25rem;">
      <section class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Patient activity</h2>
          <button class="ghost-button" type="button">Last 7 days</button>
        </div>
        <div class="chart-box">
          <canvas data-chart="activity"></canvas>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Appointment status</h2>
          <button class="ghost-button" type="button">This month</button>
        </div>
        <div class="chart-box" style="max-height: 260px;">
          <canvas data-chart="doughnut"></canvas>
        </div>
      </section>
    </div>
    <div class="grid grid-2" style="margin-top: 1.25rem;">
      <section class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Patient demographics</h2>
          <button class="ghost-button" type="button">Age bands</button>
        </div>
        <div class="chart-box">
          <canvas data-chart="demographics"></canvas>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Recent activity</h2>
          <button class="ghost-button" type="button">See all</button>
        </div>
        <ul class="list">
          ${recentActivity.map((item) => `
            <li class="activity-item">
              <div class="activity-left">
                <div class="avatar">${item.name.split(' ').map((part) => part[0]).slice(0,2).join('')}</div>
                <div>
                  <div>${item.name}</div>
                  <div class="muted">${item.action}</div>
                </div>
              </div>
              <span class="muted">${item.time}</span>
            </li>
          `).join('')}
        </ul>
      </section>
    </div>
  `;
}

function renderPatients() {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Patients</h1>
        <p class="page-subtitle">Search, review, and manage patient records.</p>
      </div>
      ${state.currentUser.role !== 'doctor' ? '<button class="primary-button" type="button" data-action="add-record" data-record-type="patient"><span>+</span> Add patient</button>' : ''}
    </div>
    <section class="panel" style="margin-bottom: 1.25rem;">
      <div class="panel-header">
        <h2 class="panel-title">Patient directory</h2>
      </div>
      <div class="form-grid">
        <div class="form-field">
          <label>Search patient</label>
          <input type="text" placeholder="Search by name, ID, or status" />
        </div>
        <div class="form-field">
          <label>Risk filter</label>
          <select>
            <option>All patients</option>
            <option>Low risk</option>
            <option>Medium risk</option>
            <option>High risk</option>
          </select>
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Age</th>
              <th>Status</th>
              <th>Last visit</th>
              <th>Conditions</th>
              <th>Risk</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${state.patientRecords.map((patient) => `
              <tr>
                <td>
                  <div class="patient-info">
                    <div class="patient-avatar">${patient.name.split(' ').map((part) => part[0]).slice(0,2).join('')}</div>
                    <div>
                      <strong>${escapeHtml(patient.name)}</strong><br>
                      <span class="muted">${escapeHtml(patient.id)}</span>
                    </div>
                  </div>
                </td>
                <td>${escapeHtml(patient.age)}</td>
                <td><span class="${getStatusClass(patient.status)}">${escapeHtml(patient.status)}</span></td>
                <td>${escapeHtml(patient.lastVisit)}</td>
                <td>${escapeHtml((patient.conditions || []).map((condition) => state.diseases.find((disease) => disease.id === condition)?.name || condition).join(', ') || 'None listed')}</td>
                <td><span class="${getStatusClass(patient.risk)}">${escapeHtml(patient.risk)}</span></td>
                <td>
                  <div class="topbar-actions">
                    <button class="ghost-button" type="button" data-action="view-patient" data-patient-id="${escapeHtml(patient.id)}">View</button>
                    ${['doctor', 'admin'].includes(state.currentUser.role) ? `<button class="secondary-button" type="button" data-action="edit-patient" data-patient-id="${escapeHtml(patient.id)}">Edit</button>` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDiseases() {
  if (state.diseaseFormOpen) {
    return renderRecordForm();
  }
  const diseasesByCategory = state.diseases.reduce((groups, disease) => {
    groups[disease.category] = (groups[disease.category] || 0) + 1;
    return groups;
  }, {});

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Disease reference</h1>
        <p class="page-subtitle">Synthetic condition reference data linked to the demo patient records.</p>
      </div>
      <button class="primary-button" type="button" data-action="add-disease"><span>${renderIcon('plus')}</span> Add disease</button>
    </div>
    <div class="grid grid-4" style="margin-bottom:1.25rem;">
      ${Object.entries(diseasesByCategory).map(([category, count]) => `
        <article class="stat-card">
          <div class="stat-header"><span>${category}</span><span class="stat-icon">${renderIcon('diseases')}</span></div>
          <p class="stat-value">${count}</p>
          <div class="muted">Reference conditions</div>
        </article>
      `).join('')}
    </div>
    <section class="panel">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Condition</th><th>Category</th><th>Demo patients</th><th>Description</th></tr></thead>
          <tbody>
            ${state.diseases.map((disease) => {
              const patientCount = state.patientRecords.filter((patient) => (patient.conditions || []).includes(disease.id)).length;
              return `<tr><td><strong>${escapeHtml(disease.name)}</strong></td><td>${escapeHtml(disease.category)}</td><td>${patientCount}</td><td>${escapeHtml(disease.description)}</td></tr>`;
            }).join('')}
            ${state.diseases.length ? '' : '<tr><td colspan="4">No disease reference records found.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDoctors() {
  const results = state.doctors.map((doctor) => {
    const doctorAppointments = state.appointments.filter((appointment) => appointment.doctor === doctor.name);
    return `
      <article class="doctor-card">
        <div class="doctor-info">
          <div class="doctor-avatar">${doctor.name.split(' ').map((part) => part[0]).slice(0,2).join('')}</div>
          <div>
            <strong>${escapeHtml(doctor.name)}</strong>
              <div class="muted">${escapeHtml(doctor.specialty)}</div>
          </div>
        </div>
        <div class="kpi-inline" style="margin-top: 1rem;">
          <span>${doctor.department}</span>
          <span class="value-pill">${doctor.availability}</span>
        </div>
        <div class="mini-table" style="margin-top: 1rem;">
          <tr><td>Appointments</td><td>${doctorAppointments.length}</td></tr>
          <tr><td>Location</td><td>${doctor.city || doctor.department}</td></tr>
        </div>
      </article>
    `;
  }).join('');

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Doctors</h1>
        <p class="page-subtitle">Care team overview across specialties and departments.</p>
      </div>
      <button class="primary-button" type="button" data-action="add-record" data-record-type="doctor"><span>${renderIcon('plus')}</span> Add doctor</button>
    </div>
    <section class="panel">
      <div class="panel-header">
        <h2 class="panel-title">Clinical staff</h2>
        <select style="min-width: 180px; border: 1px solid var(--border); border-radius: 0.8rem; background: var(--surface); color: var(--text); padding: 0.65rem 0.8rem;">
          <option>All departments</option>
          <option>Cardiology</option>
          <option>Primary Care</option>
          <option>Imaging</option>
          <option>Metabolic Health</option>
        </select>
      </div>
      <div class="doctor-grid">${results}</div>
    </section>
  `;
}

function renderStaff() {
  const staffAccounts = state.accounts.filter((account) => account.role === 'staff');
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Staff</h1>
        <p class="page-subtitle">Staff accounts and their linked staff profiles.</p>
      </div>
      <button class="primary-button" type="button" data-action="add-record" data-record-type="staff"><span>${renderIcon('plus')}</span> Add staff</button>
    </div>
    <section class="panel">
      <div class="panel-header">
        <h2 class="panel-title">Staff directory</h2>
        <span class="value-pill">${staffAccounts.length} staff</span>
      </div>
      <div class="doctor-grid">
        ${staffAccounts.map((account) => {
          const profile = state.users.find((user) => user.accountId === account.id);
          return `
            <article class="doctor-card">
              <div class="doctor-info">
                <div class="doctor-avatar">${escapeHtml(account.name.split(' ').map((part) => part[0]).slice(0, 2).join(''))}</div>
                <div>
                  <strong>${escapeHtml(account.name)}</strong>
                  <div class="muted">Staff member</div>
                </div>
              </div>
              <div class="mini-table" style="margin-top: 1rem;">
                <tr><td>Email</td><td>${escapeHtml(account.email)}</td></tr>
                <tr><td>Account ID</td><td>${escapeHtml(account.id)}</td></tr>
                <tr><td>Profile</td><td>${profile ? escapeHtml(profile.id) : 'Linked to account'}</td></tr>
              </div>
            </article>
          `;
        }).join('') || '<div class="placeholder-box">No staff accounts have been added yet.</div>'}
      </div>
    </section>
  `;
}

function renderAppointments() {
  if (state.appointmentFormOpen) {
    return renderRecordForm();
  }
  if (state.currentUser.role === 'patient') {
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Appointments</h1>
          <p class="page-subtitle">Request an appointment and see how many you have scheduled for today.</p>
        </div>
        <button class="primary-button" type="button" data-action="book-appointment"><span>+</span> Request appointment</button>
      </div>
      <section class="panel appointment-count-panel" aria-label="Today's appointment count">
        <div class="muted">Appointments scheduled for ${escapeHtml(state.todayDate || 'today')}</div>
        <p class="stat-value">${Number(state.todayAppointmentCount) || 0}</p>
        <div class="muted">Only the count is shown. Appointment details are not displayed here.</div>
      </section>
    `;
  }
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Appointments</h1>
        <p class="page-subtitle">Upcoming consultations, checkups, and follow-ups.</p>
      </div>
      ${state.currentUser.role !== 'doctor' ? '<button class="primary-button" type="button" data-action="add-record" data-record-type="appointment"><span>+</span> New appointment</button>' : ''}
    </div>
    <section class="panel">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Date</th>
              <th>Time</th>
              <th>Doctor</th>
              <th>Reason</th>
              <th>Status</th>
              ${state.currentUser.role === 'doctor' || state.currentUser.role === 'admin' ? '<th>Update status</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${state.appointments.map((appointment) => `
              <tr>
                <td>${escapeHtml(appointment.patient)}</td>
                <td>${escapeHtml(appointment.date)}</td>
                <td>${escapeHtml(appointment.time)}</td>
                <td>${escapeHtml(appointment.doctor)}</td>
                <td>${escapeHtml(appointment.reason || 'Consultation')}</td>
                <td><span class="${getStatusClass(appointment.status)}">${escapeHtml(appointment.status)}</span></td>
                ${state.currentUser.role === 'doctor' || state.currentUser.role === 'admin' ? `
                  <td><select data-appointment-status="${escapeHtml(appointment.id)}" aria-label="Update status for ${escapeHtml(appointment.patient)}">
                    ${['Pending', 'Confirmed', 'Completed', 'Rescheduled', 'Cancelled'].map((status) => `<option ${appointment.status === status ? 'selected' : ''}>${status}</option>`).join('')}
                  </select></td>
                ` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderHospitalInfo() {
  const hospital = state.hospitalInfo || {};
  const fields = [
    ['Hospital', hospital.name],
    ['Address', hospital.address],
    ['Phone', hospital.phone],
    ['Email', hospital.email],
    ['Hours', hospital.hours],
  ];
  return `
    <div class="page-header"><div><h1 class="page-title">Hospital information</h1><p class="page-subtitle">Contact details and visiting information.</p></div></div>
    <section class="panel"><dl class="record-detail-grid">${fields.map(([label, value]) => `
      <div class="record-detail-field"><dt>${label}</dt><dd>${escapeHtml(value || 'Not provided')}</dd></div>
    `).join('')}</dl></section>
  `;
}

function renderAnalytics() {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Analytics</h1>
        <p class="page-subtitle">Trend analysis for patient utilization, appointments, and cohort health.</p>
      </div>
      <div class="topbar-actions">
        <button class="secondary-button" type="button">30 days</button>
        <button class="primary-button" type="button">This quarter</button>
      </div>
    </div>
    <div class="grid grid-3">
      <section class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Patient activity</h2>
        </div>
        <div class="chart-box"><canvas data-chart="analyticsTrend"></canvas></div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Appointment trends</h2>
        </div>
        <div class="chart-box"><canvas data-chart="appointmentsTrend"></canvas></div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Demographic mix</h2>
        </div>
        <div class="chart-box"><canvas data-chart="demographicBar"></canvas></div>
      </section>
    </div>
  `;
}

function getHeartDiseaseFields() {
  return `
    <div class="form-grid">
      <div class="form-field">
        <label>Age</label>
        <input type="number" name="age" min="0" max="120" value="52" />
      </div>
      <div class="form-field">
        <label>Sex</label>
        <select name="sex"><option value="1">Male</option><option value="0">Female</option></select>
      </div>
      <div class="form-field">
        <label>Chest pain type</label>
        <select name="cp"><option value="1">Typical angina</option><option value="2">Atypical angina</option><option value="3">Non-anginal pain</option><option value="4">Asymptomatic</option></select>
      </div>
      <div class="form-field">
        <label>Resting blood pressure</label>
        <input type="number" name="trestbps" value="128" />
      </div>
      <div class="form-field">
        <label>Cholesterol</label>
        <input type="number" name="chol" value="212" />
      </div>
      <div class="form-field">
        <label>Fasting blood sugar</label>
        <select name="fbs"><option value="0">No</option><option value="1">Yes</option></select>
      </div>
      <div class="form-field">
        <label>Resting ECG</label>
        <select name="restecg"><option value="0">Normal</option><option value="1">ST-T abnormality</option><option value="2">Left ventricular hypertrophy</option></select>
      </div>
      <div class="form-field">
        <label>Max heart rate</label>
        <input type="number" name="thalach" value="168" />
      </div>
      <div class="form-field">
        <label>Exercise induced angina</label>
        <select name="exang"><option value="0">No</option><option value="1">Yes</option></select>
      </div>
      <div class="form-field">
        <label>Oldpeak</label>
        <input type="number" step="0.1" name="oldpeak" value="1.2" />
      </div>
      <div class="form-field">
        <label>Slope</label>
        <select name="slope"><option value="1">Upsloping</option><option value="2">Flat</option><option value="3">Downsloping</option></select>
      </div>
      <div class="form-field">
        <label>Major vessels</label>
        <select name="ca"><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select>
      </div>
      <div class="form-field" style="grid-column: 1 / -1;">
        <label>Thalassemia</label>
        <select name="thal"><option value="3">Normal</option><option value="6">Fixed defect</option><option value="7">Reversible defect</option></select>
      </div>
    </div>
  `;
}

function renderAssessment() {
  const isHeartTab = state.assessmentTab === 'heart';

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">ML assessment</h1>
        <p class="page-subtitle">${isHeartTab ? 'Submit a patient risk snapshot to the heart disease model.' : 'Diabetes model is being developed and will be connected soon.'}</p>
      </div>
    </div>

    <section class="panel">
      <div class="assessment-tabs" style="display:flex; gap:0.75rem; margin-bottom:1rem; flex-wrap:wrap;">
        <button type="button" class="assessment-tab ${isHeartTab ? 'active' : ''}" data-assessment-tab="heart">Heart disease prediction</button>
        <button type="button" class="assessment-tab ${!isHeartTab ? 'active' : ''}" data-assessment-tab="diabetes">Diabetes detection</button>
      </div>

      ${isHeartTab ? `
        <form id="ml-form">
          ${getHeartDiseaseFields()}
          <div class="form-actions" style="margin-top:1rem;">
            <button type="reset" class="ghost-button">Reset</button>
            <button type="submit" class="primary-button">Assess patient</button>
          </div>
          <div id="assessment-result" class="placeholder-box" style="margin-top: 1rem;">Ready for prediction.</div>
        </form>
      ` : `
        <div class="placeholder-box" style="min-height: 220px; display:flex; align-items:center; justify-content:center; text-align:center; line-height:1.6;">
          Working on this model.<br>
          The diabetes detection model is still in development and will be connected here soon.
        </div>
      `}
    </section>
    <section class="panel" style="margin-top:1.25rem;">
      <div class="panel-header"><h2 class="panel-title">Recent heart disease assessments</h2></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Patient</th><th>Model result</th><th>Probability</th><th>Date</th></tr></thead>
          <tbody>
            ${state.assessments.map((assessment) => `
              <tr>
                <td>${assessment.patientName || 'Demo assessment'}</td>
                <td><span class="${getStatusClass(assessment.risk_level || 'Low risk')}">${assessment.risk_level || 'Unknown'}</span></td>
                <td>${(Number(assessment.probability || 0) * 100).toFixed(1)}%</td>
                <td>${assessment.createdAt ? new Date(assessment.createdAt).toLocaleDateString() : '—'}</td>
              </tr>
            `).join('')}
            ${state.assessments.length ? '' : '<tr><td colspan="4">No assessments saved yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderModelPerformance() {
  const performance = state.modelPerformance || {};
  const metrics = [
    { label: 'Accuracy', value: performance.accuracy },
    { label: 'Precision', value: performance.precision },
    { label: 'Recall', value: performance.recall },
    { label: 'F1 Score', value: performance.f1 },
    { label: 'ROC-AUC', value: performance.rocAuc },
  ];

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Model performance</h1>
        <p class="page-subtitle">Evaluation metrics stored in MongoDB. No metrics are fabricated when an evaluation has not been saved.</p>
      </div>
      <button class="secondary-button" type="button" data-action="refresh-data">Refresh metrics</button>
    </div>
    <div class="grid grid-3" style="margin-bottom: 1.25rem;">
      ${metrics.map((metric) => `
        <article class="stat-card">
          <div class="stat-header">
            <span>${metric.label}</span>
            <span class="stat-icon">${renderIcon('chart')}</span>
          </div>
          <p class="stat-value">${metric.value !== undefined && metric.value !== null && Number.isFinite(Number(metric.value)) ? `${(Number(metric.value) * 100).toFixed(1)}%` : 'No data'}</p>
          <div class="muted">${performance.createdAt ? `Updated ${new Date(performance.createdAt).toLocaleString()}` : 'No evaluation saved'}</div>
        </article>
      `).join('')}
    </div>
    <div class="grid grid-2">
      <section class="panel">
        <div class="panel-header">
          <h2 class="panel-title">ROC curve</h2>
        </div>
        ${Array.isArray(performance.rocCurve) && performance.rocCurve.length ? '<div class="chart-box"><canvas data-chart="rocCurve"></canvas></div>' : '<div class="placeholder-box">ROC curve data has not been saved.</div>'}
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Confusion matrix</h2>
        </div>
        ${Array.isArray(performance.confusionMatrix) && performance.confusionMatrix.length ? '<div class="chart-box"><canvas data-chart="confusionMatrix"></canvas></div>' : '<div class="placeholder-box">Confusion matrix data has not been saved.</div>'}
      </section>
    </div>
  `;
}

function renderRecordForm() {
  const availableRecordTypes = state.currentUser.role === 'admin'
    ? ['patient', 'doctor', 'appointment', 'disease', 'staff']
    : state.currentUser.role === 'staff'
      ? ['patient', 'doctor', 'appointment', 'disease']
    : state.currentUser.role === 'doctor'
      ? ['disease']
      : ['appointment'];
  if (!availableRecordTypes.includes(state.recordType)) {
    state.recordType = availableRecordTypes[0];
  }
  const formDefinitions = {
    patient: {
      title: 'Add patient',
      description: 'Create a patient record in the connected MongoDB database.',
      fields: `
        <div class="form-field"><label for="record-name">Full name</label><input id="record-name" name="name" autocomplete="name" required /></div>
        <div class="form-field"><label for="record-age">Age</label><input id="record-age" name="age" type="number" min="0" max="120" required /></div>
        <div class="form-field"><label for="record-city">City</label><input id="record-city" name="city" placeholder="e.g. Mumbai" /></div>
        <div class="form-field"><label for="record-gender">Gender</label><select id="record-gender" name="gender"><option value="">Select gender</option><option>Female</option><option>Male</option><option>Other</option><option>Prefer not to say</option></select></div>
        <div class="form-field"><label for="record-blood-group">Blood group</label><select id="record-blood-group" name="bloodGroup"><option value="">Select blood group</option>${['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((group) => `<option>${group}</option>`).join('')}</select></div>
        <div class="form-field"><label for="record-status">Status</label><select id="record-status" name="status"><option>Stable</option><option>Monitoring</option><option>Critical</option></select></div>
        <div class="form-field"><label for="record-risk">Risk level</label><select id="record-risk" name="risk"><option>Low</option><option>Medium</option><option>High</option></select></div>
        <div class="form-field"><label for="record-last-visit">Last visit</label><input id="record-last-visit" name="lastVisit" type="date" /></div>
        <div class="form-field" style="grid-column:1 / -1;"><label for="record-conditions">Conditions</label><select id="record-conditions" name="conditions" multiple size="5">${state.diseases.map((disease) => `<option value="${escapeHtml(disease.id)}">${escapeHtml(disease.name)}</option>`).join('')}</select></div>
      `,
    },
    doctor: {
      title: 'Add doctor',
      description: 'Add a clinician to the care team directory.',
      fields: `
        <div class="form-field"><label for="record-name">Full name</label><input id="record-name" name="name" autocomplete="name" required /></div>
        <div class="form-field"><label for="record-specialty">Specialty</label><input id="record-specialty" name="specialty" required /></div>
        <div class="form-field"><label for="record-department">Department</label><input id="record-department" name="department" required /></div>
        <div class="form-field"><label for="record-city">City</label><input id="record-city" name="city" placeholder="e.g. Bengaluru" /></div>
        <div class="form-field"><label for="record-availability">Availability</label><select id="record-availability" name="availability"><option>Available</option><option>On rounds</option><option>Unavailable</option></select></div>
      `,
    },
    appointment: {
      title: 'New appointment',
      description: state.currentUser.role === 'patient' ? 'Request an appointment with a doctor.' : 'Schedule an appointment for a patient with a doctor.',
      fields: `
        ${state.currentUser.role === 'patient' ? '' : `<div class="form-field"><label for="record-patient">Patient</label><select id="record-patient" name="patient" required><option value="">Select patient</option>${state.patientRecords.map((patient) => `<option>${escapeHtml(patient.name)}</option>`).join('')}</select></div>`}
        <div class="form-field"><label for="record-doctor">Doctor</label><select id="record-doctor" name="doctor" required><option value="">Select doctor</option>${state.doctors.map((doctor) => `<option>${escapeHtml(doctor.name)}</option>`).join('')}</select></div>
        <div class="form-field"><label for="record-date">Date</label><input id="record-date" name="date" type="date" required /></div>
        <div class="form-field"><label for="record-time">Time</label><input id="record-time" name="time" type="time" required /></div>
        <div class="form-field"><label for="record-reason">Reason</label><input id="record-reason" name="reason" placeholder="e.g. Cardiology follow-up" required /></div>
        ${state.currentUser.role === 'patient' ? '' : '<div class="form-field"><label for="record-status">Status</label><select id="record-status" name="status"><option>Confirmed</option><option>Pending</option><option>Completed</option><option>Rescheduled</option></select></div>'}
      `,
    },
    disease: {
      title: 'Add disease',
      description: 'Add a condition to the disease reference list.',
      fields: `
        <div class="form-field"><label for="record-name">Disease name</label><input id="record-name" name="name" required /></div>
        <div class="form-field"><label for="record-category">Category</label><input id="record-category" name="category" placeholder="e.g. Cardiovascular" required /></div>
        <div class="form-field" style="grid-column:1 / -1;"><label for="record-description">Description</label><textarea id="record-description" name="description" rows="4" required></textarea></div>
      `,
    },
    staff: {
      title: 'Add staff account',
      description: 'Create a staff login and linked staff profile. The staff member can sign in with the email and password entered here.',
      fields: `
        <div class="form-field"><label for="record-name">Full name</label><input id="record-name" name="name" autocomplete="name" required /></div>
        <div class="form-field"><label for="record-email">Email</label><input id="record-email" name="email" type="email" autocomplete="email" required /></div>
        <div class="form-field"><label for="record-password">Temporary password</label><input id="record-password" name="password" type="password" autocomplete="new-password" minlength="12" required /><span class="muted">At least 12 characters.</span></div>
      `,
    },
  };
  const definition = formDefinitions[state.recordType] || formDefinitions.patient;

  return `
    <div class="page-header">
      <div><h1 class="page-title">${definition.title}</h1><p class="page-subtitle">${definition.description}</p></div>
      ${availableRecordTypes.length > 1 ? `<div class="form-field" style="min-width:180px;">
        <label for="record-type-select">Record type</label>
        <select id="record-type-select">
          ${availableRecordTypes.map((type) => `<option value="${type}" ${state.recordType === type ? 'selected' : ''}>${type[0].toUpperCase()}${type.slice(1)}</option>`).join('')}
        </select>
      </div>` : ''}
    </div>
    <section class="panel">
      <div class="panel-header"><h2 class="panel-title">${definition.title}</h2></div>
      ${state.formFeedback ? `<div class="data-error" role="alert">${escapeHtml(state.formFeedback)}</div>` : ''}
      <form id="record-form" class="form-grid">
        ${definition.fields}
        <div class="form-actions" style="grid-column:1 / -1;">
          <button type="button" class="ghost-button" data-action="cancel-record">Cancel</button>
          <button type="submit" class="primary-button">Save ${state.recordType}</button>
        </div>
      </form>
    </section>
  `;
}

function renderSettings() {
  const adminPanel = state.currentUser.role === 'admin' ? `
    <section class="panel">
      <div class="panel-header"><h2 class="panel-title">Create an account</h2></div>
      ${state.formFeedback ? `<div class="data-error" role="alert">${escapeHtml(state.formFeedback)}</div>` : ''}
      <form id="account-form" class="form-grid">
        <div class="form-field"><label for="account-name">Full name</label><input id="account-name" name="name" required /></div>
        <div class="form-field"><label for="account-email">Email</label><input id="account-email" name="email" type="email" required /></div>
        <div class="form-field"><label for="account-password">Temporary password</label><input id="account-password" name="password" type="password" minlength="12" required /><span class="muted">At least 12 characters.</span></div>
        <div class="form-field"><label for="account-role">Role</label><select id="account-role" name="role" required><option value="">Select role</option><option value="doctor">Doctor</option><option value="staff">Staff</option><option value="admin">Administrator</option></select></div>
        <div class="form-field" id="account-doctor-field" hidden><label for="account-doctor">Linked doctor record</label><select id="account-doctor" name="doctorName"><option value="">Select doctor</option>${state.doctors.map((doctor) => `<option>${escapeHtml(doctor.name)}</option>`).join('')}</select></div>
        <div class="form-actions" style="grid-column:1/-1"><button class="primary-button" type="submit">Create account</button></div>
      </form>
    </section>
    <section class="panel">
      <div class="panel-header"><h2 class="panel-title">Accounts and page access</h2></div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Account</th><th>Role</th><th>Visible pages</th><th></th></tr></thead>
        <tbody>${state.accounts.map((account) => `
          <tr><td><strong>${escapeHtml(account.name)}</strong><br><span class="muted">${escapeHtml(account.email)}</span></td>
          <td>${escapeHtml(account.role)}</td>
          <td><div class="permission-list">${(rolePages[account.role] || []).map((page) => {
            const label = navItems.find((item) => item.id === page)?.label || page;
            return `<label><input type="checkbox" data-account-page="${escapeHtml(account.id)}" value="${escapeHtml(page)}" ${account.allowedPages.includes(page) ? 'checked' : ''} /> ${escapeHtml(label)}</label>`;
          }).join('')}</div></td>
          <td><button class="secondary-button" type="button" data-action="save-permissions" data-account-id="${escapeHtml(account.id)}">Save</button></td></tr>
        `).join('') || '<tr><td colspan="4">No accounts found.</td></tr>'}</tbody>
      </table></div>
    </section>
    <section class="panel">
      <div class="panel-header"><h2 class="panel-title">Staff profiles</h2></div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Profile ID</th></tr></thead>
        <tbody>${state.users.filter((user) => user.role?.toLowerCase() === 'staff').map((user) => `
          <tr><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.email)}</td><td>${escapeHtml(user.id)}</td></tr>
        `).join('') || '<tr><td colspan="3">No staff profiles have been created.</td></tr>'}</tbody>
      </table></div>
    </section>
  ` : '';
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Customize the dashboard experience and project preferences.</p>
      </div>
    </div>
    <div class="grid grid-2">
      <section class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Preference center</h2>
        </div>
        <div class="list">
          <div class="metric-row">
            <div>Theme preference</div>
            <button class="secondary-button" type="button" id="theme-toggle-inline">${state.theme === 'dark' ? 'Dark theme' : 'Light theme'}</button>
          </div>
          <div class="metric-row">
            <div>Compact layout</div>
            <span class="value-pill">Enabled</span>
          </div>
          <div class="metric-row">
            <div>Clinical summary alerts</div>
            <span class="value-pill">On</span>
          </div>
        </div>
      </section>
      ${adminPanel}
      <section class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Recent search history</h2>
          <button class="secondary-button" type="button" data-action="refresh-data">Refresh</button>
        </div>
        <div class="list">
          ${state.searchHistory.map((entry) => `
            <div class="metric-row">
              <div>${escapeHtml(entry.query)}</div>
              <span class="muted">${new Date(entry.createdAt).toLocaleString()}</span>
            </div>
          `).join('')}
          ${state.searchHistory.length ? '' : '<div class="muted">No searches saved yet.</div>'}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2 class="panel-title">About the project</h2>
        </div>
        <p class="muted">HealthPilot is a prototype using a MongoDB-backed Flask API and the saved heart disease model. Patient, doctor, appointment, search, profile, assessment, and model-performance records are stored in MongoDB.</p>
        <div class="placeholder-box" style="margin-top: 1rem;">Educational prototype only. Do not store real patient information until appropriate privacy, security, compliance, and clinical safeguards are in place. Some charts and activity content remain illustrative.</div>
      </section>
    </div>
  `;
}

function renderSidebar() {
  return `
    <aside class="sidebar" id="sidebar" aria-hidden="${!state.sidebarOpen}">
      <div class="logo-mark">
        <div class="logo-dot"></div>
        <div>
          <div style="font-weight: 700;">HealthPilot</div>
          <div class="muted" style="font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase;">Clinical Intelligence</div>
        </div>
      </div>
      <nav class="nav-list" aria-label="Sidebar navigation">
        ${navItems.filter((item) => userCanAccess(item.id)).map((item) => `
          <button class="nav-button ${state.currentPage === item.id ? 'active' : ''}" data-page="${item.id}" type="button">
            <span>${renderIcon(item.id)}</span>
            <span>${item.label}</span>
          </button>
        `).join('')}
      </nav>
      <div class="sidebar-footer">
        <div class="muted" style="font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 0.75rem;">Care status</div>
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
          <strong>System health</strong>
          <span class="value-pill">Stable</span>
        </div>
        <div class="muted" style="margin-top: 0.75rem;">2 alerts pending review</div>
      </div>
    </aside>
  `;
}

function renderTopbar() {
  return `
    <header class="topbar">
      <button class="icon-button sidebar-toggle" id="sidebarToggle" type="button" aria-label="${state.sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}" aria-controls="sidebar" aria-expanded="${state.sidebarOpen}">
        ${renderIcon('menu')}
      </button>
      <div class="search-area">
        <form class="search-box" id="global-search-form" role="search">
          <span>${renderIcon('search')}</span>
          <input type="search" name="query" value="${escapeHtml(state.searchQuery)}" placeholder="Search patients, doctors, or records" aria-label="Search patients, doctors, or records" />
          <button class="search-submit" type="submit">Search</button>
        </form>
        ${state.searchFeedback ? `
          <div class="search-popover" role="status" aria-live="polite">
            <p class="search-feedback">${escapeHtml(state.searchFeedback)}</p>
          </div>
        ` : ''}
      </div>
      <div class="topbar-actions">
        <span class="user-identity">${escapeHtml(state.currentUser?.name || '')} · ${escapeHtml(state.currentUser?.role || '')}</span>
        <button class="icon-button" id="themeToggle" type="button" aria-label="Toggle theme">${state.theme === 'dark' ? renderIcon('sun') : renderIcon('moon')}</button>
        <button class="secondary-button" type="button" data-action="sign-out">Sign out</button>
      </div>
    </header>
  `;
}

function renderContent() {
  if (!state.currentUser) {
    return renderAuthPage();
  }
  if (!userCanAccess(state.currentPage) && !['search-results', 'record-detail'].includes(state.currentPage)) {
    state.currentPage = state.currentUser.allowedPages[0] || 'overview';
  }
  const pages = {
    overview: renderOverview(),
    patients: renderPatients(),
    diseases: renderDiseases(),
    doctors: renderDoctors(),
    staff: renderStaff(),
    appointments: renderAppointments(),
    'hospital-info': renderHospitalInfo(),
    'add-record': renderRecordForm(),
    'search-results': renderSearchResultsPage(),
    'record-detail': renderRecordDetail(),
    analytics: renderAnalytics(),
    'ml-assessment': renderAssessment(),
    'model-performance': renderModelPerformance(),
    settings: renderSettings(),
  };

  return `
    <div class="app-shell ${state.sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}">
      ${renderSidebar()}
      <button class="sidebar-backdrop" type="button" aria-label="Close navigation menu" tabindex="-1"></button>
      <div class="main-panel">
        ${renderTopbar()}
        <main class="content-area">
          ${state.dataError ? `<div class="data-error" role="alert">${escapeHtml(state.dataError)}</div>` : ''}
          ${state.dataNotice ? `<div class="data-notice" role="status">${escapeHtml(state.dataNotice)}</div>` : ''}
          ${pages[state.currentPage] || renderOverview()}
        </main>
      </div>
    </div>
  `;
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('theme', state.theme);
}

function destroyCharts() {
  if (window.__healthCharts) {
    window.__healthCharts.forEach((chart) => chart.destroy());
  }
  window.__healthCharts = [];
}

async function apiRequest(path, options = {}) {
  let response;
  const headers = new Headers(options.headers || {});
  if (state.authToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${state.authToken}`);
  }
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error('Could not reach the backend. Start the Flask API and verify its MongoDB connection.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && state.authToken) {
      sessionStorage.removeItem('healthpilot-token');
      state.authToken = '';
      state.currentUser = null;
      state.authError = data.error || 'Your session has expired. Sign in again.';
      render();
    }
    throw new Error(data.error || `Request failed with status ${response.status}.`);
  }
  return data;
}

async function loadDashboard() {
  try {
    const data = await apiRequest('/dashboard');
    state.patientRecords = data.patients || [];
    state.doctors = data.doctors || [];
    state.appointments = data.appointments || [];
    state.todayAppointmentCount = Number(data.todayAppointmentCount) || 0;
    state.todayDate = data.todayDate || '';
    state.diseases = data.diseases || [];
    state.users = data.users || [];
    state.accounts = data.accounts || [];
    state.assessments = data.assessments || [];
    state.searchHistory = data.searchHistory || [];
    state.modelPerformance = data.modelPerformance || null;
    state.dataError = '';
    if (userCanAccess('hospital-info')) {
      state.hospitalInfo = await apiRequest('/hospital').catch((error) => {
        state.dataError = error.message;
        return null;
      });
    }
  } catch (error) {
    state.dataError = error.message;
  }
  render();
}

function drawCharts() {
  const patientActivity = getPatientActivityByMonth();
  const demographicCounts = getDemographicCounts();
  const appointmentStatuses = ['Confirmed', 'Pending', 'Completed', 'Rescheduled'];
  const appointmentStatusCounts = appointmentStatuses.map(
    (status) => state.appointments.filter((appointment) => appointment.status === status).length,
  );
  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const chartDefinitions = [
    {
      id: 'activity',
      config: {
        type: 'line',
        data: {
          labels: patientActivity.map((month) => month.label),
          datasets: [{
            label: 'Patient activity',
            data: patientActivity.map((month) => month.count),
            borderColor: chartPalette.primary,
            backgroundColor: 'rgba(15, 118, 110, 0.12)',
            pointRadius: 0,
            borderWidth: 3,
            fill: true,
            tension: 0.35,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false } },
            y: { display: false },
          },
        },
      },
    },
    {
      id: 'doughnut',
      config: {
        type: 'doughnut',
        data: {
          labels: appointmentStatuses,
          datasets: [{
            data: appointmentStatusCounts,
            backgroundColor: [chartPalette.primary, chartPalette.blue, chartPalette.teal, chartPalette.gold],
            borderWidth: 0,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
        },
      },
    },
    {
      id: 'demographics',
      config: {
        type: 'bar',
        data: {
          labels: ['18-29', '30-39', '40-49', '50-59', '60-69', '70+'],
          datasets: [{
            label: 'Patients',
            data: demographicCounts,
            backgroundColor: [chartPalette.primary, chartPalette.teal, chartPalette.blue, chartPalette.gold, chartPalette.red, chartPalette.slate],
            borderRadius: 8,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false } },
            y: { display: false },
          },
        },
      },
    },
    {
      id: 'analyticsTrend',
      config: {
        type: 'line',
        data: {
          labels: patientActivity.map((month) => month.label),
          datasets: [{
            label: 'Patient activity',
            data: patientActivity.map((month) => month.count),
            borderColor: chartPalette.primary,
            backgroundColor: 'rgba(15, 118, 110, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.35,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { grid: { display: false } }, y: { display: false } },
        },
      },
    },
    {
      id: 'appointmentsTrend',
      config: {
        type: 'bar',
        data: {
          labels: weekdayLabels,
          datasets: [{
            label: 'Appointments',
            data: getAppointmentWeekdayCounts(),
            backgroundColor: chartPalette.teal,
            borderRadius: 8,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { grid: { display: false } }, y: { display: false } },
        },
      },
    },
    {
      id: 'demographicBar',
      config: {
        type: 'polarArea',
        data: {
          labels: ['18-29', '30-39', '40-49', '50-59', '60-69', '70+'],
          datasets: [{
            data: demographicCounts,
            backgroundColor: [chartPalette.primary, chartPalette.teal, chartPalette.blue, chartPalette.gold, chartPalette.red, chartPalette.slate],
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'right' } },
        },
      },
    },
  ];

  const performance = state.modelPerformance || {};
  if (Array.isArray(performance.rocCurve) && performance.rocCurve.length) {
    chartDefinitions.push({
      id: 'rocCurve',
      config: {
        type: 'line',
        data: {
          labels: performance.rocCurve.map((point) => point.fpr),
          datasets: [{
            label: 'ROC',
            data: performance.rocCurve.map((point) => point.tpr),
            borderColor: chartPalette.primary,
            fill: false,
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { grid: { display: false }, title: { display: true, text: 'False positive rate' } }, y: { grid: { display: false }, title: { display: true, text: 'True positive rate' } } },
        },
      },
    });
  }
  if (Array.isArray(performance.confusionMatrix) && performance.confusionMatrix.length === 2) {
    const [[trueNegative, falsePositive], [falseNegative, truePositive]] = performance.confusionMatrix;
    chartDefinitions.push({
      id: 'confusionMatrix',
      config: {
        type: 'bar',
        data: {
          labels: ['Actual negative', 'Actual positive'],
          datasets: [{
            label: 'Predicted negative',
            data: [trueNegative, falseNegative],
            backgroundColor: chartPalette.blue,
          }, {
            label: 'Predicted positive',
            data: [falsePositive, truePositive],
            backgroundColor: chartPalette.primary,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
          scales: { x: { grid: { display: false } }, y: { grid: { display: false } } },
        },
      },
    });
  }

  destroyCharts();
  chartDefinitions.forEach(({ id, config }) => {
    const canvas = document.querySelector(`[data-chart="${id}"]`);
    if (!canvas) return;
    const chart = new Chart(canvas, config);
    window.__healthCharts.push(chart);
  });
}

function bindEvents() {
  document.getElementById('auth-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = Object.fromEntries(new FormData(form));
    state.authError = '';
    try {
      const response = await apiRequest(state.authMode === 'register' ? '/auth/register' : '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      state.authToken = response.token;
      sessionStorage.setItem('healthpilot-token', response.token);
      state.currentUser = response.user;
      state.currentPage = response.user.allowedPages[0] || 'overview';
      state.sidebarOpen = window.innerWidth > 1024;
      state.authError = '';
      await loadDashboard();
    } catch (error) {
      state.authError = error.message;
      render();
    }
  });

  document.querySelector('[data-action="toggle-auth"]')?.addEventListener('click', () => {
    state.authMode = state.authMode === 'login' ? 'register' : 'login';
    state.authError = '';
    render();
  });

  document.querySelector('[data-action="book-appointment"]')?.addEventListener('click', () => {
    state.recordType = 'appointment';
    state.appointmentFormOpen = true;
    state.formFeedback = '';
    render();
  });

  document.querySelector('[data-action="add-disease"]')?.addEventListener('click', () => {
    state.recordType = 'disease';
    state.diseaseFormOpen = true;
    state.formFeedback = '';
    render();
  });

  document.querySelector('[data-action="sign-out"]')?.addEventListener('click', async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch (error) {
      state.dataError = error.message;
    } finally {
      sessionStorage.removeItem('healthpilot-token');
      state.authToken = '';
      state.currentUser = null;
      state.currentPage = 'overview';
      state.authError = '';
      state.accounts = [];
      render();
    }
  });

  document.getElementById('account-role')?.addEventListener('change', (event) => {
    const doctorField = document.getElementById('account-doctor-field');
    doctorField.hidden = event.currentTarget.value !== 'doctor';
    document.getElementById('account-doctor').required = event.currentTarget.value === 'doctor';
  });

  document.getElementById('account-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const account = Object.fromEntries(new FormData(form));
    state.formFeedback = '';
    try {
      await apiRequest('/auth/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(account),
      });
      state.dataNotice = 'Account created successfully.';
      await loadDashboard();
    } catch (error) {
      state.formFeedback = error.message;
      render();
    }
  });

  document.querySelectorAll('[data-action="save-permissions"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const accountId = button.dataset.accountId;
      const allowedPages = Array.from(document.querySelectorAll(`[data-account-page="${CSS.escape(accountId)}"]:checked`), (input) => input.value);
      try {
        await apiRequest(`/auth/accounts/${encodeURIComponent(accountId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ allowedPages }),
        });
        state.dataNotice = 'Page permissions saved.';
        state.formFeedback = '';
        await loadDashboard();
      } catch (error) {
        state.formFeedback = error.message;
        render();
      }
    });
  });

  const sidebarToggle = document.getElementById('sidebarToggle');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      state.sidebarOpen = !state.sidebarOpen;
      render();
    });
  }

  const sidebarBackdrop = document.querySelector('.sidebar-backdrop');
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', () => {
      state.sidebarOpen = false;
      render();
    });
  }

  const navButtons = document.querySelectorAll('[data-page]');
  navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.currentPage = button.dataset.page;
      state.formFeedback = '';
      if (window.matchMedia('(max-width: 1024px)').matches) {
        state.sidebarOpen = false;
      }
      render();
    });
  });

  const recordTypeSelect = document.getElementById('record-type-select');
  if (recordTypeSelect) {
    recordTypeSelect.addEventListener('change', () => {
      state.recordType = recordTypeSelect.value;
      state.formFeedback = '';
      render();
    });
  }

  document.querySelectorAll('[data-action="add-record"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.recordType = button.dataset.recordType || 'patient';
      state.currentPage = 'add-record';
      state.formFeedback = '';
      state.dataNotice = '';
      render();
    });
  });

  const cancelRecordButton = document.querySelector('[data-action="cancel-record"]');
  if (cancelRecordButton) {
    cancelRecordButton.addEventListener('click', () => {
      state.appointmentFormOpen = false;
      state.diseaseFormOpen = false;
      state.currentPage = ({
        patient: 'patients',
        doctor: 'doctors',
        appointment: 'appointments',
        disease: 'diseases',
      })[state.recordType] || 'overview';
      state.formFeedback = '';
      render();
    });
  }

  const recordForm = document.getElementById('record-form');
  if (recordForm) {
    recordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(recordForm);
      const record = Object.fromEntries(formData);
      if (state.recordType === 'patient') {
        record.conditions = Array.from(recordForm.elements.conditions.selectedOptions, (option) => option.value);
        record.age = Number(record.age);
      }
      const endpoint = {
        patient: '/patients',
        doctor: '/doctors',
        appointment: '/appointments',
        disease: '/diseases',
        staff: '/auth/accounts',
      }[state.recordType];
      if (state.recordType === 'staff') {
        record.role = 'staff';
      }
      try {
        await apiRequest(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        });
        const savedRecordType = state.recordType;
        state.currentPage = ({
          patient: 'patients',
          doctor: 'doctors',
          appointment: 'appointments',
          disease: 'diseases',
          staff: userCanAccess('settings') ? 'settings' : 'add-record',
        })[savedRecordType];
        if (savedRecordType === 'staff' && !userCanAccess('settings')) {
          state.recordType = 'patient';
        }
        state.appointmentFormOpen = false;
        state.diseaseFormOpen = false;
        state.dataNotice = savedRecordType === 'staff'
          ? 'Staff account and linked profile created successfully.'
          : state.currentUser.role === 'patient' && state.recordType === 'appointment'
          ? 'Appointment request submitted.'
          : `${savedRecordType[0].toUpperCase()}${savedRecordType.slice(1)} record saved successfully.`;
        state.formFeedback = '';
        await loadDashboard();
      } catch (error) {
        state.formFeedback = error.message;
        render();
      }
    });
  }

  document.querySelectorAll('[data-action="refresh-data"]').forEach((button) => {
    button.addEventListener('click', loadDashboard);
  });

  const searchForm = document.getElementById('global-search-form');
  if (searchForm) {
    searchForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      state.searchQuery = String(new FormData(searchForm).get('query') || '').trim();
      if (!state.searchQuery) {
        state.searchFeedback = 'Enter a search term.';
        state.searchResults = null;
        render();
        return;
      }
      state.searchFeedback = 'Searching...';
      state.searchResults = null;
      render();
      try {
        const response = await apiRequest('/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: state.searchQuery }),
        });
        state.searchResults = response.results;
        state.searchFeedback = '';
        state.currentPage = 'search-results';
        render();
      } catch (error) {
        state.searchResults = null;
        state.searchFeedback = error.message;
        render();
      }
    });
  }

  document.querySelectorAll('[data-record-type][data-record-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const type = button.dataset.recordType;
      const record = state.searchResults?.[type]?.find((item) => item.id === button.dataset.recordId);
      if (!record) return;
      state.selectedRecord = { type, record };
      state.currentPage = 'record-detail';
      render();
    });
  });

  document.querySelectorAll('[data-related-type][data-related-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const collections = {
        patients: state.patientRecords,
        appointments: state.appointments,
      };
      const type = button.dataset.relatedType;
      const record = collections[type]?.find((item) => item.id === button.dataset.relatedId);
      if (!record) return;
      state.selectedRecord = { type, record };
      state.currentPage = 'record-detail';
      render();
    });
  });

  document.querySelector('[data-action="back-to-search"]')?.addEventListener('click', () => {
    state.currentPage = 'search-results';
    state.selectedRecord = null;
    render();
  });

  document.querySelector('[data-action="new-search"]')?.addEventListener('click', () => {
    state.currentPage = 'overview';
    state.searchQuery = '';
    state.searchResults = null;
    state.searchFeedback = '';
    render();
    document.querySelector('#global-search-form [name="query"]')?.focus();
  });

  const themeButton = document.getElementById('themeToggle');
  if (themeButton) {
    themeButton.addEventListener('click', () => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      applyTheme();
      render();
    });
  }

  const inlineThemeButton = document.getElementById('theme-toggle-inline');
  if (inlineThemeButton) {
    inlineThemeButton.addEventListener('click', () => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      applyTheme();
      render();
    });
  }

  const assessmentTabs = document.querySelectorAll('[data-assessment-tab]');
  assessmentTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      state.assessmentTab = tab.dataset.assessmentTab;
      render();
    });
  });

  document.querySelectorAll('[data-action="view-patient"]').forEach((button) => {
    button.addEventListener('click', () => {
      const patient = state.patientRecords.find((record) => record.id === button.dataset.patientId);
      if (patient) {
        alert(`${patient.name}\nAge: ${patient.age}\nStatus: ${patient.status}\nRisk: ${patient.risk}`);
      }
    });
  });

  document.querySelectorAll('[data-action="edit-patient"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const patient = state.patientRecords.find((record) => record.id === button.dataset.patientId);
      if (!patient) return;
      const conditions = prompt(`Disease IDs, comma-separated:\n${state.diseases.map((disease) => `${disease.id} — ${disease.name}`).join('\n')}`, (patient.conditions || []).join(', '));
      if (conditions === null) return;
      try {
        await apiRequest(`/patients/${encodeURIComponent(patient.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conditions: conditions.split(',').map((value) => value.trim()).filter(Boolean) }),
        });
        state.dataNotice = 'Patient conditions updated.';
        await loadDashboard();
      } catch (error) {
        state.dataError = error.message;
        render();
      }
    });
  });

  document.querySelectorAll('[data-appointment-status]').forEach((select) => {
    select.addEventListener('change', async () => {
      try {
        await apiRequest(`/appointments/${encodeURIComponent(select.dataset.appointmentStatus)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: select.value }),
        });
        state.dataNotice = 'Appointment status updated.';
        await loadDashboard();
      } catch (error) {
        state.dataError = error.message;
        render();
      }
    });
  });

  const mlForm = document.getElementById('ml-form');
  if (mlForm) {
    mlForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(mlForm);
      const payload = {
        age: Number(formData.get('age')),
        sex: Number(formData.get('sex')),
        cp: Number(formData.get('cp')),
        trestbps: Number(formData.get('trestbps')),
        chol: Number(formData.get('chol')),
        fbs: Number(formData.get('fbs')),
        restecg: Number(formData.get('restecg')),
        thalach: Number(formData.get('thalach')),
        exang: Number(formData.get('exang')),
        oldpeak: Number(formData.get('oldpeak')),
        slope: Number(formData.get('slope')),
        ca: Number(formData.get('ca')),
        thal: Number(formData.get('thal')),
      };

      const resultNode = document.getElementById('assessment-result');
      if (!resultNode) return;

      const requiredKeys = ['age','sex','cp','trestbps','chol','fbs','restecg','thalach','exang','oldpeak','slope','ca','thal'];
      const invalid = requiredKeys.some((key) => Number.isNaN(payload[key]));

      if (invalid) {
        resultNode.className = 'placeholder-box';
        resultNode.textContent = 'Please complete all fields before predicting heart disease risk.';
        return;
      }

      resultNode.className = 'placeholder-box';
      resultNode.textContent = 'Running heart disease prediction...';

      try {
        const data = await apiRequest('/predict/heart-disease', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        state.assessments.unshift(data);

        const isHighRisk = data.prediction === 1;
        const probability = Number(data.probability || 0) * 100;
        const statusText = isHighRisk ? 'High risk of heart disease detected' : 'Low risk of heart disease detected';

        resultNode.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
            <div>
              <strong style="display:block; margin-bottom:0.35rem;">${statusText}</strong>
              <span class="muted">Model probability: ${probability.toFixed(1)}%</span>
            </div>
            <span class="value-pill ${isHighRisk ? 'danger' : 'success'}">${isHighRisk ? 'Positive' : 'Negative'}</span>
          </div>
        `;
      } catch (error) {
        resultNode.textContent = error.message || 'Prediction failed. Please try again.';
      }
    });
  }
}

window.matchMedia('(max-width: 1024px)').addEventListener('change', (event) => {
  state.sidebarOpen = !event.matches;
  render();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.sidebarOpen && window.matchMedia('(max-width: 1024px)').matches) {
    state.sidebarOpen = false;
    render();
  }
});

function render() {
  app.innerHTML = renderContent();
  applyTheme();
  bindEvents();
  if (state.currentUser) drawCharts();
  else destroyCharts();
}

async function initializeApp() {
  if (state.authToken) {
    try {
      state.currentUser = await apiRequest('/auth/me');
      state.currentPage = state.currentUser.allowedPages[0] || 'overview';
      await loadDashboard();
      return;
    } catch (error) {
      sessionStorage.removeItem('healthpilot-token');
      state.authToken = '';
      state.currentUser = null;
      state.authError = error.message;
    }
  }
  render();
}

render();
initializeApp();
