import { useEffect, useMemo, useState } from 'react';
import './App.css';

const API_BASE = '/api';
const PROJECTS_CACHE_KEY = 'evm.projects.cache.v1';
const AUTH_SESSION_KEY = 'evm.auth.session.v1';

const KPI_CONFIG = [
  {
    key: 'bac',
    label: 'BAC',
    help: 'Budget At Completion: presupuesto total aprobado del proyecto.',
  },
  {
    key: 'pv',
    label: 'PV',
    help: 'Planned Value: valor planificado acumulado hasta la fecha.',
  },
  {
    key: 'ev',
    label: 'EV',
    help: 'Earned Value: valor ganado por el avance realmente completado.',
  },
  {
    key: 'ac',
    label: 'AC',
    help: 'Actual Cost: costo real ejecutado a la fecha.',
  },
  {
    key: 'cpi',
    label: 'CPI',
    help: 'Cost Performance Index: EV / AC. Si es mayor o igual a 1, el costo va bien.',
  },
  {
    key: 'spi',
    label: 'SPI',
    help: 'Schedule Performance Index: EV / PV. Si es mayor o igual a 1, el cronograma va bien.',
  },
  {
    key: 'eac',
    label: 'EAC',
    help: 'Estimate At Completion: estimado total al cierre, calculado como BAC / CPI.',
  },
  {
    key: 'vac',
    label: 'VAC',
    help: 'Variance At Completion: variacion esperada al cierre, BAC - EAC.',
  },
];

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`${response.status} ${body || response.statusText}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return response.json();
}

function normalizeActivity(activity) {
  const payload = activity?.data_payload || {};
  const bac = Number(activity?.bac ?? payload.bac ?? 0);
  const plannedPct = Number(activity?.planned_pct ?? payload.planned_pct ?? 0);
  const actualPct = Number(activity?.actual_pct ?? payload.actual_pct ?? 0);
  const ac = Number(activity?.ac ?? payload.ac ?? 0);
  const pv = Number(activity?.pv ?? bac * (plannedPct / 100));
  const ev = Number(activity?.ev ?? bac * (actualPct / 100));
  const cv = Number(activity?.cv ?? ev - ac);
  const sv = Number(activity?.sv ?? ev - pv);
  const cpi = activity?.cpi ?? (ac !== 0 ? ev / ac : null);
  const spi = activity?.spi ?? (pv !== 0 ? ev / pv : null);

  return {
    ...activity,
    bac,
    planned_pct: plannedPct,
    actual_pct: actualPct,
    ac,
    pv,
    ev,
    cv,
    sv,
    cpi,
    spi,
  };
}

function buildSummary(activities) {
  const normalized = (activities || []).map(normalizeActivity);
  const bac = normalized.reduce((sum, activity) => sum + (Number(activity.bac) || 0), 0);
  const pv = normalized.reduce((sum, activity) => sum + (Number(activity.pv) || 0), 0);
  const ev = normalized.reduce((sum, activity) => sum + (Number(activity.ev) || 0), 0);
  const ac = normalized.reduce((sum, activity) => sum + (Number(activity.ac) || 0), 0);
  const cv = ev - ac;
  const sv = ev - pv;
  const cpi = ac !== 0 ? ev / ac : null;
  const spi = pv !== 0 ? ev / pv : null;
  const eac = cpi && cpi !== 0 ? bac / cpi : null;
  const vac = eac !== null ? bac - eac : null;

  return {
    bac,
    pv,
    ev,
    ac,
    cv,
    sv,
    cpi,
    spi,
    eac,
    vac,
    cpi_interpretation: cpi !== null && cpi >= 1 ? 'Buen desempeño de costo' : 'Requiere revisión',
    spi_interpretation: spi !== null && spi >= 1 ? 'Buen desempeño de cronograma' : 'Requiere revisión',
  };
}

function readProjectsCache() {
  try {
    const raw = localStorage.getItem(PROJECTS_CACHE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeProjectsCache(projectList) {
  try {
    localStorage.setItem(PROJECTS_CACHE_KEY, JSON.stringify(projectList));
  } catch {
    // Ignore storage errors silently in browsers with restricted storage.
  }
}

function readAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed?.email || !parsed?.role || !parsed?.accessToken) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeAuthSession(user) {
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(user));
}

function clearAuthSession() {
  localStorage.removeItem(AUTH_SESSION_KEY);
}

function App() {
  const [authUser, setAuthUser] = useState(() => readAuthSession());
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectRename, setProjectRename] = useState('');
  const [projectName, setProjectName] = useState('Proyecto Demo');
  const [activities, setActivities] = useState([]);
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activityForm, setActivityForm] = useState({
    name: '',
    bac: '',
    planned_pct: '',
    actual_pct: '',
    ac: '',
  });
  const [editingActivityId, setEditingActivityId] = useState(null);
  const [editingForm, setEditingForm] = useState({
    name: '',
    bac: '',
    planned_pct: '',
    actual_pct: '',
    ac: '',
  });
  const [activitySearch, setActivitySearch] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const [isProjectLoading, setIsProjectLoading] = useState(false);

  const canEdit = authUser?.role === 'project_lead' || authUser?.role === 'admin';

  async function authenticatedRequest(path, options = {}) {
    if (!authUser?.accessToken) {
      const authMissingError = new Error('401 Not authenticated');
      authMissingError.status = 401;
      throw authMissingError;
    }

    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${authUser.accessToken}`,
    };

    return requestJson(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  }

  async function handleLogin(event) {
    event.preventDefault();
    const email = loginEmail.trim().toLowerCase();
    if (!email || !loginPassword.trim()) {
      setAuthError('Ingresa correo y contraseña para continuar.');
      return;
    }

    setAuthError('');
    setMessage('');
    setError('');

    try {
      const loginResponse = await requestJson(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: loginPassword }),
      });

      const user = {
        email: loginResponse.email,
        role: loginResponse.role,
        accessToken: loginResponse.access_token,
        displayName: loginResponse.email.split('@')[0],
      };

      setAuthUser(user);
      writeAuthSession(user);
      setLoginPassword('');
      setMessage('Sesion iniciada.');
    } catch (err) {
      if (err.status === 404) {
        setAuthError('El backend actual no expone /api/auth/login en esta rama.');
        return;
      }
      setAuthError('Credenciales inválidas. Usa correo y contraseña del backend.');
    }
  }

  function handleLogout(nextMessage = 'Sesion cerrada.') {
    setAuthUser(null);
    clearAuthSession();
    setProjects([]);
    setSelectedProjectId('');
    setActivities([]);
    setSummary(null);
    setEditingActivityId(null);
    setMessage(nextMessage);
  }

  async function fetchProjects() {
    setError('');
    try {
      const data = await authenticatedRequest('/projects');
      const normalizedProjects = Array.isArray(data) ? data : [];
      setProjects(normalizedProjects);
      writeProjectsCache(normalizedProjects);
    } catch (err) {
      if (err.status === 401) {
        handleLogout('Sesion expirada. Inicia sesion nuevamente.');
        return;
      }
      setError(`No se pudo cargar la lista de proyectos. ${err.message}`);
    }
  }

  async function loadProject(id) {
    setError('');
    setMessage('');
    if (!id) {
      setActivities([]);
      setSummary(null);
      return;
    }

    setIsProjectLoading(true);

    try {
      const data = await authenticatedRequest(`/projects/${id}`);
      const activities = (data.activities || []).map(normalizeActivity);
      setActivities(activities);
      setSummary(data.summary || buildSummary(activities));
      setProjectRename(data.name || '');
      setProjects((prev) => {
        const exists = prev.some((item) => item.id === data.id);
        if (exists) {
          const next = prev.map((item) => (item.id === data.id ? { ...item, ...data } : item));
          writeProjectsCache(next);
          return next;
        }
        const next = [data, ...prev];
        writeProjectsCache(next);
        return next;
      });
    } catch (err) {
      if (err.status === 401) {
        handleLogout('Sesion expirada. Inicia sesion nuevamente.');
        return;
      }
      setError(`No se pudo cargar el proyecto. ${err.message}`);
    } finally {
      setIsProjectLoading(false);
    }
  }

  async function createProject() {
    if (!canEdit) {
      setError('Tu perfil es de solo lectura para proyectos.');
      return;
    }
    setError('');
    setMessage('');
    const safeName = (projectName || '').trim() || `Proyecto ${Date.now()}`;
    try {
      const data = await authenticatedRequest('/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: safeName, status: 'active' }),
      });
      setProjectName('');
      setSelectedProjectId(String(data.id));
      setProjects((prev) => {
        const exists = prev.some((item) => item.id === data.id);
        if (exists) {
          const next = prev.map((item) => (item.id === data.id ? { ...item, ...data } : item));
          writeProjectsCache(next);
          return next;
        }
        const next = [data, ...prev];
        writeProjectsCache(next);
        return next;
      });
      setMessage('Proyecto creado correctamente.');
      await fetchProjects();
      await loadProject(data.id);
    } catch (err) {
      const duplicateMatch = err.message?.includes('400') || err.message?.includes('already exists');
      if (duplicateMatch) {
        const existing = projects.find((item) => item.name === safeName);
        if (existing) {
          setSelectedProjectId(String(existing.id));
          setMessage('El proyecto ya existía; se seleccionó el registro actual.');
          await loadProject(existing.id);
          return;
        }
      }
      if (err.status === 401) {
        handleLogout('Sesion expirada. Inicia sesion nuevamente.');
        return;
      }
      if (err.status === 403) {
        setError('No tienes permisos para crear proyectos con este rol.');
        return;
      }
      setError(err.message);
    }
  }

  async function addActivity(event) {
    event.preventDefault();
    if (!canEdit) {
      setError('Tu perfil es de solo lectura para actividades.');
      return;
    }
    if (!selectedProjectId) {
      setError('Selecciona un proyecto antes de crear una actividad.');
      return;
    }

    try {
      const activityName = activityForm.name.trim();
      if (!activityName) {
        setError('Ingresa un nombre para la actividad.');
        return;
      }

      const validatedMetrics = validateActivityMetrics(activityForm);

      await authenticatedRequest('/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: Number(selectedProjectId),
          name: activityName,
          description: '',
          kind: 'planning',
          status: 'pending',
          data_payload: validatedMetrics,
        }),
      });

      setActivityForm({ name: '', bac: '', planned_pct: '', actual_pct: '', ac: '' });
      setMessage('Actividad agregada correctamente.');
      await loadProject(selectedProjectId);
    } catch (err) {
      if (err.status === 401) {
        handleLogout('Sesion expirada. Inicia sesion nuevamente.');
        return;
      }
      if (err.status === 403) {
        setError('No tienes permisos para crear actividades con este rol.');
        return;
      }
      setError(`No se pudo crear la actividad. ${err.message}`);
    }
  }

  async function renameSelectedProject() {
    if (!canEdit) {
      setError('Tu perfil es de solo lectura para proyectos.');
      return;
    }
    if (!selectedProjectId) {
      setError('Selecciona un proyecto para renombrar.');
      return;
    }

    const nextName = projectRename.trim();
    if (!nextName) {
      setError('Ingresa un nuevo nombre para el proyecto.');
      return;
    }

    setError('');
    setMessage('');

    try {
      const data = await authenticatedRequest(`/projects/${selectedProjectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nextName }),
      });

      setProjects((prev) => {
        const next = prev.map((item) => (item.id === data.id ? { ...item, ...data } : item));
        writeProjectsCache(next);
        return next;
      });
      setProjectRename(data.name || nextName);
      setMessage('Proyecto renombrado correctamente.');
      await loadProject(selectedProjectId);
    } catch (err) {
      if (err.status === 401) {
        handleLogout('Sesion expirada. Inicia sesion nuevamente.');
        return;
      }
      if (err.status === 403) {
        setError('No tienes permisos para renombrar proyectos con este rol.');
        return;
      }
      setError(`No se pudo renombrar el proyecto. ${err.message}`);
    }
  }

  async function deleteSelectedProject() {
    if (!canEdit) {
      setError('Tu perfil es de solo lectura para proyectos.');
      return;
    }
    if (!selectedProjectId) {
      setError('Selecciona un proyecto para eliminar.');
      return;
    }

    const confirmed = window.confirm('Esta accion eliminara el proyecto y sus actividades. Deseas continuar?');
    if (!confirmed) {
      return;
    }

    setError('');
    setMessage('');

    try {
      await authenticatedRequest(`/projects/${selectedProjectId}`, {
        method: 'DELETE',
      });

      const deletedId = Number(selectedProjectId);
      setProjects((prev) => {
        const next = prev.filter((item) => item.id !== deletedId);
        writeProjectsCache(next);
        return next;
      });
      setSelectedProjectId('');
      setActivities([]);
      setSummary(null);
      setProjectRename('');
      setMessage('Proyecto eliminado correctamente.');
    } catch (err) {
      if (err.status === 401) {
        handleLogout('Sesion expirada. Inicia sesion nuevamente.');
        return;
      }
      if (err.status === 403) {
        setError('No tienes permisos para eliminar proyectos con este rol.');
        return;
      }
      setError(`No se pudo eliminar el proyecto. ${err.message}`);
    }
  }

  async function deleteActivity(activityId) {
    if (!canEdit) {
      setError('Tu perfil es de solo lectura para actividades.');
      return;
    }

    const confirmed = window.confirm('Eliminar esta actividad?');
    if (!confirmed) {
      return;
    }

    setError('');
    setMessage('');

    try {
      await authenticatedRequest(`/activities/${activityId}`, {
        method: 'DELETE',
      });
      setMessage('Actividad eliminada correctamente.');
      await loadProject(selectedProjectId);
    } catch (err) {
      if (err.status === 401) {
        handleLogout('Sesion expirada. Inicia sesion nuevamente.');
        return;
      }
      if (err.status === 403) {
        setError('No tienes permisos para eliminar actividades con este rol.');
        return;
      }
      setError(`No se pudo eliminar la actividad. ${err.message}`);
    }
  }

  async function saveActivity(activityId) {
    if (!canEdit) {
      setError('Tu perfil es de solo lectura para actividades.');
      return;
    }
    setError('');
    setMessage('');
    try {
      const nextName = editingForm.name.trim();
      if (!nextName) {
        setError('Ingresa un nombre para la actividad.');
        return;
      }

      const validatedMetrics = validateActivityMetrics(editingForm);

      await authenticatedRequest(`/activities/${activityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nextName,
          data_payload: validatedMetrics,
        }),
      });

      setMessage('Actividad actualizada correctamente.');
      setEditingActivityId(null);
      setEditingForm({ name: '', bac: '', planned_pct: '', actual_pct: '', ac: '' });
      await loadProject(selectedProjectId);
    } catch (err) {
      if (err.status === 401) {
        handleLogout('Sesion expirada. Inicia sesion nuevamente.');
        return;
      }
      if (err.status === 403) {
        setError('No tienes permisos para editar actividades con este rol.');
        return;
      }
      setError(`No se pudo actualizar la actividad. ${err.message}`);
    }
  }

  function startEdit(activity) {
    if (!canEdit) {
      return;
    }
    setEditingActivityId(activity.id);
    setEditingForm({
      name: activity.name,
      bac: String(activity.bac),
      planned_pct: String(activity.planned_pct),
      actual_pct: String(activity.actual_pct),
      ac: String(activity.ac),
    });
    setMessage('');
    setError('');
  }

  function cancelEdit() {
    setEditingActivityId(null);
    setEditingForm({ name: '', bac: '', planned_pct: '', actual_pct: '', ac: '' });
  }

  function getStatusColor(value) {
    if (value === null || value === undefined) {
      return '#999';
    }
    return value >= 1 ? '#27ae60' : '#c0392b';
  }

  function parseNumericField(rawValue, label) {
    const normalized = String(rawValue ?? '').trim();
    if (!normalized) {
      throw new Error(`Completa el campo ${label}.`);
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      throw new Error(`El campo ${label} debe ser numerico.`);
    }
    return parsed;
  }

  function validateActivityMetrics(form) {
    const bac = parseNumericField(form.bac, 'BAC');
    const plannedPct = parseNumericField(form.planned_pct, '% planificado');
    const actualPct = parseNumericField(form.actual_pct, '% real');
    const ac = parseNumericField(form.ac, 'AC');

    if (bac < 0 || ac < 0) {
      throw new Error('BAC y AC deben ser mayores o iguales a 0.');
    }
    if (plannedPct < 0 || plannedPct > 100 || actualPct < 0 || actualPct > 100) {
      throw new Error('Los porcentajes deben estar entre 0 y 100.');
    }

    return {
      bac,
      planned_pct: plannedPct,
      actual_pct: actualPct,
      ac,
    };
  }

  function formatNumber(value) {
    return value === null || value === undefined ? 'N/A' : Number(value).toFixed(2);
  }

  function formatKpiValue(value) {
    if (value === null || value === undefined) {
      return 'N/A';
    }
    return Number(value).toLocaleString('es-CO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function getStatusTone(value) {
    if (value === null || value === undefined) {
      return 'neutral';
    }
    if (value >= 1) {
      return 'good';
    }
    if (value >= 0.9) {
      return 'warn';
    }
    return 'critical';
  }

  function getToneMeta(value) {
    const tone = getStatusTone(value);
    if (tone === 'good') {
      return { tone, icon: '▲', label: 'Buen desempeño' };
    }
    if (tone === 'warn') {
      return { tone, icon: '▬', label: 'Desempeño en observación' };
    }
    if (tone === 'critical') {
      return { tone, icon: '▼', label: 'Desempeño en riesgo' };
    }
    return { tone, icon: '•', label: 'Sin datos' };
  }

  function getPerformanceBucket(activity) {
    const cpiTone = getStatusTone(activity.cpi);
    const spiTone = getStatusTone(activity.spi);
    if (cpiTone === 'critical' || spiTone === 'critical') {
      return 'risk';
    }
    if (cpiTone === 'good' && spiTone === 'good') {
      return 'good';
    }
    return 'watch';
  }

  const selectedProject = projects.find((project) => String(project.id) === String(selectedProjectId));

  const activityRiskSummary = useMemo(() => {
    return activities.reduce(
      (acc, activity) => {
        const bucket = getPerformanceBucket(activity);
        if (bucket === 'good') {
          acc.good += 1;
        } else if (bucket === 'risk') {
          acc.risk += 1;
        } else {
          acc.watch += 1;
        }
        return acc;
      },
      { good: 0, watch: 0, risk: 0 }
    );
  }, [activities]);

  const visibleActivities = useMemo(() => {
    const normalizedSearch = activitySearch.trim().toLowerCase();

    const filtered = activities.filter((activity) => {
      const matchesSearch = activity.name.toLowerCase().includes(normalizedSearch);
      if (!matchesSearch) {
        return false;
      }
      if (activityFilter === 'all') {
        return true;
      }
      return getPerformanceBucket(activity) === activityFilter;
    });

    const sorted = [...filtered].sort((left, right) => {
      const leftValue = left[sortConfig.key];
      const rightValue = right[sortConfig.key];

      if (typeof leftValue === 'string' || typeof rightValue === 'string') {
        const a = String(leftValue ?? '').toLowerCase();
        const b = String(rightValue ?? '').toLowerCase();
        if (a === b) {
          return 0;
        }
        return sortConfig.direction === 'asc' ? (a > b ? 1 : -1) : a > b ? -1 : 1;
      }

      const a = Number(leftValue ?? 0);
      const b = Number(rightValue ?? 0);
      return sortConfig.direction === 'asc' ? a - b : b - a;
    });

    return sorted;
  }, [activities, activityFilter, activitySearch, sortConfig]);

  function toggleSort(key) {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  }

  function sortLabel(key, label) {
    if (sortConfig.key !== key) {
      return label;
    }
    return `${label} ${sortConfig.direction === 'asc' ? '↑' : '↓'}`;
  }

  function exportActivitiesCsv() {
    if (!selectedProject || visibleActivities.length === 0) {
      return;
    }

    const header = ['Actividad', 'BAC', '% Planif.', '% Real', 'PV', 'EV', 'AC', 'CV', 'SV', 'CPI', 'SPI'];
    const rows = visibleActivities.map((activity) => [
      activity.name,
      activity.bac,
      activity.planned_pct,
      activity.actual_pct,
      activity.pv,
      activity.ev,
      activity.ac,
      activity.cv,
      activity.sv,
      activity.cpi,
      activity.spi,
    ]);

    const csv = [header, ...rows]
      .map((line) =>
        line
          .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `evm-${selectedProject.name.replace(/\s+/g, '-').toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function getKpiToneClass(key, value) {
    if (key === 'cpi' || key === 'spi') {
      return ` tone-${getStatusTone(value)}`;
    }
    return '';
  }

  function renderChart() {
    if (activities.length === 0) {
      return <p className="muted-text">No hay actividades para mostrar en la gráfica.</p>;
    }

    const maxValue = Math.max(
      1,
      ...activities.flatMap((activity) => [activity.pv, activity.ev, activity.ac])
    );

    return (
      <div className="chart-panel">
        <h3 className="section-title">Comparación PV / EV / AC</h3>
        {activities.map((activity) => (
          <div key={activity.id} className="chart-item">
            <strong className="chart-activity-name">{activity.name}</strong>
            <div className="chart-rows">
              <div className="chart-row">
                <span className="metric-label">PV</span>
                <div className="metric-track">
                  <div className="metric-fill metric-fill-pv" style={{ width: `${(activity.pv / maxValue) * 100}%` }} />
                </div>
                <span className="metric-value">{formatNumber(activity.pv)}</span>
              </div>
              <div className="chart-row">
                <span className="metric-label">EV</span>
                <div className="metric-track">
                  <div className="metric-fill metric-fill-ev" style={{ width: `${(activity.ev / maxValue) * 100}%` }} />
                </div>
                <span className="metric-value">{formatNumber(activity.ev)}</span>
              </div>
              <div className="chart-row">
                <span className="metric-label">AC</span>
                <div className="metric-track">
                  <div className="metric-fill metric-fill-ac" style={{ width: `${(activity.ac / maxValue) * 100}%` }} />
                </div>
                <span className="metric-value">{formatNumber(activity.ac)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  useEffect(() => {
    if (!authUser) {
      return;
    }
    const cachedProjects = readProjectsCache();
    if (cachedProjects.length > 0) {
      setProjects(cachedProjects);
    }
    fetchProjects();
  }, [authUser]);

  useEffect(() => {
    if (!authUser) {
      return;
    }
    if (selectedProjectId) {
      loadProject(selectedProjectId);
    }
  }, [selectedProjectId, authUser]);

  if (!authUser) {
    return (
      <div className="app-shell">
        <div className="bg-orb orb-a" />
        <div className="bg-orb orb-b" />

        <main className="dashboard auth-dashboard">
          <section className="hero">
            <p className="kicker">Earned Value Management</p>
            <h1>Acceso al Panel EVM</h1>
            <p className="hero-copy">Ingresa con tu perfil para ver o editar actividades del proyecto.</p>
          </section>

          <section className="surface auth-card">
            <h3 className="section-title">Iniciar sesion</h3>
            <form onSubmit={handleLogin} className="auth-form">
              <input
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="correo@empresa.com"
                className="control-input"
              />
              <input
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Contraseña"
                type="password"
                className="control-input"
              />
              <button type="submit" className="btn btn-primary">Entrar</button>
            </form>
            {authError && <p className="auth-error">{authError}</p>}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="bg-orb orb-a" />
      <div className="bg-orb orb-b" />

      <main className="dashboard">
        <section className="hero">
          <p className="kicker">Earned Value Management</p>
          <h1>Panel de Control EVM</h1>
          <p className="hero-copy">Registra actividades, evalua costo y cronograma, y toma decisiones con indicadores claros.</p>
          <div className="user-strip">
            <span className={`role-pill ${canEdit ? 'role-edit' : 'role-read'}`}>
              {canEdit ? 'Rol: lider de proyecto' : 'Rol: solo lectura'}
            </span>
            <span className="user-email">{authUser.email}</span>
            <button type="button" className="btn btn-ghost" onClick={handleLogout}>Cerrar sesion</button>
          </div>
        </section>

        <section className={`surface controls-grid ${!canEdit ? 'controls-grid-viewer' : ''}`}>
          <h3 className="section-title controls-title">Gestion de proyecto</h3>
          <p className="muted-text controls-help">Selecciona un proyecto y luego crea o gestiona sus cambios.</p>

          <div className="control-block control-block-active">
            <label className="field-label">Proyectos del usuario activos</label>
            <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)} className="control-input">
              <option value="">Selecciona un proyecto</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            {canEdit && selectedProjectId && (
              <div className="project-actions-panel">
                <div className="project-actions-row">
                  <label className="field-label">Renombrar proyecto</label>
                  <div className="project-actions project-actions-inline">
                    <input
                      value={projectRename}
                      onChange={(e) => setProjectRename(e.target.value)}
                      placeholder="Nuevo nombre del proyecto"
                      className="control-input"
                    />
                    <button
                      onClick={renameSelectedProject}
                      className="btn btn-primary"
                      type="button"
                      disabled={!projectRename.trim()}
                    >
                      Guardar nombre
                    </button>
                  </div>
                </div>

                <div className="project-actions-row project-danger-zone">
                  <label className="field-label">Eliminar proyecto</label>
                  <button onClick={deleteSelectedProject} className="btn btn-danger" type="button">
                    Eliminar proyecto seleccionado
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="control-block control-block-wide">
            <label className="field-label">Nuevo proyecto</label>
            <div className="inline-form">
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Nombre del proyecto"
                className="control-input"
                disabled={!canEdit}
              />
              <button onClick={createProject} className="btn btn-primary" type="button" disabled={!canEdit}>
                Crear proyecto
              </button>
            </div>
            {!canEdit && <p className="muted-text lock-note">Tu perfil actual no puede crear proyectos.</p>}
          </div>

        </section>

        {message && <div className="alert success">{message}</div>}
        {error && <div className="alert error">{error}</div>}

        {selectedProjectId ? (
          <>
            <section className="surface kpi-context">
              <p className="kpi-context-kicker">Resumen consolidado</p>
              <h3 className="kpi-context-title">{selectedProject?.name || 'Proyecto seleccionado'}</h3>
              <div className="kpi-context-tags">
                <span className="context-tag">Actividades: {activities.length}</span>
                <span className="context-tag tag-good">Buenas: {activityRiskSummary.good}</span>
                <span className="context-tag tag-watch">Observación: {activityRiskSummary.watch}</span>
                <span className="context-tag tag-risk">Riesgo: {activityRiskSummary.risk}</span>
              </div>
              <p className="muted-text kpi-context-meta">
                Este bloque muestra el total del proyecto con {activities.length}{' '}
                {activities.length === 1 ? 'actividad' : 'actividades'} registradas.
              </p>
            </section>

            <section className="kpi-grid">
              {KPI_CONFIG.map((kpi) => (
                <article key={kpi.key} className={`kpi-card${getKpiToneClass(kpi.key, summary?.[kpi.key])}`}>
                  <div className="kpi-head">
                    <span>{kpi.label}</span>
                    <div className="kpi-actions">
                      {(kpi.key === 'cpi' || kpi.key === 'spi') && (
                        <span
                          className={`tone-icon tone-${getToneMeta(summary?.[kpi.key]).tone}`}
                          aria-label={getToneMeta(summary?.[kpi.key]).label}
                          title={getToneMeta(summary?.[kpi.key]).label}
                        >
                          {getToneMeta(summary?.[kpi.key]).icon}
                        </span>
                      )}
                      <span className="kpi-info" tabIndex={0} aria-label={`Info ${kpi.label}`}>
                        ?
                        <span className="kpi-tooltip" role="tooltip">{kpi.help}</span>
                      </span>
                    </div>
                  </div>
                  <strong>{formatKpiValue(summary?.[kpi.key])}</strong>
                </article>
              ))}
            </section>

            <section className="status-grid">
              <article className={`status-card tone-${getStatusTone(summary?.cpi)}`}>
                <h3>
                  Costo
                  <span
                    className={`tone-icon tone-${getToneMeta(summary?.cpi).tone}`}
                    aria-label={getToneMeta(summary?.cpi).label}
                    title={getToneMeta(summary?.cpi).label}
                  >
                    {getToneMeta(summary?.cpi).icon}
                  </span>
                </h3>
                <p>{summary?.cpi_interpretation ?? 'Sin datos'}</p>
              </article>
              <article className={`status-card tone-${getStatusTone(summary?.spi)}`}>
                <h3>
                  Cronograma
                  <span
                    className={`tone-icon tone-${getToneMeta(summary?.spi).tone}`}
                    aria-label={getToneMeta(summary?.spi).label}
                    title={getToneMeta(summary?.spi).label}
                  >
                    {getToneMeta(summary?.spi).icon}
                  </span>
                </h3>
                <p>{summary?.spi_interpretation ?? 'Sin datos'}</p>
              </article>
            </section>

            {isProjectLoading && <section className="surface loading-panel">Actualizando datos del proyecto...</section>}

            <section className="surface form-surface">
              <h3 className="section-title">Registrar actividad</h3>
              <form onSubmit={addActivity} className="activity-form" autoComplete="off">
                    <input
                      value={activityForm.name}
                      onChange={(e) => setActivityForm({ ...activityForm, name: e.target.value })}
                      placeholder="Nombre"
                      className="control-input"
                      autoComplete="off"
                      disabled={!canEdit}
                      required
                    />
                    <input
                      type="number"
                      value={activityForm.bac}
                      onChange={(e) => setActivityForm({ ...activityForm, bac: e.target.value })}
                      placeholder="BAC"
                      className="control-input"
                      autoComplete="off"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      disabled={!canEdit}
                      required
                    />
                    <input
                      type="number"
                      value={activityForm.planned_pct}
                      onChange={(e) => setActivityForm({ ...activityForm, planned_pct: e.target.value })}
                      placeholder="% planificado"
                      className="control-input"
                      autoComplete="off"
                      inputMode="decimal"
                      min="0"
                      max="100"
                      step="0.01"
                      disabled={!canEdit}
                      required
                    />
                    <input
                      type="number"
                      value={activityForm.actual_pct}
                      onChange={(e) => setActivityForm({ ...activityForm, actual_pct: e.target.value })}
                      placeholder="% real"
                      className="control-input"
                      autoComplete="off"
                      inputMode="decimal"
                      min="0"
                      max="100"
                      step="0.01"
                      disabled={!canEdit}
                      required
                    />
                    <input
                      type="number"
                      value={activityForm.ac}
                      onChange={(e) => setActivityForm({ ...activityForm, ac: e.target.value })}
                      placeholder="AC"
                      className="control-input"
                      autoComplete="off"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      disabled={!canEdit}
                      required
                    />
                <button type="submit" className="btn btn-primary" disabled={!canEdit}>
                  Agregar
                </button>
              </form>
              {!canEdit && <p className="muted-text lock-note">Tu perfil actual no puede agregar actividades.</p>}
            </section>

            <section className="surface table-surface">
              <div className="table-header-modern">
                <h3 className="section-title">Indicadores por actividad</h3>
                <div className="table-toolbar">
                  <input
                    value={activitySearch}
                    onChange={(e) => setActivitySearch(e.target.value)}
                    placeholder="Buscar actividad..."
                    className="control-input"
                  />
                  <select value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)} className="control-input">
                    <option value="all">Todas</option>
                    <option value="good">Buen desempeño</option>
                    <option value="watch">En observación</option>
                    <option value="risk">En riesgo</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-muted"
                    onClick={exportActivitiesCsv}
                    disabled={visibleActivities.length === 0}
                  >
                    Exportar CSV
                  </button>
                </div>
              </div>
              <div className="table-scroll">
                <table className="evm-table">
                      <thead>
                        <tr>
                          <th onClick={() => toggleSort('name')}>{sortLabel('name', 'Actividad')}</th>
                          <th onClick={() => toggleSort('bac')}>{sortLabel('bac', 'BAC')}</th>
                          <th onClick={() => toggleSort('planned_pct')}>{sortLabel('planned_pct', '% Planif.')}</th>
                          <th onClick={() => toggleSort('actual_pct')}>{sortLabel('actual_pct', '% Real')}</th>
                          <th onClick={() => toggleSort('pv')}>{sortLabel('pv', 'PV')}</th>
                          <th onClick={() => toggleSort('ev')}>{sortLabel('ev', 'EV')}</th>
                          <th onClick={() => toggleSort('ac')}>{sortLabel('ac', 'AC')}</th>
                          <th onClick={() => toggleSort('cv')}>{sortLabel('cv', 'CV')}</th>
                          <th onClick={() => toggleSort('sv')}>{sortLabel('sv', 'SV')}</th>
                          <th onClick={() => toggleSort('cpi')}>{sortLabel('cpi', 'CPI')}</th>
                          <th onClick={() => toggleSort('spi')}>{sortLabel('spi', 'SPI')}</th>
                          <th>Accion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleActivities.map((activity) => (
                          <tr key={activity.id}>
                            <td>
                              {editingActivityId === activity.id ? (
                                <input
                                  value={editingForm.name}
                                  onChange={(e) => setEditingForm({ ...editingForm, name: e.target.value })}
                                  className="table-input"
                                />
                              ) : (
                                activity.name
                              )}
                            </td>
                            <td>
                              {editingActivityId === activity.id ? (
                                <input
                                  type="number"
                                  value={editingForm.bac}
                                  onChange={(e) => setEditingForm({ ...editingForm, bac: e.target.value })}
                                  className="table-input"
                                  inputMode="decimal"
                                  min="0"
                                  step="0.01"
                                />
                              ) : (
                                formatNumber(activity.bac)
                              )}
                            </td>
                            <td>
                              {editingActivityId === activity.id ? (
                                <input
                                  type="number"
                                  value={editingForm.planned_pct}
                                  onChange={(e) => setEditingForm({ ...editingForm, planned_pct: e.target.value })}
                                  className="table-input"
                                  inputMode="decimal"
                                  min="0"
                                  max="100"
                                  step="0.01"
                                />
                              ) : (
                                `${formatNumber(activity.planned_pct)}%`
                              )}
                            </td>
                            <td>
                              {editingActivityId === activity.id ? (
                                <input
                                  type="number"
                                  value={editingForm.actual_pct}
                                  onChange={(e) => setEditingForm({ ...editingForm, actual_pct: e.target.value })}
                                  className="table-input"
                                  inputMode="decimal"
                                  min="0"
                                  max="100"
                                  step="0.01"
                                />
                              ) : (
                                `${formatNumber(activity.actual_pct)}%`
                              )}
                            </td>
                            <td>{formatNumber(activity.pv)}</td>
                            <td>{formatNumber(activity.ev)}</td>
                            <td>
                              {editingActivityId === activity.id ? (
                                <input
                                  type="number"
                                  value={editingForm.ac}
                                  onChange={(e) => setEditingForm({ ...editingForm, ac: e.target.value })}
                                  className="table-input"
                                  inputMode="decimal"
                                  min="0"
                                  step="0.01"
                                />
                              ) : (
                                formatNumber(activity.ac)
                              )}
                            </td>
                            <td>{formatNumber(activity.cv)}</td>
                            <td>{formatNumber(activity.sv)}</td>
                            <td className={`tone-${getStatusTone(activity.cpi)}`}>
                              <span className="metric-with-icon">
                                <span
                                  className={`tone-icon tone-${getToneMeta(activity.cpi).tone}`}
                                  aria-label={getToneMeta(activity.cpi).label}
                                  title={getToneMeta(activity.cpi).label}
                                >
                                  {getToneMeta(activity.cpi).icon}
                                </span>
                                {formatNumber(activity.cpi)}
                              </span>
                            </td>
                            <td className={`tone-${getStatusTone(activity.spi)}`}>
                              <span className="metric-with-icon">
                                <span
                                  className={`tone-icon tone-${getToneMeta(activity.spi).tone}`}
                                  aria-label={getToneMeta(activity.spi).label}
                                  title={getToneMeta(activity.spi).label}
                                >
                                  {getToneMeta(activity.spi).icon}
                                </span>
                                {formatNumber(activity.spi)}
                              </span>
                            </td>
                            <td>
                              {editingActivityId === activity.id ? (
                                <div className="actions-row">
                                  <button type="button" onClick={() => saveActivity(activity.id)} className="btn btn-small btn-primary">
                                    Guardar
                                  </button>
                                  <button type="button" onClick={cancelEdit} className="btn btn-small btn-muted">
                                    Cancelar
                                  </button>
                                </div>
                              ) : !canEdit ? (
                                <span className="muted-text">Solo lectura</span>
                              ) : (
                                <div className="actions-row">
                                  <button type="button" onClick={() => startEdit(activity)} className="btn btn-small btn-primary">
                                    Editar
                                  </button>
                                  <button type="button" onClick={() => deleteActivity(activity.id)} className="btn btn-small btn-danger">
                                    Eliminar
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                        {visibleActivities.length === 0 && (
                          <tr>
                            <td colSpan={12} className="table-empty-message">
                              No hay actividades que coincidan con los filtros aplicados.
                            </td>
                          </tr>
                        )}
                      </tbody>
                </table>
              </div>
            </section>

            <section className="surface chart-surface">{renderChart()}</section>
          </>
        ) : (
          <section className="surface empty-state">
            <h3>Selecciona un proyecto para comenzar</h3>
            <p>Al elegir un proyecto veras KPIs, tabla editable de actividades y comparativos PV/EV/AC.</p>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;