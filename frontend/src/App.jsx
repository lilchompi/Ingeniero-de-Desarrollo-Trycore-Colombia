import { useEffect, useState } from 'react';
import './App.css';

const API_BASE = '/api';
const PROJECTS_CACHE_KEY = 'evm.projects.cache.v1';
const AUTH_SESSION_KEY = 'evm.auth.session.v1';

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${body || response.statusText}`);
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
    if (!parsed?.email || !parsed?.role) {
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
  const [loginEmail, setLoginEmail] = useState('lider@trycore.com');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginRole, setLoginRole] = useState('project_lead');
  const [authError, setAuthError] = useState('');
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectName, setProjectName] = useState('Proyecto Demo');
  const [description, setDescription] = useState('Demo técnica Trycore');
  const [activities, setActivities] = useState([]);
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activityForm, setActivityForm] = useState({
    name: '',
    bac: '1000',
    planned_pct: '50',
    actual_pct: '30',
    ac: '400',
  });
  const [editingActivityId, setEditingActivityId] = useState(null);
  const [editingForm, setEditingForm] = useState({
    name: '',
    bac: '1000',
    planned_pct: '50',
    actual_pct: '30',
    ac: '400',
  });

  const canEdit = authUser?.role === 'project_lead' || authUser?.role === 'admin';

  function handleLogin(event) {
    event.preventDefault();
    const email = loginEmail.trim().toLowerCase();
    if (!email || !loginPassword.trim()) {
      setAuthError('Ingresa correo y contrasena para continuar.');
      return;
    }

    const user = {
      email,
      role: loginRole,
      displayName: email.split('@')[0],
    };
    setAuthUser(user);
    writeAuthSession(user);
    setLoginPassword('');
    setAuthError('');
    setMessage('Sesion iniciada.');
  }

  function handleLogout() {
    setAuthUser(null);
    clearAuthSession();
    setProjects([]);
    setSelectedProjectId('');
    setActivities([]);
    setSummary(null);
    setEditingActivityId(null);
    setMessage('Sesion cerrada.');
  }

  async function fetchProjects() {
    setError('');
    try {
      const data = await requestJson(`${API_BASE}/projects`);
      const normalizedProjects = Array.isArray(data) ? data : [];
      setProjects(normalizedProjects);
      writeProjectsCache(normalizedProjects);
    } catch (err) {
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

    try {
      const data = await requestJson(`${API_BASE}/projects/${id}`);
      const activities = (data.activities || []).map(normalizeActivity);
      setActivities(activities);
      setSummary(data.summary || buildSummary(activities));
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
      setError(`No se pudo cargar el proyecto. ${err.message}`);
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
      const data = await requestJson(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: safeName, description: description.trim(), status: 'active' }),
      });
      setProjectName('');
      setDescription('');
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

      await requestJson(`${API_BASE}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: Number(selectedProjectId),
          name: activityName,
          description: '',
          kind: 'planning',
          status: 'pending',
          data_payload: {
            bac: Number(activityForm.bac),
            planned_pct: Number(activityForm.planned_pct),
            actual_pct: Number(activityForm.actual_pct),
            ac: Number(activityForm.ac),
          },
        }),
      });

      setActivityForm({ name: '', bac: '1000', planned_pct: '50', actual_pct: '30', ac: '400' });
      setMessage('Actividad agregada correctamente.');
      await loadProject(selectedProjectId);
    } catch (err) {
      setError(`No se pudo crear la actividad. ${err.message}`);
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

      await requestJson(`${API_BASE}/activities/${activityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nextName,
          data_payload: {
            bac: Number(editingForm.bac),
            planned_pct: Number(editingForm.planned_pct),
            actual_pct: Number(editingForm.actual_pct),
            ac: Number(editingForm.ac),
          },
        }),
      });

      setMessage('Actividad actualizada correctamente.');
      setEditingActivityId(null);
      setEditingForm({ name: '', bac: '1000', planned_pct: '50', actual_pct: '30', ac: '400' });
      await loadProject(selectedProjectId);
    } catch (err) {
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
    setEditingForm({ name: '', bac: '1000', planned_pct: '50', actual_pct: '30', ac: '400' });
  }

  function getStatusColor(value) {
    if (value === null || value === undefined) {
      return '#999';
    }
    return value >= 1 ? '#27ae60' : '#c0392b';
  }

  function formatNumber(value) {
    return value === null || value === undefined ? 'N/A' : Number(value).toFixed(2);
  }

  function getStatusTone(value) {
    if (value === null || value === undefined) {
      return 'neutral';
    }
    return value >= 1 ? 'good' : 'warn';
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
                placeholder="Contrasena"
                type="password"
                className="control-input"
              />
              <select value={loginRole} onChange={(e) => setLoginRole(e.target.value)} className="control-input">
                <option value="project_lead">Lider de proyecto (edicion)</option>
                <option value="viewer">Usuario lector (solo consulta)</option>
              </select>
              <button type="submit" className="btn btn-primary">Entrar</button>
            </form>
            {authError && <p className="auth-error">{authError}</p>}
            <p className="muted-text auth-help">Nota: este login es de frontend para flujo UI. La validacion real se conecta en backend luego.</p>
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

        <section className="surface controls-grid">
          <div className="control-block">
            <label className="field-label">Proyecto activo</label>
            <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)} className="control-input">
              <option value="">Selecciona un proyecto</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
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
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripcion"
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
            <section className="kpi-grid">
              <article className="kpi-card">
                <span>BAC</span>
                <strong>{formatNumber(summary?.bac)}</strong>
              </article>
              <article className="kpi-card">
                <span>PV</span>
                <strong>{formatNumber(summary?.pv)}</strong>
              </article>
              <article className="kpi-card">
                <span>EV</span>
                <strong>{formatNumber(summary?.ev)}</strong>
              </article>
              <article className="kpi-card">
                <span>AC</span>
                <strong>{formatNumber(summary?.ac)}</strong>
              </article>
              <article className={`kpi-card tone-${getStatusTone(summary?.cpi)}`}>
                <span>CPI</span>
                <strong>{formatNumber(summary?.cpi)}</strong>
              </article>
              <article className={`kpi-card tone-${getStatusTone(summary?.spi)}`}>
                <span>SPI</span>
                <strong>{formatNumber(summary?.spi)}</strong>
              </article>
              <article className="kpi-card">
                <span>EAC</span>
                <strong>{formatNumber(summary?.eac)}</strong>
              </article>
              <article className="kpi-card">
                <span>VAC</span>
                <strong>{formatNumber(summary?.vac)}</strong>
              </article>
            </section>

            <section className="status-grid">
              <article className={`status-card tone-${getStatusTone(summary?.cpi)}`}>
                <h3>Costo</h3>
                <p>{summary?.cpi_interpretation ?? 'Sin datos'}</p>
              </article>
              <article className={`status-card tone-${getStatusTone(summary?.spi)}`}>
                <h3>Cronograma</h3>
                <p>{summary?.spi_interpretation ?? 'Sin datos'}</p>
              </article>
            </section>

            <section className="surface form-surface">
              <h3 className="section-title">Registrar actividad</h3>
              <form onSubmit={addActivity} className="activity-form">
                    <input
                      value={activityForm.name}
                      onChange={(e) => setActivityForm({ ...activityForm, name: e.target.value })}
                      placeholder="Nombre"
                      className="control-input"
                      disabled={!canEdit}
                      required
                    />
                    <input
                      value={activityForm.bac}
                      onChange={(e) => setActivityForm({ ...activityForm, bac: e.target.value })}
                      placeholder="BAC"
                      className="control-input"
                      disabled={!canEdit}
                      required
                    />
                    <input
                      value={activityForm.planned_pct}
                      onChange={(e) => setActivityForm({ ...activityForm, planned_pct: e.target.value })}
                      placeholder="% planificado"
                      className="control-input"
                      disabled={!canEdit}
                      required
                    />
                    <input
                      value={activityForm.actual_pct}
                      onChange={(e) => setActivityForm({ ...activityForm, actual_pct: e.target.value })}
                      placeholder="% real"
                      className="control-input"
                      disabled={!canEdit}
                      required
                    />
                    <input
                      value={activityForm.ac}
                      onChange={(e) => setActivityForm({ ...activityForm, ac: e.target.value })}
                      placeholder="AC"
                      className="control-input"
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
              <h3 className="section-title">Indicadores por actividad</h3>
              <div className="table-scroll">
                <table className="evm-table">
                      <thead>
                        <tr>
                          <th>Actividad</th>
                          <th>BAC</th>
                          <th>% Planif.</th>
                          <th>% Real</th>
                          <th>PV</th>
                          <th>EV</th>
                          <th>AC</th>
                          <th>CV</th>
                          <th>SV</th>
                          <th>CPI</th>
                          <th>SPI</th>
                          <th>Accion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activities.map((activity) => (
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
                                  value={editingForm.bac}
                                  onChange={(e) => setEditingForm({ ...editingForm, bac: e.target.value })}
                                  className="table-input"
                                />
                              ) : (
                                formatNumber(activity.bac)
                              )}
                            </td>
                            <td>
                              {editingActivityId === activity.id ? (
                                <input
                                  value={editingForm.planned_pct}
                                  onChange={(e) => setEditingForm({ ...editingForm, planned_pct: e.target.value })}
                                  className="table-input"
                                />
                              ) : (
                                `${formatNumber(activity.planned_pct)}%`
                              )}
                            </td>
                            <td>
                              {editingActivityId === activity.id ? (
                                <input
                                  value={editingForm.actual_pct}
                                  onChange={(e) => setEditingForm({ ...editingForm, actual_pct: e.target.value })}
                                  className="table-input"
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
                                  value={editingForm.ac}
                                  onChange={(e) => setEditingForm({ ...editingForm, ac: e.target.value })}
                                  className="table-input"
                                />
                              ) : (
                                formatNumber(activity.ac)
                              )}
                            </td>
                            <td>{formatNumber(activity.cv)}</td>
                            <td>{formatNumber(activity.sv)}</td>
                            <td className={`tone-${getStatusTone(activity.cpi)}`}>{formatNumber(activity.cpi)}</td>
                            <td className={`tone-${getStatusTone(activity.spi)}`}>{formatNumber(activity.spi)}</td>
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
                                <button type="button" onClick={() => startEdit(activity)} className="btn btn-small btn-primary">
                                  Editar
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
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
