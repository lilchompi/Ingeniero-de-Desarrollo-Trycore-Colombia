import { useEffect, useState } from 'react';

const API_BASE = '/api';
const PROJECTS_CACHE_KEY = 'evm.projects.cache.v1';

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

function App() {
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

  function renderChart() {
    if (activities.length === 0) {
      return <p>No hay actividades para mostrar en la gráfica.</p>;
    }

    const maxValue = Math.max(
      1,
      ...activities.flatMap((activity) => [activity.pv, activity.ev, activity.ac])
    );

    return (
      <div>
        <h3>Comparación PV / EV / AC</h3>
        {activities.map((activity) => (
          <div key={activity.id} style={{ marginBottom: 12 }}>
            <strong>{activity.name}</strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 4, marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 50 }}>PV</span>
                <div style={{ flex: 1, background: '#f0f0f0', height: 18, borderRadius: 6 }}>
                  <div style={{ width: `${(activity.pv / maxValue) * 100}%`, height: '100%', background: '#2980b9', borderRadius: 6 }} />
                </div>
                <span style={{ width: 60, textAlign: 'right' }}>{formatNumber(activity.pv)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 50 }}>EV</span>
                <div style={{ flex: 1, background: '#f0f0f0', height: 18, borderRadius: 6 }}>
                  <div style={{ width: `${(activity.ev / maxValue) * 100}%`, height: '100%', background: '#27ae60', borderRadius: 6 }} />
                </div>
                <span style={{ width: 60, textAlign: 'right' }}>{formatNumber(activity.ev)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 50 }}>AC</span>
                <div style={{ flex: 1, background: '#f0f0f0', height: 18, borderRadius: 6 }}>
                  <div style={{ width: `${(activity.ac / maxValue) * 100}%`, height: '100%', background: '#e67e22', borderRadius: 6 }} />
                </div>
                <span style={{ width: 60, textAlign: 'right' }}>{formatNumber(activity.ac)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  useEffect(() => {
    const cachedProjects = readProjectsCache();
    if (cachedProjects.length > 0) {
      setProjects(cachedProjects);
    }
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadProject(selectedProjectId);
    }
  }, [selectedProjectId]);

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1>Dashboard EVM</h1>
      <p>Registra actividades, edítalas y visualiza indicadores de valor ganado en tiempo real.</p>

      <section style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>Proyecto</label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            style={{ padding: 8, minWidth: 240 }}
          >
            <option value="">Selecciona un proyecto</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>Nuevo proyecto</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Nombre del proyecto"
              style={{ flex: 1, padding: 8 }}
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción"
              style={{ flex: 1, padding: 8 }}
            />
            <button onClick={createProject} style={{ padding: '8px 16px' }}>
              Crear proyecto
            </button>
          </div>
        </div>
      </section>

      {message && <div style={{ color: '#2d6a4f', marginBottom: 16 }}>{message}</div>}
      {error && <div style={{ color: '#b00020', marginBottom: 16 }}>{error}</div>}

      {selectedProjectId ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
              <strong>BAC</strong>
              <div style={{ marginTop: 8 }}>{formatNumber(summary?.bac)}</div>
            </div>
            <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
              <strong>PV</strong>
              <div style={{ marginTop: 8 }}>{formatNumber(summary?.pv)}</div>
            </div>
            <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
              <strong>EV</strong>
              <div style={{ marginTop: 8 }}>{formatNumber(summary?.ev)}</div>
            </div>
            <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
              <strong>AC</strong>
              <div style={{ marginTop: 8 }}>{formatNumber(summary?.ac)}</div>
            </div>
            <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
              <strong>CPI</strong>
              <div style={{ marginTop: 8, color: getStatusColor(summary?.cpi) }}>{formatNumber(summary?.cpi)}</div>
            </div>
            <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
              <strong>SPI</strong>
              <div style={{ marginTop: 8, color: getStatusColor(summary?.spi) }}>{formatNumber(summary?.spi)}</div>
            </div>
            <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
              <strong>EAC</strong>
              <div style={{ marginTop: 8 }}>{formatNumber(summary?.eac)}</div>
            </div>
            <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
              <strong>VAC</strong>
              <div style={{ marginTop: 8 }}>{formatNumber(summary?.vac)}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: getStatusColor(summary?.cpi),
                color: '#fff',
                minWidth: 180,
              }}
            >
              <strong>Costo</strong>
              <div>{summary?.cpi_interpretation ?? 'Sin datos'}</div>
            </div>
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: getStatusColor(summary?.spi),
                color: '#fff',
                minWidth: 180,
              }}
            >
              <strong>Cronograma</strong>
              <div>{summary?.spi_interpretation ?? 'Sin datos'}</div>
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <h3>Ingresar / editar actividades</h3>
            <form onSubmit={addActivity} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={activityForm.name}
                onChange={(e) => setActivityForm({ ...activityForm, name: e.target.value })}
                placeholder="Nombre"
                style={{ padding: 8, flex: 1, minWidth: 180 }}
                required
              />
              <input
                value={activityForm.bac}
                onChange={(e) => setActivityForm({ ...activityForm, bac: e.target.value })}
                placeholder="BAC"
                style={{ padding: 8, width: 110 }}
                required
              />
              <input
                value={activityForm.planned_pct}
                onChange={(e) => setActivityForm({ ...activityForm, planned_pct: e.target.value })}
                placeholder="% planificado"
                style={{ padding: 8, width: 110 }}
                required
              />
              <input
                value={activityForm.actual_pct}
                onChange={(e) => setActivityForm({ ...activityForm, actual_pct: e.target.value })}
                placeholder="% real"
                style={{ padding: 8, width: 110 }}
                required
              />
              <input
                value={activityForm.ac}
                onChange={(e) => setActivityForm({ ...activityForm, ac: e.target.value })}
                placeholder="AC"
                style={{ padding: 8, width: 110 }}
                required
              />
              <button type="submit" style={{ padding: '8px 16px' }}>
                Agregar
              </button>
            </form>
          </div>

          <div style={{ marginBottom: 24 }}>
            <h3>Indicadores por actividad</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={tableHeaderStyle}>Actividad</th>
                  <th style={tableHeaderStyle}>BAC</th>
                  <th style={tableHeaderStyle}>% Planif.</th>
                  <th style={tableHeaderStyle}>% Real</th>
                  <th style={tableHeaderStyle}>PV</th>
                  <th style={tableHeaderStyle}>EV</th>
                  <th style={tableHeaderStyle}>AC</th>
                  <th style={tableHeaderStyle}>CV</th>
                  <th style={tableHeaderStyle}>SV</th>
                  <th style={tableHeaderStyle}>CPI</th>
                  <th style={tableHeaderStyle}>SPI</th>
                  <th style={tableHeaderStyle}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((activity) => (
                  <tr key={activity.id}>
                    <td style={tableCellStyle}>
                      {editingActivityId === activity.id ? (
                        <input
                          value={editingForm.name}
                          onChange={(e) => setEditingForm({ ...editingForm, name: e.target.value })}
                          style={inputCellStyle}
                        />
                      ) : (
                        activity.name
                      )}
                    </td>
                    <td style={tableCellStyle}>
                      {editingActivityId === activity.id ? (
                        <input
                          value={editingForm.bac}
                          onChange={(e) => setEditingForm({ ...editingForm, bac: e.target.value })}
                          style={inputCellStyle}
                        />
                      ) : (
                        formatNumber(activity.bac)
                      )}
                    </td>
                    <td style={tableCellStyle}>
                      {editingActivityId === activity.id ? (
                        <input
                          value={editingForm.planned_pct}
                          onChange={(e) => setEditingForm({ ...editingForm, planned_pct: e.target.value })}
                          style={inputCellStyle}
                        />
                      ) : (
                        `${formatNumber(activity.planned_pct)}%`
                      )}
                    </td>
                    <td style={tableCellStyle}>
                      {editingActivityId === activity.id ? (
                        <input
                          value={editingForm.actual_pct}
                          onChange={(e) => setEditingForm({ ...editingForm, actual_pct: e.target.value })}
                          style={inputCellStyle}
                        />
                      ) : (
                        `${formatNumber(activity.actual_pct)}%`
                      )}
                    </td>
                    <td style={tableCellStyle}>{formatNumber(activity.pv)}</td>
                    <td style={tableCellStyle}>{formatNumber(activity.ev)}</td>
                    <td style={tableCellStyle}>
                      {editingActivityId === activity.id ? (
                        <input
                          value={editingForm.ac}
                          onChange={(e) => setEditingForm({ ...editingForm, ac: e.target.value })}
                          style={inputCellStyle}
                        />
                      ) : (
                        formatNumber(activity.ac)
                      )}
                    </td>
                    <td style={tableCellStyle}>{formatNumber(activity.cv)}</td>
                    <td style={tableCellStyle}>{formatNumber(activity.sv)}</td>
                    <td style={{ ...tableCellStyle, color: getStatusColor(activity.cpi) }}>{formatNumber(activity.cpi)}</td>
                    <td style={{ ...tableCellStyle, color: getStatusColor(activity.spi) }}>{formatNumber(activity.spi)}</td>
                    <td style={tableCellStyle}>
                      {editingActivityId === activity.id ? (
                        <>
                          <button type="button" onClick={() => saveActivity(activity.id)} style={actionButtonStyle}>
                            Guardar
                          </button>
                          <button type="button" onClick={cancelEdit} style={cancelButtonStyle}>
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => startEdit(activity)} style={actionButtonStyle}>
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginBottom: 24 }}>{renderChart()}</div>
        </>
      ) : (
        <p>Selecciona un proyecto o crea uno nuevo para iniciar el seguimiento EVM.</p>
      )}
    </div>
  );
}

const tableHeaderStyle = {
  borderBottom: '1px solid #ccc',
  padding: 8,
  textAlign: 'left',
  background: '#f9f9f9',
};

const tableCellStyle = {
  padding: 8,
  borderBottom: '1px solid #eee',
};

const inputCellStyle = {
  width: '100%',
  padding: 6,
  borderRadius: 4,
  border: '1px solid #ccc',
};

const actionButtonStyle = {
  padding: '6px 10px',
  marginRight: 8,
  borderRadius: 4,
  border: 'none',
  background: '#2980b9',
  color: '#fff',
  cursor: 'pointer',
};

const cancelButtonStyle = {
  padding: '6px 10px',
  borderRadius: 4,
  border: 'none',
  background: '#7f8c8d',
  color: '#fff',
  cursor: 'pointer',
};

export default App;
