/* Simulacro de examen teórico - Licencia de conducir San Isidro */
(() => {
  'use strict';

  const CONFIG = {
    cantidadPorDefecto: 40,
    umbralAprobacion: 70, // porcentaje mínimo de respuestas correctas
    opcionesCantidad: [10, 20, 40, 60],
  };
  const LETRAS = 'ABCDE';
  const KEY_EN_CURSO = 'simulacro.examenEnCurso';
  const KEY_HIST = 'simulacro.historial';
  const KEY_NOMBRE = 'simulacro.nombre';
  const KEY_PRO = 'simulacro.incluirProfesionales';

  const app = document.getElementById('app');
  let banco = [];
  let examen = null;      // examen en curso
  let filtroRevision = 'todas';

  /* ---------- utilidades ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function lsGet(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
  }
  function lsDel(key) {
    try { localStorage.removeItem(key); } catch { /* nada */ }
  }

  function fmtFecha(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDuracion(seg) {
    const m = Math.floor(seg / 60), s = seg % 60;
    return `${m} min ${String(s).padStart(2, '0')} s`;
  }
  function nuevoId() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-` +
      Math.random().toString(36).slice(2, 6);
  }

  /* ---------- almacenamiento del historial ----------
     Con el servidor local (node server.js) se guarda en archivos JSON dentro de historial/.
     Si la web se abre sin servidor (por ejemplo publicada en internet), se usa el navegador. */
  const Store = {
    modo: 'navegador',
    async detectar() {
      try {
        const r = await fetch('api/estado', { cache: 'no-store' });
        if (r.ok && (await r.json()).ok) this.modo = 'servidor';
      } catch { this.modo = 'navegador'; }
    },
    async listar() {
      if (this.modo === 'servidor') return (await fetch('api/examenes')).json();
      return lsGet(KEY_HIST, []).map(({ preguntas, ...r }) => r).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    },
    async obtener(id) {
      if (this.modo === 'servidor') {
        const r = await fetch('api/examenes/' + encodeURIComponent(id));
        return r.ok ? r.json() : null;
      }
      return lsGet(KEY_HIST, []).find((e) => e.id === id) || null;
    },
    async guardar(ex) {
      if (this.modo === 'servidor') {
        const r = await fetch('api/examenes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ex),
        });
        if (!r.ok) throw new Error('No se pudo guardar');
        return;
      }
      const h = lsGet(KEY_HIST, []);
      h.push(ex);
      lsSet(KEY_HIST, h);
    },
    async borrar(id) {
      if (this.modo === 'servidor') {
        await fetch('api/examenes/' + encodeURIComponent(id), { method: 'DELETE' });
        return;
      }
      lsSet(KEY_HIST, lsGet(KEY_HIST, []).filter((e) => e.id !== id));
    },
  };

  /* ---------- armado del examen ---------- */
  // Preguntas disponibles según se incluyan o no las de licencias profesionales (C, D y E).
  function bancoDisponible(incluirProfesionales) {
    return incluirProfesionales ? banco : banco.filter((q) => !q.profesional);
  }

  // Toma preguntas repartidas entre todos los temas para cubrir todo el manual.
  function elegirPreguntas(cantidad, incluirProfesionales) {
    const porTema = {};
    bancoDisponible(incluirProfesionales).forEach((q) => { (porTema[q.tema] = porTema[q.tema] || []).push(q); });
    const grupos = shuffle(Object.values(porTema).map(shuffle));
    const elegidas = [];
    let quedan = true;
    while (elegidas.length < cantidad && quedan) {
      quedan = false;
      for (const g of grupos) {
        if (elegidas.length >= cantidad) break;
        if (g.length) { elegidas.push(g.pop()); quedan = true; }
      }
    }
    return shuffle(elegidas);
  }

  // Mezcla las opciones y recalcula el índice de la correcta.
  function prepararPregunta(q) {
    const orden = shuffle(q.opciones.map((_, i) => i));
    return {
      id: q.id,
      tema: q.tema,
      pregunta: q.pregunta,
      opciones: orden.map((i) => q.opciones[i]),
      correcta: orden.indexOf(q.correcta),
      explicacion: q.explicacion,
      pagina: q.pagina,
      profesional: !!q.profesional,
    };
  }

  function iniciarExamen(nombre, cantidad, incluirProfesionales) {
    examen = {
      id: nuevoId(),
      nombre: nombre || 'Sin nombre',
      inicio: new Date().toISOString(),
      umbral: CONFIG.umbralAprobacion,
      incluyeProfesionales: incluirProfesionales,
      preguntas: elegirPreguntas(cantidad, incluirProfesionales).map(prepararPregunta),
      respuestas: [],
      actual: 0,
    };
    examen.respuestas = examen.preguntas.map(() => null);
    lsSet(KEY_EN_CURSO, examen);
    renderExamen();
  }

  function corregir(ex) {
    const fin = new Date();
    const preguntas = ex.preguntas.map((q, i) => ({
      ...q,
      elegida: ex.respuestas[i],
      acierto: ex.respuestas[i] === q.correcta,
    }));
    const total = preguntas.length;
    const correctas = preguntas.filter((q) => q.acierto).length;
    const sinResponder = preguntas.filter((q) => q.elegida === null).length;
    const minimo = Math.ceil((total * ex.umbral) / 100);
    return {
      id: ex.id,
      nombre: ex.nombre,
      fecha: fin.toISOString(),
      duracionSeg: Math.round((fin - new Date(ex.inicio)) / 1000),
      total,
      correctas,
      incorrectas: total - correctas - sinResponder,
      sinResponder,
      porcentaje: Math.round((correctas / total) * 100),
      umbral: ex.umbral,
      minimoCorrectas: minimo,
      aprobado: correctas >= minimo,
      incluyeProfesionales: !!ex.incluyeProfesionales,
      preguntas,
    };
  }

  async function finalizarExamen() {
    const pendientes = examen.respuestas.filter((r) => r === null).length;
    if (pendientes && !confirm(`Te quedan ${pendientes} pregunta(s) sin responder y se contarán como incorrectas. ¿Finalizar igual?`)) return;
    const resultado = corregir(examen);
    examen = null;
    lsDel(KEY_EN_CURSO);
    let errorGuardado = false;
    try { await Store.guardar(resultado); } catch { errorGuardado = true; }
    filtroRevision = 'todas';
    renderResultado(resultado, { recien: true, errorGuardado });
  }

  /* ---------- pantallas ---------- */
  function setNav(pantalla) {
    document.querySelectorAll('.navlink').forEach((b) => b.classList.toggle('active', b.dataset.go === pantalla));
    window.scrollTo(0, 0);
  }

  function renderInicio() {
    setNav('inicio');
    const enCurso = lsGet(KEY_EN_CURSO, null);
    const nombre = lsGet(KEY_NOMBRE, '');
    const incluirPro = lsGet(KEY_PRO, false) === true;
    const cantPro = banco.filter((q) => q.profesional).length;
    const textoBanco = (pro) => {
      const disp = bancoDisponible(pro);
      return `Preguntas multiple choice elegidas al azar de un banco de <b>${disp.length}</b> preguntas, repartidas entre ${new Set(disp.map((q) => q.tema)).size} temas.`;
    };
    app.innerHTML = `
      <section class="card">
        <h1>Simulacro del examen teórico</h1>
        <p class="muted">Practicá para la licencia de conducir del Municipio de San Isidro con preguntas basadas en el Manual de Educación Vial.</p>
        <ul class="rules">
          <li id="texto-banco">${textoBanco(incluirPro)}</li>
          <li>Para aprobar necesitás al menos el <b>${CONFIG.umbralAprobacion}%</b> de respuestas correctas.</li>
          <li>Al terminar ves cada corrección, la respuesta correcta y en qué página del manual está.</li>
          <li>Cada examen queda guardado en el historial.</li>
        </ul>
        ${enCurso ? `
          <div class="card" style="background:var(--warn-soft);border-color:transparent">
            <b>Tenés un examen sin terminar</b> (${enCurso.respuestas.filter((r) => r !== null).length} de ${enCurso.preguntas.length} respondidas).
            <div class="btn-row" style="margin-top:10px">
              <button class="btn btn-primary" id="btn-continuar" type="button">Continuar examen</button>
              <button class="btn btn-danger" id="btn-descartar" type="button">Descartarlo</button>
            </div>
          </div>` : ''}
        <form id="form-inicio">
          <div class="field">
            <label for="nombre">Tu nombre (opcional)</label>
            <input id="nombre" maxlength="60" value="${esc(nombre)}" placeholder="Para identificar tus exámenes en el historial">
          </div>
          <div class="field">
            <label for="cantidad">Cantidad de preguntas</label>
            <select id="cantidad" class="btn" style="padding:8px 10px">
              ${CONFIG.opcionesCantidad.map((n) => `<option value="${n}" ${n === CONFIG.cantidadPorDefecto ? 'selected' : ''}>${n}${n === CONFIG.cantidadPorDefecto ? ' (como el examen real)' : ''}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label class="check" for="incluir-pro">
              <input type="checkbox" id="incluir-pro" ${incluirPro ? 'checked' : ''}>
              <span>
                Incluir preguntas de licencias profesionales
                <span class="check-help">Clases C, D y E: camiones, colectivos, taxis y remises (${cantPro} preguntas).</span>
              </span>
            </label>
          </div>
          <button class="btn btn-primary" type="submit">Comenzar examen</button>
        </form>
      </section>`;

    const chkPro = document.getElementById('incluir-pro');
    chkPro.addEventListener('change', () => {
      lsSet(KEY_PRO, chkPro.checked);
      document.getElementById('texto-banco').innerHTML = textoBanco(chkPro.checked);
    });

    document.getElementById('form-inicio').addEventListener('submit', (e) => {
      e.preventDefault();
      const n = document.getElementById('nombre').value.trim();
      lsSet(KEY_NOMBRE, n);
      lsSet(KEY_PRO, chkPro.checked);
      if (enCurso && !confirm('Se va a descartar el examen sin terminar. ¿Seguir?')) return;
      iniciarExamen(n, Number(document.getElementById('cantidad').value), chkPro.checked);
    });
    if (enCurso) {
      document.getElementById('btn-continuar').onclick = () => { examen = enCurso; renderExamen(); };
      document.getElementById('btn-descartar').onclick = () => { lsDel(KEY_EN_CURSO); renderInicio(); };
    }
  }

  function renderExamen() {
    setNav('');
    const i = examen.actual;
    const q = examen.preguntas[i];
    const total = examen.preguntas.length;
    const respondidas = examen.respuestas.filter((r) => r !== null).length;
    const elegida = examen.respuestas[i];

    app.innerHTML = `
      <section class="card">
        <div class="progress-head">
          <span>Pregunta <b>${i + 1}</b> de ${total}</span>
          <span class="muted">${respondidas} respondida(s)</span>
        </div>
        <div class="bar"><span style="width:${(respondidas / total) * 100}%"></span></div>
        <span class="tema-tag">${esc(q.tema)}</span>
        <p class="question">${esc(q.pregunta)}</p>
        <div class="options" role="radiogroup">
          ${q.opciones.map((op, k) => `
            <button type="button" role="radio" aria-checked="${elegida === k}" class="option ${elegida === k ? 'selected' : ''}" data-op="${k}">
              <span class="letter">${LETRAS[k]}</span><span>${esc(op)}</span>
            </button>`).join('')}
        </div>
        <div class="btn-row spread">
          <button class="btn" id="btn-ant" type="button" ${i === 0 ? 'disabled' : ''}>← Anterior</button>
          <div class="btn-row">
            ${i < total - 1 ? '<button class="btn btn-primary" id="btn-sig" type="button">Siguiente →</button>' : ''}
            <button class="btn ${i === total - 1 ? 'btn-primary' : ''}" id="btn-fin" type="button">Finalizar examen</button>
          </div>
        </div>
        <div class="qmap" aria-label="Ir a pregunta">
          ${examen.preguntas.map((_, k) => `<button type="button" data-ir="${k}" class="${examen.respuestas[k] !== null ? 'answered' : ''} ${k === i ? 'current' : ''}">${k + 1}</button>`).join('')}
        </div>
      </section>`;

    app.querySelectorAll('.option').forEach((b) => {
      b.onclick = () => {
        examen.respuestas[i] = Number(b.dataset.op);
        lsSet(KEY_EN_CURSO, examen);
        renderExamen();
      };
    });
    app.querySelectorAll('[data-ir]').forEach((b) => {
      b.onclick = () => { examen.actual = Number(b.dataset.ir); lsSet(KEY_EN_CURSO, examen); renderExamen(); };
    });
    const ir = (d) => { examen.actual += d; lsSet(KEY_EN_CURSO, examen); renderExamen(); };
    document.getElementById('btn-ant').onclick = () => ir(-1);
    const sig = document.getElementById('btn-sig');
    if (sig) sig.onclick = () => ir(1);
    document.getElementById('btn-fin').onclick = finalizarExamen;
  }

  function resumenPorTema(res) {
    const t = {};
    res.preguntas.forEach((q) => {
      t[q.tema] = t[q.tema] || { total: 0, ok: 0 };
      t[q.tema].total++;
      if (q.acierto) t[q.tema].ok++;
    });
    return Object.entries(t).sort((a, b) => (a[1].ok / a[1].total) - (b[1].ok / b[1].total));
  }

  function renderResultado(res, { recien = false, errorGuardado = false } = {}) {
    setNav(recien ? '' : 'historial');
    const cls = res.aprobado ? 'ok' : 'bad';
    const lista = res.preguntas
      .map((q, n) => ({ q, n }))
      .filter(({ q }) => filtroRevision === 'todas' || (filtroRevision === 'errores' ? !q.acierto : q.acierto));

    app.innerHTML = `
      ${errorGuardado ? '<div class="card" style="background:var(--bad-soft)">No se pudo guardar este examen en el historial.</div>' : ''}
      <section class="card">
        <div class="result-hero">
          <div class="score ${cls}">${res.porcentaje}%</div>
          <div>
            <p class="verdict ${cls}">${res.aprobado ? 'APROBADO' : 'NO APROBADO'}</p>
            <p class="muted" style="margin:4px 0 0">${esc(res.nombre)} · ${fmtFecha(res.fecha)} · ${res.incluyeProfesionales ? 'Con preguntas profesionales' : 'Sin preguntas profesionales'}</p>
            <p style="margin:4px 0 0">Respondiste bien <b>${res.correctas} de ${res.total}</b>. Necesitabas al menos ${res.minimoCorrectas} (${res.umbral}%).</p>
          </div>
        </div>
        <div class="stats">
          <div class="stat"><b style="color:var(--ok)">${res.correctas}</b>Correctas</div>
          <div class="stat"><b style="color:var(--bad)">${res.incorrectas}</b>Incorrectas</div>
          <div class="stat"><b style="color:var(--warn)">${res.sinResponder}</b>Sin responder</div>
          <div class="stat"><b>${fmtDuracion(res.duracionSeg)}</b>Duración</div>
        </div>
        <div class="btn-row" style="margin-top:16px">
          <button class="btn btn-primary" data-go="inicio" type="button">Hacer otro examen</button>
          <button class="btn" data-go="historial" type="button">Ver historial</button>
          <button class="btn" id="btn-descargar" type="button">Descargar resultado (JSON)</button>
        </div>
      </section>

      <section class="card">
        <h2>Resultado por tema</h2>
        <table class="temas-table">
          <thead><tr><th>Tema</th><th class="num">Correctas</th></tr></thead>
          <tbody>
            ${resumenPorTema(res).map(([tema, v]) => `
              <tr><td>${esc(tema)}</td><td class="num" style="color:${v.ok === v.total ? 'var(--ok)' : v.ok === 0 ? 'var(--bad)' : 'inherit'}">${v.ok} / ${v.total}</td></tr>`).join('')}
          </tbody>
        </table>
      </section>

      <h2>Corrección</h2>
      <div class="filters">
        ${[['todas', `Todas (${res.total})`], ['errores', `Errores (${res.total - res.correctas})`], ['aciertos', `Aciertos (${res.correctas})`]]
          .map(([k, l]) => `<button type="button" class="chip ${filtroRevision === k ? 'active' : ''}" data-filtro="${k}">${l}</button>`).join('')}
      </div>
      ${lista.length ? '' : '<p class="muted">No hay preguntas en este filtro.</p>'}
      ${lista.map(({ q, n }) => `
        <article class="card review ${q.acierto ? 'ok' : 'bad'}">
          <div class="review-head">
            <span class="muted small">Pregunta ${n + 1} · ${esc(q.tema)}${q.profesional ? ' · Licencias profesionales' : ''}</span>
            ${q.acierto ? '<span class="badge ok">Correcta</span>'
              : q.elegida === null ? '<span class="badge warn">Sin responder</span>' : '<span class="badge bad">Incorrecta</span>'}
          </div>
          <p class="question">${esc(q.pregunta)}</p>
          ${q.opciones.map((op, k) => {
            const c = k === q.correcta ? 'correct' : k === q.elegida ? 'wrong' : '';
            const mark = k === q.correcta ? '✓' : k === q.elegida ? '✗' : '';
            const yo = k === q.elegida ? ' <span class="small">(tu respuesta)</span>' : '';
            return `<div class="review-opt ${c}"><span class="mark">${mark}</span><span>${LETRAS[k]}. ${esc(op)}${yo}</span></div>`;
          }).join('')}
          ${!q.acierto ? `<p class="small" style="margin:8px 0 0"><b>Respuesta correcta:</b> ${LETRAS[q.correcta]}. ${esc(q.opciones[q.correcta])}</p>` : ''}
          <div class="explain">${esc(q.explicacion)}${q.pagina ? ` <b>(Manual, pág. ${q.pagina})</b>` : ''}</div>
        </article>`).join('')}`;

    app.querySelectorAll('[data-filtro]').forEach((b) => {
      b.onclick = () => { filtroRevision = b.dataset.filtro; renderResultado(res, { recien }); };
    });
    document.getElementById('btn-descargar').onclick = () => {
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `examen-${res.id}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    };
  }

  async function renderHistorial() {
    setNav('historial');
    app.innerHTML = '<section class="card"><p class="muted">Cargando historial…</p></section>';
    let items = [];
    try { items = await Store.listar(); } catch { /* vacío */ }

    const aprobados = items.filter((e) => e.aprobado).length;
    const promedio = items.length ? Math.round(items.reduce((s, e) => s + e.porcentaje, 0) / items.length) : 0;

    app.innerHTML = `
      <section class="card">
        <h1>Historial de exámenes</h1>
        <p class="muted small">${Store.modo === 'servidor'
          ? 'Guardado en archivos dentro de la carpeta <code>historial/</code> del proyecto.'
          : 'Guardado en este navegador.'}</p>
        ${items.length ? `
          <div class="stats">
            <div class="stat"><b>${items.length}</b>Exámenes</div>
            <div class="stat"><b style="color:var(--ok)">${aprobados}</b>Aprobados</div>
            <div class="stat"><b>${promedio}%</b>Promedio</div>
          </div>` : ''}
      </section>
      <section class="card">
        ${items.length ? items.map((e) => `
          <div class="hist-item">
            <div>
              <div class="when">${fmtFecha(e.fecha)} · ${esc(e.nombre)}</div>
              <div class="small muted">${e.correctas}/${e.total} correctas · ${e.porcentaje}% · ${fmtDuracion(e.duracionSeg)}${e.incluyeProfesionales ? ' · Con profesionales' : ''}</div>
            </div>
            <div class="btn-row">
              <span class="badge ${e.aprobado ? 'ok' : 'bad'}" style="align-self:center">${e.aprobado ? 'Aprobado' : 'No aprobado'}</span>
              <button class="btn" type="button" data-ver="${esc(e.id)}">Ver corrección</button>
              <button class="btn btn-danger" type="button" data-borrar="${esc(e.id)}" aria-label="Borrar examen">Borrar</button>
            </div>
          </div>`).join('')
        : '<div class="empty muted">Todavía no hay exámenes guardados.<div style="margin-top:12px"><button class="btn btn-primary" data-go="inicio" type="button">Hacer el primero</button></div></div>'}
      </section>`;

    app.querySelectorAll('[data-ver]').forEach((b) => {
      b.onclick = async () => {
        const ex = await Store.obtener(b.dataset.ver);
        if (ex) { filtroRevision = 'todas'; renderResultado(ex); }
      };
    });
    app.querySelectorAll('[data-borrar]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('¿Borrar este examen del historial? No se puede deshacer.')) return;
        await Store.borrar(b.dataset.borrar);
        renderHistorial();
      };
    });
  }

  /* ---------- navegación ---------- */
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (!go) return;
    if (examen && !confirm('Tenés un examen en curso. Queda guardado y podés continuarlo después. ¿Salir?')) return;
    examen = null;
    if (go.dataset.go === 'historial') renderHistorial();
    else renderInicio();
  });

  async function init() {
    try {
      banco = await (await fetch('preguntas.json', { cache: 'no-store' })).json();
    } catch {
      app.innerHTML = '<section class="card"><h1>No se pudieron cargar las preguntas</h1><p>Abrí la web con <code>npm start</code> y entrá a http://localhost:3000</p></section>';
      return;
    }
    await Store.detectar();
    document.getElementById('storage-mode').textContent = Store.modo === 'servidor'
      ? 'Historial: archivos locales (carpeta historial/).'
      : 'Historial: guardado en este navegador.';
    renderInicio();
  }

  init();
})();
