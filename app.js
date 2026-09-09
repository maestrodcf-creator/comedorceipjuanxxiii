// ============================================
// COMEDOR CEIP JUAN XXIII - app.js
// Núcleo: utilidades, estado, router
// ============================================

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');

const estado = {
  vista: 'inicio',
  pinFamilia: null,
  pinStaff: null,
  pinAdmin: null,
  claveProfesorado: null,
  claseProfesoradoNombre: null,
  listadoProfesorado: [],
  nombreFamilia: null,
  alumnos: [],          // alumnos de la familia logueada
  asistenciaSemana: {}, // { alumnoId: { 'YYYY-MM-DD': true/false } }
  config: {},
  fechaStaffSeleccionada: null,
  listadoStaff: [],
  tabAdminActiva: 'alumnos',
  modoSeleccion: null,
  clasesAdmin: [],
  familiasAdmin: [],
  alumnosAdmin: [],
  clavesProfesoradoAdmin: [],
  estadisticasAdmin: []
};

// ===== Utilidades generales =====

function mostrarToast(mensaje, ms = 2400) {
  toastEl.textContent = mensaje;
  toastEl.classList.add('visible');
  setTimeout(() => toastEl.classList.remove('visible'), ms);
}

// ===== Menú mensual (consulta pública desde cualquier panel) =====

async function abrirMenuMensual() {
  mostrarToast('Buscando el menú…', 1500);
  try {
    const cliente = obtenerSupabaseClient();
    const { data, error } = await cliente.from('comedor_menu_actual').select('*').eq('id', 1).single();
    if (error || !data || !data.ruta_storage) {
      mostrarToast('Todavía no se ha subido ningún menú.');
      return;
    }
    const { data: urlData } = cliente.storage.from('comedor-menu').getPublicUrl(data.ruta_storage);
    window.open(urlData.publicUrl, '_blank');
  } catch (e) {
    mostrarToast('No se pudo abrir el menú.');
  }
}

function hoyISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

function sumarDias(fechaISO, n) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  fecha.setDate(fecha.getDate() + n);
  const tz = fecha.getTimezoneOffset() * 60000;
  return new Date(fecha - tz).toISOString().slice(0, 10);
}

function formatearFechaLarga(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  const opciones = { weekday: 'long', day: 'numeric', month: 'long' };
  return fecha.toLocaleDateString('es-ES', opciones);
}

function formatearFechaCorta(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  return fecha.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

function esFinde(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const dia = new Date(y, m - 1, d).getDay();
  return dia === 0 || dia === 6;
}

function iniciales(nombre, apellidos) {
  const n = (nombre || '').trim()[0] || '';
  const a = (apellidos || '').trim()[0] || '';
  return (n + a).toUpperCase();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function horaActualPasaLimite(horaLimite) {
  if (!horaLimite) return false;
  const ahora = new Date();
  const [hh, mm] = horaLimite.split(':').map(Number);
  const limite = new Date();
  limite.setHours(hh, mm, 0, 0);
  return ahora > limite;
}

async function rpc(nombre, params) {
  const cliente = obtenerSupabaseClient();
  const { data, error } = await cliente.rpc(nombre, params);
  if (error) {
    console.error(`Error en RPC ${nombre}:`, error);
    throw error;
  }
  return data;
}

// ===== Sesión (persistencia local de PINs) =====

function guardarSesion() {
  localStorage.setItem('comedor_sesion', JSON.stringify({
    pinFamilia: estado.pinFamilia,
    pinStaff: estado.pinStaff,
    pinAdmin: estado.pinAdmin,
    claveProfesorado: estado.claveProfesorado
  }));
}

function cargarSesion() {
  try {
    const datos = JSON.parse(localStorage.getItem('comedor_sesion') || '{}');
    estado.pinFamilia = datos.pinFamilia || null;
    estado.pinStaff = datos.pinStaff || null;
    estado.pinAdmin = datos.pinAdmin || null;
    estado.claveProfesorado = datos.claveProfesorado || null;
  } catch (e) {}
}

function salirDePerfil(tipo) {
  if (tipo === 'familia') { estado.pinFamilia = null; estado.alumnos = []; }
  if (tipo === 'staff') { estado.pinStaff = null; estado.listadoStaff = []; }
  if (tipo === 'admin') { estado.pinAdmin = null; }
  if (tipo === 'profesorado') { estado.claveProfesorado = null; estado.listadoProfesorado = []; }
  guardarSesion();
  navegar('inicio');
}

// ===== Router =====

function navegar(vista) {
  estado.vista = vista;
  render();
  window.scrollTo(0, 0);
}

function render() {
  switch (estado.vista) {
    case 'inicio': return renderInicio();
    case 'login-familias': return renderLoginFamilias();
    case 'login-staff': return renderLoginStaff();
    case 'login-admin': return renderLoginAdmin();
    case 'login-profesorado': return renderLoginProfesorado();
    case 'panel-profesorado': return renderPanelProfesorado();
    case 'panel-familias': return renderPanelFamilias();
    case 'panel-staff': return renderPanelStaff();
    case 'panel-admin': return renderPanelAdmin();
    case 'instalar-app': return renderInstalarApp();
    default: return renderInicio();
  }
}

// ===== Pantalla inicio =====

function renderInicio() {
  app.innerHTML = `
    <div class="inicio">
      <div class="inicio-cabecera">
        <div class="bandeja-icono"><img src="icons/escudo-web.png" alt="Escudo CEIP Juan XXIII"></div>
        <h1 class="inicio-titulo">Comedor escolar</h1>
        <div class="inicio-subtitulo">CEIP Juan XXIII · Los Gallardos</div>
      </div>
      <div class="puertas">
        <button class="puerta" onclick="irAPerfil('familias')">
          <div class="puerta-icono familias">👨‍👩‍👧</div>
          <div class="puerta-texto">
            <h3>Familias</h3>
            <p>Marca si tu hijo/a va al comedor</p>
          </div>
          <div class="puerta-flecha">›</div>
        </button>
        <button class="puerta" onclick="irAPerfil('profesorado')">
          <div class="puerta-icono profesorado">🍎</div>
          <div class="puerta-texto">
            <h3>Docentes</h3>
            <p>Consulta quién va de tu clase</p>
          </div>
          <div class="puerta-flecha">›</div>
        </button>
        <button class="puerta" onclick="irAPerfil('staff')">
          <div class="puerta-icono comedor">👩‍🍳</div>
          <div class="puerta-texto">
            <h3>Personal de comedor</h3>
            <p>Consulta el listado del día</p>
          </div>
          <div class="puerta-flecha">›</div>
        </button>
        <button class="puerta" onclick="irAPerfil('admin')">
          <div class="puerta-icono admin">⚙️</div>
          <div class="puerta-texto">
            <h3>Administración</h3>
            <p>Gestión del centro</p>
          </div>
          <div class="puerta-flecha">›</div>
        </button>
        <button class="puerta" onclick="navegar('instalar-app')">
          <div class="puerta-icono instalar">📲</div>
          <div class="puerta-texto">
            <h3>Instalar la app</h3>
            <p>Guía para tu móvil (iPhone / Android)</p>
          </div>
          <div class="puerta-flecha">›</div>
        </button>
      </div>
      <div class="pie-centro">CEIP Juan XXIII · Los Gallardos, Almería</div>
    </div>
  `;
}

function irAPerfil(tipo) {
  cerrarOtrasSesiones(tipo);

  if (tipo === 'familias') {
    if (estado.pinFamilia) { cargarPanelFamilias(); } else { navegar('login-familias'); }
  } else if (tipo === 'profesorado') {
    if (estado.claveProfesorado) { cargarPanelProfesorado(); } else { navegar('login-profesorado'); }
  } else if (tipo === 'staff') {
    if (estado.pinStaff) { cargarPanelStaff(); } else { navegar('login-staff'); }
  } else if (tipo === 'admin') {
    if (estado.pinAdmin) { cargarPanelAdmin(); } else { navegar('login-admin'); }
  }
}

// Por seguridad, solo un perfil puede estar "recordado" a la vez en este
// dispositivo. Al entrar a un perfil distinto del que ya estaba activo,
// se cierra la sesión de los demás y hay que volver a introducir su PIN.
function cerrarOtrasSesiones(tipoQueEntra) {
  if (tipoQueEntra !== 'familias' && estado.pinFamilia) {
    estado.pinFamilia = null; estado.alumnos = []; estado.nombreFamilia = null;
  }
  if (tipoQueEntra !== 'profesorado' && estado.claveProfesorado) {
    estado.claveProfesorado = null; estado.listadoProfesorado = []; estado.claseProfesoradoNombre = null;
  }
  if (tipoQueEntra !== 'staff' && estado.pinStaff) {
    estado.pinStaff = null; estado.listadoStaff = [];
  }
  if (tipoQueEntra !== 'admin' && estado.pinAdmin) {
    estado.pinAdmin = null;
  }
  guardarSesion();
}

// ===== Guía de instalación como app (PWA) =====

estado.tabInstalarActiva = 'iphone';

function renderInstalarApp() {
  app.innerHTML = `
    <div class="pantalla">
      <div class="cabecera-simple">
        <button class="btn-volver" onclick="navegar('inicio')">‹</button>
        <h2>Instalar la app</h2>
      </div>
      <div class="contenido">
        <p class="texto-intro-instalar">
          Instalar esta web en tu móvil es gratis, no ocupa apenas espacio y te permite
          abrirla como una app normal, con su icono en la pantalla de inicio.
        </p>
        <div class="tabs-admin" style="margin-bottom:1.5rem">
          <button class="tab-admin ${estado.tabInstalarActiva === 'iphone' ? 'activa' : ''}" onclick="cambiarTabInstalar('iphone')">🍎 iPhone</button>
          <button class="tab-admin ${estado.tabInstalarActiva === 'android' ? 'activa' : ''}" onclick="cambiarTabInstalar('android')">🤖 Android</button>
        </div>
        <div id="contenido-instalar"></div>
      </div>
    </div>
  `;
  renderPasosInstalar();
}

function cambiarTabInstalar(tab) {
  estado.tabInstalarActiva = tab;
  renderInstalarApp();
}

function renderPasosInstalar() {
  const cont = document.getElementById('contenido-instalar');

  const pasosIphone = [
    { icono: '🌐', titulo: 'Abre esta web en Safari', texto: 'Tiene que ser con el navegador Safari (el de la brújula), no con Chrome ni otro.' },
    { icono: '⬆️', titulo: 'Pulsa el botón de Compartir', texto: 'Es el icono de un cuadrado con una flecha hacia arriba, abajo en el centro de la pantalla.' },
    { icono: '➕', titulo: 'Busca "Añadir a pantalla de inicio"', texto: 'Desliza hacia abajo en el menú que aparece hasta encontrar esa opción.' },
    { icono: '✅', titulo: 'Pulsa "Añadir"', texto: 'Arriba a la derecha. Ya tendrás el icono de la bandeja 🍽️ en tu pantalla de inicio, como cualquier otra app.' }
  ];

  const pasosAndroid = [
    { icono: '🌐', titulo: 'Abre esta web en Chrome', texto: 'Con el navegador Chrome (el círculo de colores), que suele venir instalado de fábrica.' },
    { icono: '⋮', titulo: 'Pulsa los tres puntos', texto: 'Arriba a la derecha de la pantalla, donde están las opciones del navegador.' },
    { icono: '📲', titulo: 'Busca "Instalar aplicación" o "Añadir a pantalla de inicio"', texto: 'El texto exacto puede variar un poco según tu modelo de móvil.' },
    { icono: '✅', titulo: 'Confirma pulsando "Instalar"', texto: 'Ya tendrás el icono de la bandeja 🍽️ en tu pantalla de inicio o en el cajón de apps.' }
  ];

  const pasos = estado.tabInstalarActiva === 'iphone' ? pasosIphone : pasosAndroid;

  cont.innerHTML = `
    <div class="lista-pasos-instalar">
      ${pasos.map((p, i) => `
        <div class="paso-instalar">
          <div class="paso-instalar-numero">${i + 1}</div>
          <div class="paso-instalar-icono">${p.icono}</div>
          <div class="paso-instalar-texto">
            <div class="paso-instalar-titulo">${escapeHtml(p.titulo)}</div>
            <div class="paso-instalar-detalle">${escapeHtml(p.texto)}</div>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="aviso-instalar-final">
      💡 Una vez instalada, ábrela siempre desde ese icono nuevo — así no tendrás que escribir
      el PIN cada vez, y cargará más rápido cada mañana.
    </div>
  `;
}
// ===== Arranque =====

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await esperarSupabase();
    cargarSesion();
    await cargarConfigPublica();
    render();
    registrarServiceWorker();
  } catch (e) {
    console.error('Error al arrancar la app:', e);
    mostrarErrorArranque(e.message || 'Error desconocido al iniciar la aplicación.');
  }
});

function esperarSupabase(intentosMax = 40, esperaMs = 300) {
  return new Promise((resolve, reject) => {
    let intentos = 0;
    const comprobar = () => {
      const cliente = obtenerSupabaseClient();
      if (cliente) {
        resolve();
        return;
      }
      intentos++;
      if (intentos >= intentosMax) {
        reject(new Error('No se pudo cargar la librería de conexión (Supabase). Comprueba tu conexión a internet y recarga la página.'));
        return;
      }
      setTimeout(comprobar, esperaMs);
    };
    comprobar();
  });
}

function mostrarErrorArranque(mensaje) {
  app.innerHTML = `
    <div style="padding:3rem 1.5rem;text-align:center;font-family:sans-serif;">
      <div style="font-size:44px;margin-bottom:1rem;">⚠️</div>
      <h2 style="color:#4A3526;margin-bottom:0.5rem;">No se pudo cargar la aplicación</h2>
      <p style="color:#7A6452;font-size:14px;margin-bottom:1.5rem;">${escapeHtml(mensaje)}</p>
      <button onclick="location.reload()" style="background:#E8743B;color:white;border:none;padding:12px 24px;border-radius:12px;font-weight:700;font-size:14px;">Volver a intentar</button>
    </div>
  `;
}

async function cargarConfigPublica() {
  const cliente = obtenerSupabaseClient();
  const { data, error } = await cliente.from('comedor_config').select('clave, valor');
  if (error) throw new Error('No se pudo conectar con la base de datos: ' + error.message);
  if (data) data.forEach(fila => { estado.config[fila.clave] = fila.valor; });
}

function registrarServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ============================================
// LOGIN: FAMILIAS
// ============================================

function renderLoginFamilias() {
  app.innerHTML = `
    <div class="pantalla">
      <div class="cabecera-simple">
        <button class="btn-volver" onclick="navegar('inicio')">‹</button>
        <h2>Familias</h2>
      </div>
      <div class="contenido">
        <div class="login-box familias">
          <div class="login-icono">👨‍👩‍👧</div>
          <h2>Accede con tu PIN</h2>
          <p class="ayuda">Es el código de 6 caracteres que te dio el centro</p>
          <div id="error-familia" class="mensaje-error"></div>
          <input id="input-pin-familia" class="pin-input" maxlength="6" placeholder="••••••" autocomplete="off" autocapitalize="characters">
          <button class="btn-principal verde" onclick="intentarLoginFamilia()">Entrar</button>
        </div>
      </div>
    </div>
  `;
  const input = document.getElementById('input-pin-familia');
  input.focus();
  input.addEventListener('input', () => { input.value = input.value.toUpperCase(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') intentarLoginFamilia(); });
}

async function intentarLoginFamilia() {
  const input = document.getElementById('input-pin-familia');
  const errorBox = document.getElementById('error-familia');
  const pin = input.value.trim().toUpperCase();

  if (pin.length < 4) {
    errorBox.textContent = 'Introduce el PIN completo.';
    errorBox.classList.add('visible');
    return;
  }

  try {
    const resultado = await rpc('comedor_verificar_familia', { p_pin: pin });
    const fila = resultado && resultado[0];
    if (!fila || !fila.valido) {
      errorBox.textContent = 'PIN no válido. Revisa el código que te dio el centro.';
      errorBox.classList.add('visible');
      return;
    }
    estado.pinFamilia = pin;
    estado.nombreFamilia = fila.nombre_familia;
    guardarSesion();
    await cargarPanelFamilias();
  } catch (e) {
    errorBox.textContent = 'No se pudo comprobar el PIN. Inténtalo de nuevo.';
    errorBox.classList.add('visible');
  }
}

async function cargarPanelFamilias() {
  app.innerHTML = `<div class="cargando"><div class="spinner"></div>Cargando tus hijos/as…</div>`;
  try {
    const alumnos = await rpc('comedor_alumnos_familia', { p_pin: estado.pinFamilia });
    estado.alumnos = alumnos || [];

    if (estado.alumnos.length === 0) {
      navegar('panel-familias');
      return;
    }

    // Cargamos asistencia de las dos semanas visibles (actual + siguiente si es domingo)
    const semanas = semanasFamilia();
    const desde = semanas[0].dias[0];
    const hasta = semanas[semanas.length - 1].dias[4];

    const filas = await rpc('comedor_asistencia_familia', {
      p_pin: estado.pinFamilia, p_desde: desde, p_hasta: hasta
    });

    estado.asistenciaSemana = {};
    estado.alumnos.forEach(a => { estado.asistenciaSemana[a.id] = {}; });
    (filas || []).forEach(f => {
      if (!estado.asistenciaSemana[f.alumno_id]) estado.asistenciaSemana[f.alumno_id] = {};
      estado.asistenciaSemana[f.alumno_id][f.fecha] = f.va;
    });

    navegar('panel-familias');
  } catch (e) {
    mostrarToast('No se pudo cargar la información. Comprueba tu conexión.');
    navegar('inicio');
  }
}

// Calcula qué semanas son visibles para la familia.
// A partir del domingo, se muestra también la semana siguiente.
function semanasFamilia() {
  const hoy = hoyISO();
  const [y, m, d] = hoy.split('-').map(Number);
  const diaSemana = new Date(y, m - 1, d).getDay(); // 0=dom, 1=lun...6=sab

  // Lunes de esta semana
  const diasHastaLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
  const lunesEsta = sumarDias(hoy, diasHastaLunes);
  const diasEsta = [0, 1, 2, 3, 4].map(i => sumarDias(lunesEsta, i));

  const semanas = [{ label: 'Esta semana', dias: diasEsta }];

  // El domingo (diaSemana === 0) o sábado (6) se abre la semana siguiente
  if (diaSemana === 0 || diaSemana === 6) {
    const lunesSig = sumarDias(lunesEsta, 7);
    const diasSig = [0, 1, 2, 3, 4].map(i => sumarDias(lunesSig, i));
    semanas.push({ label: 'Semana siguiente', dias: diasSig });
  }

  return semanas;
}

function renderPanelFamilias() {
  const hoy = hoyISO();
  const pasaHora = horaActualPasaLimite(estado.config.hora_limite);
  const semanas = semanasFamilia();

  if (estado.alumnos.length === 0) {
    app.innerHTML = `
      <div class="pantalla">
        <div class="cabecera-simple">
          <button class="btn-volver" onclick="salirDePerfil('familia')">‹</button>
          <h2>${estado.nombreFamilia ? escapeHtml(estado.nombreFamilia) : 'Tu familia'}</h2>
        </div>
        <div class="contenido">
          <div class="vacio-estado">
            <span class="emoji-grande">🧒</span>
            <p>Todavía no hay alumnos/as asociados a este PIN. Contacta con el centro para que los añadan.</p>
          </div>
        </div>
      </div>
    `;
    return;
  }

  app.innerHTML = `
    <div class="pantalla">
      <div class="cabecera-simple">
        <button class="btn-volver" onclick="salirDePerfil('familia')">‹</button>
        <h2>${estado.nombreFamilia ? escapeHtml(estado.nombreFamilia) : 'Tu familia'}</h2>
      </div>
      <div class="contenido">
        <button class="accion-rapida" style="margin-bottom:1rem;border-color:var(--azul);color:var(--azul)" onclick="abrirMenuMensual()">📋 Ver menú del mes</button>
        ${pasaHora ? `
          <div class="aviso-hora-limite">
            ⏰ Ya ha pasado la hora límite (${estado.config.hora_limite}). Si necesitas cambiar algo para hoy, avisa directamente al centro.
          </div>
        ` : ''}
        <div id="bloques-semana-familia"></div>
      </div>
    </div>
  `;

  const cont = document.getElementById('bloques-semana-familia');
  semanas.forEach(semana => {
    const bloque = document.createElement('div');
    bloque.innerHTML = `<div class="etiqueta-semana">${semana.label}</div>`;

    estado.alumnos.forEach(alumno => {
      bloque.appendChild(crearTarjetaAlumnoSemanal(alumno, semana.dias, hoy));
    });

    cont.appendChild(bloque);
  });
}

function crearTarjetaAlumnoSemanal(alumno, dias, hoy) {
  const div = document.createElement('div');
  div.className = 'tarjeta-alumno';

  const pasaHora = horaActualPasaLimite(estado.config.hora_limite);

  const diasHtml = dias.map(fecha => {
    const va = (estado.asistenciaSemana[alumno.id] || {})[fecha];
    const esHoy = fecha === hoy;
    const esPasado = fecha < hoy || (esHoy && pasaHora);
    const [, , d] = fecha.split('-');
    const nombreDia = new Date(fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short' });
    const etiqueta = nombreDia.charAt(0).toUpperCase() + nombreDia.slice(1, 3);

    return `
      <div class="dia-semana-col">
        <div class="dia-semana-nombre ${esHoy ? 'hoy' : ''}">${etiqueta}</div>
        <div class="dia-semana-fecha ${esHoy ? 'hoy' : ''}">${parseInt(d)}</div>
        <button class="dia-toggle si ${va === true ? 'activa' : ''} ${esPasado ? 'pasado' : ''}"
          onclick="marcarAsistencia('${alumno.id}', '${fecha}', true, this)"
          ${esPasado ? 'disabled' : ''}>✓</button>
        <button class="dia-toggle no ${va === false ? 'activa' : ''} ${esPasado ? 'pasado' : ''}"
          onclick="marcarAsistencia('${alumno.id}', '${fecha}', false, this)"
          ${esPasado ? 'disabled' : ''}>✗</button>
      </div>
    `;
  }).join('');

  div.innerHTML = `
    <div class="tarjeta-alumno-cabecera">
      <div class="avatar-alumno">${iniciales(alumno.nombre, alumno.apellidos)}</div>
      <div>
        <div class="tarjeta-alumno-nombre">${escapeHtml(alumno.nombre)} ${escapeHtml(alumno.apellidos)}</div>
        <div class="tarjeta-alumno-clase">${escapeHtml(alumno.clase_nombre)}</div>
      </div>
    </div>
    <div class="dias-semana-grid">${diasHtml}</div>
    <div class="estado-guardado" id="guardado-${alumno.id}">Guardado ✓</div>
    ${alumno.observaciones ? `<div class="observaciones-alumno">⚠️ ${escapeHtml(alumno.observaciones)}</div>` : ''}
  `;
  return div;
}


async function marcarAsistencia(alumnoId, fecha, va, btnEl) {
  // Los botones de día están dentro de .dia-semana-col
  const col = btnEl.closest('.dia-semana-col');
  if (col) {
    col.querySelectorAll('.dia-toggle').forEach(b => b.classList.remove('activa'));
    btnEl.classList.add('activa');
  }

  try {
    await rpc('comedor_marcar_asistencia', { p_pin: estado.pinFamilia, p_alumno_id: alumnoId, p_fecha: fecha, p_va: va });
    if (!estado.asistenciaSemana[alumnoId]) estado.asistenciaSemana[alumnoId] = {};
    estado.asistenciaSemana[alumnoId][fecha] = va;
    const aviso = document.getElementById(`guardado-${alumnoId}`);
    if (aviso) {
      aviso.classList.add('visible');
      setTimeout(() => aviso.classList.remove('visible'), 1800);
    }
  } catch (e) {
    mostrarToast('No se pudo guardar. Comprueba tu conexión e inténtalo de nuevo.');
    if (col) col.querySelectorAll('.dia-toggle').forEach(b => b.classList.remove('activa'));
  }
}

async function marcarTodaLaSemana(va) {
  const hoy = hoyISO();
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const f = sumarDias(hoy, i);
    if (!esFinde(f)) dias.push(f);
  }

  mostrarToast('Guardando toda la semana…', 1500);

  try {
    for (const alumno of estado.alumnos) {
      for (const fecha of dias) {
        await rpc('comedor_marcar_asistencia', { p_pin: estado.pinFamilia, p_alumno_id: alumno.id, p_fecha: fecha, p_va: va });
        if (!estado.asistenciaSemana[alumno.id]) estado.asistenciaSemana[alumno.id] = {};
        estado.asistenciaSemana[alumno.id][fecha] = va;
      }
    }
    mostrarToast('Semana marcada para todos ✓');
    renderPanelFamilias();
  } catch (e) {
    mostrarToast('Hubo un problema guardando algunos días. Revisa la lista.');
    renderPanelFamilias();
  }
}

// ============================================
// LOGIN: PROFESORADO
// ============================================

function renderLoginProfesorado() {
  app.innerHTML = `
    <div class="pantalla">
      <div class="cabecera-simple">
        <button class="btn-volver" onclick="navegar('inicio')">‹</button>
        <h2>Docentes</h2>
      </div>
      <div class="contenido">
        <div class="login-box" style="background:var(--blanco)">
          <div class="login-icono" style="background:#D4E8D4">🍎</div>
          <h2>Acceso de tu clase</h2>
          <p class="ayuda">Introduce la clave de tu grupo</p>
          <div id="error-profesorado" class="mensaje-error"></div>
          <input id="input-clave-profesorado" class="pin-input" placeholder="Ej. 4A" autocomplete="off" autocapitalize="characters">
          <button class="btn-principal verde" onclick="intentarLoginProfesorado()">Entrar</button>
        </div>
      </div>
    </div>
  `;
  const input = document.getElementById('input-clave-profesorado');
  input.focus();
  input.addEventListener('input', () => { input.value = input.value.toUpperCase(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') intentarLoginProfesorado(); });
}

async function intentarLoginProfesorado() {
  const input = document.getElementById('input-clave-profesorado');
  const errorBox = document.getElementById('error-profesorado');
  const clave = input.value.trim().toUpperCase();

  if (!clave) {
    errorBox.textContent = 'Introduce la clave de tu clase.';
    errorBox.classList.add('visible');
    return;
  }

  try {
    const resultado = await rpc('comedor_verificar_profesorado', { p_clave: clave });
    const fila = resultado && resultado[0];
    if (!fila) {
      errorBox.textContent = 'Clave no válida.';
      errorBox.classList.add('visible');
      return;
    }
    estado.claveProfesorado = clave;
    estado.claseProfesoradoNombre = fila.clase_nombre;
    guardarSesion();
    await cargarPanelProfesorado();
  } catch (e) {
    errorBox.textContent = 'No se pudo comprobar la clave. Inténtalo de nuevo.';
    errorBox.classList.add('visible');
  }
}

async function cargarPanelProfesorado(fecha) {
  app.innerHTML = `<div class="cargando"><div class="spinner"></div>Cargando tu clase…</div>`;
  const f = fecha || estado.fechaProfesoradoSeleccionada || hoyISO();
  estado.fechaProfesoradoSeleccionada = f;

  try {
    const listado = await rpc('comedor_listado_profesorado', { p_clave: estado.claveProfesorado, p_fecha: f });
    estado.listadoProfesorado = listado || [];
    navegar('panel-profesorado');
  } catch (e) {
    mostrarToast('No se pudo cargar el listado de tu clase.');
    navegar('inicio');
  }
}

function renderPanelProfesorado() {
  const f = estado.fechaProfesoradoSeleccionada;
  const lista = estado.listadoProfesorado;

  const totalSi = lista.filter(a => a.va === true).length;
  const totalNo = lista.filter(a => a.va === false).length;
  const sinMarcar = lista.filter(a => a.va === null || a.va === undefined).length;

  app.innerHTML = `
    <div class="pantalla">
      <div class="cabecera-simple">
        <button class="btn-volver" onclick="salirDePerfil('profesorado')">‹</button>
        <h2>${estado.claseProfesoradoNombre ? escapeHtml(estado.claseProfesoradoNombre) : 'Tu clase'}</h2>
      </div>
      <div class="contenido">
        <button class="accion-rapida" style="margin-bottom:1.25rem;border-color:var(--azul);color:var(--azul)" onclick="abrirMenuMensual()">📋 Ver menú del mes</button>
        <div class="selector-fecha-staff">
          <button class="btn-icono-pequeno" onclick="cambiarDiaProfesorado(-1)">‹</button>
          <input type="date" id="input-fecha-profesorado" value="${f}" onchange="cambiarFechaProfesorado(this.value)">
          <button class="btn-icono-pequeno" onclick="cambiarDiaProfesorado(1)">›</button>
        </div>

        <div class="resumen-staff">
          <div class="stat-card">
            <div class="stat-numero verde">${totalSi}</div>
            <div class="stat-label">Comen hoy</div>
          </div>
          <div class="stat-card">
            <div class="stat-numero">${sinMarcar}</div>
            <div class="stat-label">Sin marcar</div>
          </div>
        </div>

        ${lista.length === 0 ? `
          <div class="vacio-estado">
            <span class="emoji-grande">🧒</span>
            <p>No hay alumnos registrados todavía en esta clase.</p>
          </div>
        ` : `
          <div class="lista-staff">
            ${lista.map(a => `
              <div class="fila-staff">
                <span class="punto-estado ${a.va === true ? 'si' : a.va === false ? 'no' : 'sin-marcar'}"></span>
                <span>${escapeHtml(a.nombre)} ${escapeHtml(a.apellidos)}</span>
                ${a.observaciones ? `<span class="etiqueta-obs">⚠️ alerta</span>` : ''}
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>
  `;
}

function cambiarDiaProfesorado(delta) {
  const nuevaFecha = sumarDias(estado.fechaProfesoradoSeleccionada, delta);
  cargarPanelProfesorado(nuevaFecha);
}

function cambiarFechaProfesorado(valor) {
  cargarPanelProfesorado(valor);
}

// ============================================
// LOGIN: PERSONAL DE COMEDOR (STAFF)
// ============================================

function renderLoginStaff() {
  app.innerHTML = `
    <div class="pantalla">
      <div class="cabecera-simple">
        <button class="btn-volver" onclick="navegar('inicio')">‹</button>
        <h2>Personal de comedor</h2>
      </div>
      <div class="contenido">
        <div class="login-box comedor">
          <div class="login-icono">👩‍🍳</div>
          <h2>Acceso del comedor</h2>
          <p class="ayuda">Introduce el código facilitado por el centro</p>
          <div id="error-staff" class="mensaje-error"></div>
          <input id="input-pin-staff" class="pin-input" placeholder="••••••••" autocomplete="off">
          <button class="btn-principal" onclick="intentarLoginStaff()">Entrar</button>
        </div>
      </div>
    </div>
  `;
  const input = document.getElementById('input-pin-staff');
  input.focus();
  input.addEventListener('keydown', e => { if (e.key === 'Enter') intentarLoginStaff(); });
}

async function intentarLoginStaff() {
  const input = document.getElementById('input-pin-staff');
  const errorBox = document.getElementById('error-staff');
  const pin = input.value.trim().toUpperCase();

  if (!pin) {
    errorBox.textContent = 'Introduce el código de acceso.';
    errorBox.classList.add('visible');
    return;
  }

  try {
    const valido = await rpc('comedor_verificar_staff', { p_pin: pin });
    if (!valido) {
      errorBox.textContent = 'Código no válido.';
      errorBox.classList.add('visible');
      return;
    }
    estado.pinStaff = pin;
    guardarSesion();
    await cargarPanelStaff();
  } catch (e) {
    errorBox.textContent = 'No se pudo comprobar el código. Inténtalo de nuevo.';
    errorBox.classList.add('visible');
  }
}

async function cargarPanelStaff(fecha) {
  app.innerHTML = `<div class="cargando"><div class="spinner"></div>Cargando el listado…</div>`;
  const f = fecha || estado.fechaStaffSeleccionada || hoyISO();
  estado.fechaStaffSeleccionada = f;

  try {
    const listado = await rpc('comedor_listado_staff', { p_pin: estado.pinStaff, p_fecha: f });
    estado.listadoStaff = listado || [];
    navegar('panel-staff');
  } catch (e) {
    mostrarToast('No se pudo cargar el listado.');
    navegar('inicio');
  }
}

function renderPanelStaff() {
  const f = estado.fechaStaffSeleccionada;
  const lista = estado.listadoStaff;

  const totalSi = lista.filter(a => a.va === true).length;
  const totalNo = lista.filter(a => a.va === false).length;
  const sinMarcar = lista.filter(a => a.va === null || a.va === undefined).length;

  const porClase = {};
  lista.forEach(a => {
    if (!porClase[a.clase_nombre]) porClase[a.clase_nombre] = [];
    porClase[a.clase_nombre].push(a);
  });

  app.innerHTML = `
    <div class="pantalla">
      <div class="cabecera-simple">
        <button class="btn-volver" onclick="salirDePerfil('staff')">‹</button>
        <h2>Listado del comedor</h2>
      </div>
      <div class="contenido">
        <div class="selector-fecha-staff">
          <button class="btn-icono-pequeno" onclick="cambiarDiaStaff(-1)">‹</button>
          <input type="date" id="input-fecha-staff" value="${f}" onchange="cambiarFechaStaff(this.value)">
          <button class="btn-icono-pequeno" onclick="cambiarDiaStaff(1)">›</button>
        </div>

        <div class="resumen-staff">
          <div class="stat-card">
            <div class="stat-numero verde">${totalSi}</div>
            <div class="stat-label">Comen hoy</div>
          </div>
          <div class="stat-card">
            <div class="stat-numero">${sinMarcar}</div>
            <div class="stat-label">Sin marcar</div>
          </div>
        </div>

        ${lista.length === 0 ? `
          <div class="vacio-estado">
            <span class="emoji-grande">📭</span>
            <p>No hay alumnos registrados todavía.</p>
          </div>
        ` : Object.keys(porClase).sort().map(clase => `
          <div class="grupo-clase">
            <div class="grupo-clase-titulo">
              <span>${escapeHtml(clase)}</span>
              <span>${porClase[clase].filter(a => a.va === true).length} comen</span>
            </div>
            <div class="lista-staff">
              ${porClase[clase].map(a => `
                <div class="fila-staff">
                  <span class="punto-estado ${a.va === true ? 'si' : a.va === false ? 'no' : 'sin-marcar'}"></span>
                  <span>${escapeHtml(a.nombre)} ${escapeHtml(a.apellidos)}</span>
                  ${a.observaciones ? `<span class="etiqueta-obs">⚠️ alerta</span>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function cambiarDiaStaff(delta) {
  const nuevaFecha = sumarDias(estado.fechaStaffSeleccionada, delta);
  cargarPanelStaff(nuevaFecha);
}

function cambiarFechaStaff(valor) {
  cargarPanelStaff(valor);
}

// ============================================
// LOGIN: ADMINISTRACIÓN
// ============================================

function renderLoginAdmin() {
  app.innerHTML = `
    <div class="pantalla">
      <div class="cabecera-simple">
        <button class="btn-volver" onclick="navegar('inicio')">‹</button>
        <h2>Administración</h2>
      </div>
      <div class="contenido">
        <div class="login-box admin">
          <div class="login-icono">⚙️</div>
          <h2>Acceso de administración</h2>
          <p class="ayuda">Solo para la gestión del centro</p>
          <div id="error-admin" class="mensaje-error"></div>
          <input id="input-pin-admin" class="pin-input" placeholder="••••••••" autocomplete="off">
          <button class="btn-principal azul" onclick="intentarLoginAdmin()">Entrar</button>
        </div>
      </div>
    </div>
  `;
  const input = document.getElementById('input-pin-admin');
  input.focus();
  input.addEventListener('keydown', e => { if (e.key === 'Enter') intentarLoginAdmin(); });
}

async function intentarLoginAdmin() {
  const input = document.getElementById('input-pin-admin');
  const errorBox = document.getElementById('error-admin');
  const pin = input.value.trim().toUpperCase();

  if (!pin) {
    errorBox.textContent = 'Introduce el PIN de administración.';
    errorBox.classList.add('visible');
    return;
  }

  try {
    const valido = await rpc('comedor_verificar_admin', { p_pin: pin });
    if (!valido) {
      errorBox.textContent = 'PIN no válido.';
      errorBox.classList.add('visible');
      return;
    }
    estado.pinAdmin = pin;
    guardarSesion();
    await cargarPanelAdmin();
  } catch (e) {
    errorBox.textContent = 'No se pudo comprobar el PIN. Inténtalo de nuevo.';
    errorBox.classList.add('visible');
  }
}

async function cargarPanelAdmin() {
  app.innerHTML = `<div class="cargando"><div class="spinner"></div>Cargando panel de administración…</div>`;
  try {
    await Promise.all([cargarClasesAdmin(), cargarFamiliasAdmin(), cargarAlumnosAdmin(), cargarClavesProfesoradoAdmin()]);
    navegar('panel-admin');
  } catch (e) {
    mostrarToast('No se pudo cargar el panel de administración.');
    navegar('inicio');
  }
}

async function cargarClasesAdmin() {
  estado.clasesAdmin = await rpc('comedor_admin_listar_clases', { p_pin: estado.pinAdmin }) || [];
}
async function cargarFamiliasAdmin() {
  estado.familiasAdmin = await rpc('comedor_admin_listar_familias', { p_pin: estado.pinAdmin }) || [];
}
async function cargarAlumnosAdmin() {
  estado.alumnosAdmin = await rpc('comedor_admin_listar_alumnos', { p_pin: estado.pinAdmin }) || [];
}

function renderPanelAdmin() {
  app.innerHTML = `
    <div class="pantalla">
      <div class="cabecera-simple">
        <button class="btn-volver" onclick="salirDePerfil('admin')">‹</button>
        <h2>Administración</h2>
      </div>
      <div class="contenido">
        <div class="tabs-admin">
          <button class="tab-admin ${estado.tabAdminActiva === 'alumnos' ? 'activa' : ''}" onclick="cambiarTabAdmin('alumnos')">Alumnos</button>
          <button class="tab-admin ${estado.tabAdminActiva === 'familias' ? 'activa' : ''}" onclick="cambiarTabAdmin('familias')">Familias</button>
          <button class="tab-admin ${estado.tabAdminActiva === 'clases' ? 'activa' : ''}" onclick="cambiarTabAdmin('clases')">Clases</button>
          <button class="tab-admin ${estado.tabAdminActiva === 'estadisticas' ? 'activa' : ''}" onclick="cambiarTabAdmin('estadisticas')">Estadísticas</button>
          <button class="tab-admin ${estado.tabAdminActiva === 'config' ? 'activa' : ''}" onclick="cambiarTabAdmin('config')">Ajustes</button>
        </div>
        <div id="contenido-tab-admin"></div>
      </div>
    </div>
  `;
  renderTabAdminActiva();
}

function cambiarTabAdmin(tab) {
  estado.tabAdminActiva = tab;
  document.querySelectorAll('.tab-admin').forEach(b => b.classList.remove('activa'));
  renderPanelAdmin();
}

function renderTabAdminActiva() {
  switch (estado.tabAdminActiva) {
    case 'alumnos': return renderTabAlumnos();
    case 'familias': return renderTabFamilias();
    case 'clases': return renderTabClases();
    case 'estadisticas': return renderTabEstadisticas();
    case 'config': return renderTabConfig();
  }
}

// ----- TAB ALUMNOS -----

function renderTabAlumnos() {
  const cont = document.getElementById('contenido-tab-admin');
  const clasesOpciones = estado.clasesAdmin.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
  const familiasOpciones = estado.familiasAdmin.map(f => `<option value="${f.id}">${escapeHtml(f.nombre_apellidos)} (${f.pin})</option>`).join('');

  cont.innerHTML = `
    <div class="tarjeta-admin">
      <div class="form-grupo"><label>Nombre</label><input id="nuevo-alumno-nombre" placeholder="Ej. Lucía"></div>
      <div class="form-grupo"><label>Apellidos</label><input id="nuevo-alumno-apellidos" placeholder="Ej. García Pérez"></div>
      <div class="grid-2">
        <div class="form-grupo"><label>Clase</label><select id="nuevo-alumno-clase">${clasesOpciones || '<option value="">Crea una clase primero</option>'}</select></div>
        <div class="form-grupo"><label>Familia</label><select id="nuevo-alumno-familia">${familiasOpciones || '<option value="">Crea una familia primero</option>'}</select></div>
      </div>
      <div class="form-grupo"><label>Observaciones (alergias, notas para cocina)</label><textarea id="nuevo-alumno-obs" rows="2" placeholder="Opcional"></textarea></div>
      <button class="btn-principal azul" onclick="crearAlumno()">+ Añadir alumno/a</button>
    </div>

    <div class="tarjeta-admin">
      <div class="form-grupo" style="margin-bottom:6px"><label>Importar alumnado desde Excel</label></div>
      <p style="font-size:12.5px;color:var(--marron-suave);font-weight:500;margin:0 0 10px">
        Sube la plantilla rellena (pestaña "Alumnos"). Las clases deben existir ya en la pestaña Clases de esta app.
      </p>
      <input type="file" id="excel-alumnos-input" accept=".xlsx,.xls" style="display:none" onchange="manejarArchivoExcel(this)">
      <button class="btn-secundario" onclick="document.getElementById('excel-alumnos-input').click()">📂 Seleccionar archivo Excel</button>
      <div id="resultado-importacion-excel"></div>
    </div>

    <div class="tarjeta-admin">
      <div class="form-grupo" style="margin-bottom:10px"><label>Descargar listado completo (con PIN actualizado)</label></div>
      <div class="grid-3-botones">
        <button class="btn-mini azul" style="padding:12px 6px;font-size:12.5px" onclick="exportarAlumnosExcel()">📊 Excel</button>
        <button class="btn-mini azul" style="padding:12px 6px;font-size:12.5px" onclick="exportarAlumnosWord()">📄 Word</button>
        <button class="btn-mini azul" style="padding:12px 6px;font-size:12.5px" onclick="exportarAlumnosPDF()">🖨️ PDF</button>
      </div>
    </div>

    <div class="tarjeta-admin">
      <div class="form-grupo" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <label style="margin-bottom:0">Alumnos (${estado.alumnosAdmin.length})</label>
        <div style="display:flex;gap:6px">
          <button class="btn-mini azul" onclick="toggleModoSeleccion('unificar')">${estado.modoSeleccion === 'unificar' ? 'Cancelar' : '🔗 Unificar'}</button>
          <button class="btn-mini rojo" onclick="toggleModoSeleccion('eliminar')">${estado.modoSeleccion === 'eliminar' ? 'Cancelar' : '🗑️ Eliminar varios'}</button>
        </div>
      </div>
      <input id="buscador-alumnos" placeholder="🔎 Buscar por nombre o apellidos..." style="width:100%;padding:10px 14px;border:2px solid var(--crema-oscuro);border-radius:var(--radio-sm);font-size:14px;margin-bottom:12px;background:var(--crema);color:var(--marron)" oninput="filtrarListaAlumnos(this.value)">
      ${estado.modoSeleccion === 'unificar' ? `
        <p style="font-size:12.5px;color:var(--marron-suave);font-weight:600;margin:0 0 12px">
          Marca 2 o más alumnos que sean hermanos y pulsa "Unificar seleccionados".
        </p>
      ` : ''}
      ${estado.modoSeleccion === 'eliminar' ? `
        <p style="font-size:12.5px;color:var(--marron-suave);font-weight:600;margin:0 0 12px">
          Marca los alumnos que quieras eliminar y pulsa "Eliminar seleccionados". Esta acción no se puede deshacer.
        </p>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <button class="btn-mini" onclick="marcarTodosVisibles(true)">Marcar todos</button>
          <button class="btn-mini" onclick="marcarTodosVisibles(false)">Desmarcar todos</button>
        </div>
      ` : ''}
      ${estado.alumnosAdmin.length === 0 ? `
        <div class="vacio-estado"><span class="emoji-grande">🧒</span><p>Todavía no hay alumnos dados de alta.</p></div>
      ` : `<div id="lista-alumnos-admin">${renderFilasAlumnosAdmin(estado.alumnosAdmin)}</div>`}
      ${estado.modoSeleccion === 'unificar' && estado.alumnosAdmin.length > 0 ? `
        <button class="btn-principal azul" style="margin-top:12px" onclick="confirmarUnificarHermanos()">Unificar seleccionados</button>
      ` : ''}
      ${estado.modoSeleccion === 'eliminar' && estado.alumnosAdmin.length > 0 ? `
        <button class="btn-principal" style="margin-top:12px;background:var(--rojo);box-shadow:0 4px 0 var(--rojo-oscuro)" onclick="confirmarEliminarVarios()">Eliminar seleccionados</button>
      ` : ''}
    </div>
  `;
}

function renderFilasAlumnosAdmin(lista) {
  return lista.map(a => `
    <div class="fila-lista-admin" data-nombre-busqueda="${escapeHtml((a.nombre + ' ' + a.apellidos).toLowerCase())}">
      ${estado.modoSeleccion ? `<input type="checkbox" class="check-seleccion" data-id="${a.id}" data-familia="${a.familia_id}" style="width:20px;height:20px;margin-right:4px">` : ''}
      <div class="fila-lista-admin-info">
        <div class="fila-lista-admin-nombre">${escapeHtml(a.nombre)} ${escapeHtml(a.apellidos)}</div>
        <div class="fila-lista-admin-detalle">${escapeHtml(a.clase_nombre)} · ${escapeHtml(a.familia_nombre)} (${a.familia_pin})</div>
      </div>
      ${!estado.modoSeleccion ? `<button class="btn-mini rojo" onclick="eliminarAlumno('${a.id}', '${escapeHtml(a.nombre)}')">Eliminar</button>` : ''}
    </div>
  `).join('');
}

function filtrarListaAlumnos(texto) {
  const t = texto.trim().toLowerCase();
  document.querySelectorAll('#lista-alumnos-admin [data-nombre-busqueda]').forEach(el => {
    el.style.display = el.dataset.nombreBusqueda.includes(t) ? '' : 'none';
  });
}

function marcarTodosVisibles(marcar) {
  document.querySelectorAll('#lista-alumnos-admin [data-nombre-busqueda]').forEach(el => {
    if (el.style.display !== 'none') {
      const check = el.querySelector('.check-seleccion');
      if (check) check.checked = marcar;
    }
  });
}

async function crearAlumno() {
  const nombre = document.getElementById('nuevo-alumno-nombre').value.trim();
  const apellidos = document.getElementById('nuevo-alumno-apellidos').value.trim();
  const claseId = document.getElementById('nuevo-alumno-clase').value;
  const familiaId = document.getElementById('nuevo-alumno-familia').value;
  const obs = document.getElementById('nuevo-alumno-obs').value.trim();

  if (!nombre || !apellidos || !claseId || !familiaId) {
    mostrarToast('Rellena nombre, apellidos, clase y familia.');
    return;
  }

  try {
    await rpc('comedor_admin_crear_alumno', {
      p_pin: estado.pinAdmin, p_nombre: nombre, p_apellidos: apellidos,
      p_clase_id: claseId, p_familia_id: familiaId, p_observaciones: obs || null
    });
    mostrarToast(`${nombre} añadido/a ✓`);
    await cargarAlumnosAdmin();
    renderTabAlumnos();
  } catch (e) {
    mostrarToast('No se pudo crear el alumno/a.');
  }
}

async function eliminarAlumno(id, nombre) {
  if (!confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return;
  try {
    await rpc('comedor_admin_eliminar_alumno', { p_pin: estado.pinAdmin, p_id: id });
    mostrarToast('Alumno/a eliminado/a.');
    await cargarAlumnosAdmin();
    renderTabAlumnos();
  } catch (e) {
    mostrarToast('No se pudo eliminar.');
  }
}

function manejarArchivoExcel(inputEl) {
  const archivo = inputEl.files[0];
  if (!archivo) return;

  const resultadoCont = document.getElementById('resultado-importacion-excel');
  resultadoCont.innerHTML = `<div class="cargando"><div class="spinner"></div>Leyendo archivo…</div>`;

  const lector = new FileReader();
  lector.onload = async (e) => {
    try {
      const datos = new Uint8Array(e.target.result);
      const libro = XLSX.read(datos, { type: 'array' });

      if (!libro.SheetNames.includes('Alumnos')) {
        resultadoCont.innerHTML = `<div class="mensaje-error visible">El archivo no tiene una pestaña llamada "Alumnos". Usa la plantilla oficial.</div>`;
        return;
      }

      const hoja = libro.Sheets['Alumnos'];
      const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });

      const alumnos = filas
        .map(f => ({
          nombre: String(f['Nombre'] || '').trim(),
          apellidos: String(f['Apellidos'] || '').trim(),
          clase: String(f['Clase'] || '').trim(),
          hermano_de: String(f['Hermano/a de (nombre y apellidos, opcional)'] || '').trim() || null,
          observaciones: String(f['Observaciones (alergias, notas)'] || '').trim()
        }))
        .filter(a => a.nombre && a.apellidos);

      if (alumnos.length === 0) {
        resultadoCont.innerHTML = `<div class="mensaje-error visible">No se encontraron filas válidas. Revisa que la plantilla tenga las columnas correctas.</div>`;
        return;
      }

      resultadoCont.innerHTML = `<div class="cargando"><div class="spinner"></div>Importando ${alumnos.length} alumnos…</div>`;

      const resultado = await rpc('comedor_admin_importar_alumnos_v3', { p_pin: estado.pinAdmin, p_alumnos: alumnos });
      mostrarResultadoImportacion(resultado || []);
      await Promise.all([cargarAlumnosAdmin(), cargarFamiliasAdmin()]);
      renderTabAlumnos();
    } catch (err) {
      resultadoCont.innerHTML = `<div class="mensaje-error visible">No se pudo leer el archivo. Comprueba que sea un Excel válido (.xlsx).</div>`;
    }
  };
  lector.readAsArrayBuffer(archivo);
  inputEl.value = '';
}

function mostrarResultadoImportacion(resultado) {
  const cont = document.getElementById('resultado-importacion-excel');

  const filaAvisos = resultado.find(r => !r.grupo && r.nombres);
  const gruposCreados = resultado.filter(r => r.grupo !== null && r.grupo !== undefined);
  const totalAlumnos = gruposCreados.reduce((s, r) => s + (r.alumnos_creados || 0), 0);

  if (totalAlumnos === 0) {
    cont.innerHTML = `
      <div class="mensaje-error visible" style="margin-top:10px;line-height:1.5">
        ⚠️ No se ha importado ningún alumno. Revisa el Excel:<br><br>
        ${filaAvisos ? escapeHtml(filaAvisos.nombres) : 'Comprueba que las columnas Nombre y Apellidos tengan datos.'}
      </div>
    `;
    return;
  }

  const pinsTexto = gruposCreados
    .map(r => `${r.nombres} → PIN: ${r.pin_generado}`)
    .join('\n');

  cont.innerHTML = `
    <div class="pin-generado visible" style="white-space:pre-line;text-align:left;letter-spacing:normal;font-size:13px;line-height:1.6;max-height:280px;overflow-y:auto">
      ✅ ${totalAlumnos} alumnos importados correctamente.\n\n${pinsTexto}
    </div>
    ${filaAvisos ? `<div class="mensaje-error visible" style="margin-top:10px;line-height:1.5">⚠️ Avisos:<br>${escapeHtml(filaAvisos.nombres)}</div>` : ''}
    <button class="btn-secundario" style="margin-top:10px" onclick='descargarListadoPins(${JSON.stringify(gruposCreados)})'>⬇️ Descargar listado de PINs</button>
  `;
}

function descargarListadoPins(resultado) {
  const lineas = ['Alumnos,PIN'];
  resultado.filter(r => r.grupo !== null).forEach(r => {
    lineas.push(`"${r.nombres}",${r.pin_generado}`);
  });
  const blob = new Blob([lineas.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pins_familias_comedor.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ----- Exportar listado completo: Excel / Word / PDF -----

function datosListadoOrdenado() {
  return [...estado.alumnosAdmin].sort((a, b) => {
    const clase = (a.clase_nombre || '').localeCompare(b.clase_nombre || '', 'es');
    if (clase !== 0) return clase;
    return (a.nombre || '').localeCompare(b.nombre || '', 'es');
  });
}

async function generarExcelMensual() {
  const mesInput = document.getElementById('mes-excel');
  const precioInput = document.getElementById('precio-dia-excel');

  if (!mesInput || !mesInput.value) { mostrarToast('Selecciona un mes.'); return; }

  const mes = mesInput.value; // YYYY-MM
  const precio = parseFloat(precioInput ? precioInput.value : (estado.config.precio_dia || '5')) || 5;
  const [anyo, numMes] = mes.split('-').map(Number);

  // Primer y último día del mes
  const desde = `${mes}-01`;
  const ultimoDia = new Date(anyo, numMes, 0).getDate();
  const hasta = `${mes}-${String(ultimoDia).padStart(2, '0')}`;

  // Días laborables (lunes-viernes) del mes
  const diasLaborables = [];
  for (let d = 1; d <= ultimoDia; d++) {
    const fecha = `${mes}-${String(d).padStart(2, '0')}`;
    const diaSemana = new Date(anyo, numMes - 1, d).getDay();
    if (diaSemana !== 0 && diaSemana !== 6) diasLaborables.push(fecha);
  }

  mostrarToast('Generando Excel…', 2000);

  try {
    // Obtenemos estadísticas del mes completo
    const datos = await rpc('comedor_admin_estadisticas', {
      p_pin: estado.pinAdmin, p_desde: desde, p_hasta: hasta
    });

    // Obtenemos el detalle de asistencia día a día
    const { data: asistencias } = await obtenerSupabaseClient()
      .from('comedor_asistencia')
      .select('alumno_id, fecha, va')
      .gte('fecha', desde)
      .lte('fecha', hasta);

    // Indexar asistencias por alumno y fecha
    const mapaAsistencia = {};
    (asistencias || []).forEach(r => {
      if (!mapaAsistencia[r.alumno_id]) mapaAsistencia[r.alumno_id] = {};
      mapaAsistencia[r.alumno_id][r.fecha] = r.va;
    });

    // Agrupar alumnos por clase
    const porClase = {};
    (datos || []).forEach(a => {
      if (!porClase[a.clase_nombre]) porClase[a.clase_nombre] = [];
      porClase[a.clase_nombre].push(a);
    });

    const libro = XLSX.utils.book_new();
    const nombreMes = new Date(anyo, numMes - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

    Object.keys(porClase).sort().forEach(clase => {
      const alumnos = porClase[clase];

      // Cabecera: Nombre | Apellidos | Lun 1 | Mar 2 | ... | Total días | Total €
      const cabecera = ['Nombre', 'Apellidos'];
      diasLaborables.forEach(f => {
        const [,, d] = f.split('-');
        const dia = new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short' });
        cabecera.push(`${dia.charAt(0).toUpperCase() + dia.slice(1, 3)} ${parseInt(d)}`);
      });
      cabecera.push('Total días', `Total (${precio}€/día)`);

      const filas = [cabecera];
      alumnos.forEach(a => {
        const fila = [a.nombre, a.apellidos];
        let totalDias = 0;
        diasLaborables.forEach(f => {
          const va = mapaAsistencia[a.alumno_id]?.[f];
          fila.push(va === true ? '✓' : va === false ? '✗' : '-');
          if (va === true) totalDias++;
        });
        fila.push(totalDias, (totalDias * precio).toFixed(2) + ' €');
        filas.push(fila);
      });

      // Fila de totales
      const totales = ['', 'TOTAL'];
      diasLaborables.forEach(f => {
        const count = alumnos.filter(a => mapaAsistencia[a.alumno_id]?.[f] === true).length;
        totales.push(count > 0 ? count : '');
      });
      const totalDiasCentro = alumnos.reduce((s, a) => s + (Number(mapaAsistencia[a.alumno_id] ? Object.values(mapaAsistencia[a.alumno_id]).filter(v => v === true).length : 0)), 0);
      totales.push(totalDiasCentro, (totalDiasCentro * precio).toFixed(2) + ' €');
      filas.push(totales);

      const hoja = XLSX.utils.aoa_to_sheet(filas);

      // Ancho de columnas
      hoja['!cols'] = [{ wch: 16 }, { wch: 22 }, ...diasLaborables.map(() => ({ wch: 6 })), { wch: 10 }, { wch: 12 }];

      // Nombre de la pestaña (máx 31 chars, sin caracteres especiales)
      const nombreHoja = clase.replace(/[\\\/\*\?\[\]:]/g, '').slice(0, 31);
      XLSX.utils.book_append_sheet(libro, hoja, nombreHoja);
    });

    XLSX.writeFile(libro, `comedor_${mes}_${estado?.config?.nombre_centro || 'CEIP_Juan_XXIII'}.xlsx`);
  } catch (e) {
    mostrarToast('No se pudo generar el Excel. ' + (e.message || ''));
  }
}

function exportarAlumnosExcel() {
  if (estado.alumnosAdmin.length === 0) { mostrarToast('No hay alumnos todavía.'); return; }

  const datos = datosListadoOrdenado().map(a => ({
    'Clase': a.clase_nombre,
    'Nombre': a.nombre,
    'Apellidos': a.apellidos,
    'Familia': a.familia_nombre,
    'PIN': a.familia_pin,
    'Observaciones': a.observaciones || ''
  }));

  const hoja = XLSX.utils.json_to_sheet(datos);
  hoja['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 24 }, { wch: 24 }, { wch: 10 }, { wch: 30 }];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Alumnos');
  XLSX.writeFile(libro, `listado_alumnos_comedor_${hoyISO()}.xlsx`);
}

function exportarAlumnosPDF() {
  if (estado.alumnosAdmin.length === 0) { mostrarToast('No hay alumnos todavía.'); return; }
  if (typeof window.jspdf === 'undefined') { mostrarToast('No se pudo generar el PDF. Recarga la página e inténtalo de nuevo.'); return; }

  const datos = datosListadoOrdenado();
  const doc = new window.jspdf.jsPDF();

  doc.setFontSize(15);
  doc.text('Comedor CEIP Juan XXIII - Listado de alumnado', 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(120, 110, 95);
  doc.text(`Generado el ${formatearFechaLarga(hoyISO())} · ${datos.length} alumnos`, 14, 22);

  doc.autoTable({
    startY: 28,
    head: [['Clase', 'Nombre', 'Apellidos', 'Familia', 'PIN', 'Observaciones']],
    body: datos.map(a => [a.clase_nombre, a.nombre, a.apellidos, a.familia_nombre, a.familia_pin, a.observaciones || '']),
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [232, 116, 59], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [253, 246, 236] }
  });

  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `listado_alumnos_comedor_${hoyISO()}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportarAlumnosWord() {
  if (estado.alumnosAdmin.length === 0) { mostrarToast('No hay alumnos todavía.'); return; }

  const datos = datosListadoOrdenado();
  const filasHtml = datos.map(a => `
    <tr>
      <td>${escapeHtml(a.clase_nombre)}</td>
      <td>${escapeHtml(a.nombre)}</td>
      <td>${escapeHtml(a.apellidos)}</td>
      <td>${escapeHtml(a.familia_nombre)}</td>
      <td style="font-weight:bold">${escapeHtml(a.familia_pin)}</td>
      <td>${escapeHtml(a.observaciones || '')}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"><title>Listado de alumnado</title></head>
    <body style="font-family:Arial,sans-serif">
      <h2 style="color:#E8743B">Comedor CEIP Juan XXIII — Listado de alumnado</h2>
      <p style="color:#7A6452;font-size:13px">Generado el ${formatearFechaLarga(hoyISO())} · ${datos.length} alumnos</p>
      <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:13px">
        <thead style="background:#E8743B;color:white">
          <tr><th>Clase</th><th>Nombre</th><th>Apellidos</th><th>Familia</th><th>PIN</th><th>Observaciones</th></tr>
        </thead>
        <tbody>${filasHtml}</tbody>
      </table>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `listado_alumnos_comedor_${hoyISO()}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

// ----- Selección múltiple: unificar hermanos / eliminar varios -----

function toggleModoSeleccion(modo) {
  estado.modoSeleccion = estado.modoSeleccion === modo ? null : modo;
  renderTabAlumnos();
}

async function confirmarUnificarHermanos() {
  const checks = document.querySelectorAll('.check-seleccion:checked');
  if (checks.length < 2) {
    mostrarToast('Selecciona al menos 2 alumnos para unificar.');
    return;
  }

  const ids = [...checks].map(c => c.dataset.id);
  const familiasDistintas = new Set([...checks].map(c => c.dataset.familia));
  const familiaDestino = familiasDistintas.size === 1 ? null : [...checks][0].dataset.familia;

  const nombresSeleccionados = estado.alumnosAdmin
    .filter(a => ids.includes(a.id))
    .map(a => `${a.nombre} ${a.apellidos}`)
    .join(', ');

  if (!confirm(`¿Unificar a estos alumnos en la misma familia?\n\n${nombresSeleccionados}\n\nTodos quedarán con el mismo PIN de acceso.`)) return;

  try {
    const resultado = await rpc('comedor_admin_unificar_hermanos', {
      p_pin: estado.pinAdmin,
      p_alumno_ids: ids,
      p_familia_destino_id: familiaDestino,
      p_nombre_nueva_familia: null
    });
    const fila = resultado && resultado[0];
    mostrarToast(`Unificados correctamente · PIN: ${fila.pin}`, 4000);
    estado.modoSeleccion = null;
    await Promise.all([cargarAlumnosAdmin(), cargarFamiliasAdmin()]);
    renderTabAlumnos();
  } catch (e) {
    mostrarToast('No se pudo unificar. ' + (e.message || ''));
  }
}

async function confirmarEliminarVarios() {
  const checks = document.querySelectorAll('.check-seleccion:checked');
  if (checks.length === 0) {
    mostrarToast('Selecciona al menos 1 alumno para eliminar.');
    return;
  }

  const ids = [...checks].map(c => c.dataset.id);
  const nombresSeleccionados = estado.alumnosAdmin
    .filter(a => ids.includes(a.id))
    .map(a => `${a.nombre} ${a.apellidos}`)
    .join(', ');

  if (!confirm(`¿Eliminar a estos ${ids.length} alumnos? Esta acción no se puede deshacer.\n\n${nombresSeleccionados}`)) return;

  try {
    const eliminados = await rpc('comedor_admin_eliminar_alumnos_masivo', { p_pin: estado.pinAdmin, p_alumno_ids: ids });
    mostrarToast(`${eliminados} alumno(s) eliminado(s) ✓`, 3000);
    estado.modoSeleccion = null;
    await Promise.all([cargarAlumnosAdmin(), cargarFamiliasAdmin()]);
    renderTabAlumnos();
  } catch (e) {
    mostrarToast('No se pudo eliminar. ' + (e.message || ''));
  }
}

// ----- TAB FAMILIAS -----

function renderTabFamilias() {
  const cont = document.getElementById('contenido-tab-admin');
  cont.innerHTML = `
    <div class="tarjeta-admin">
      <div class="form-grupo"><label>Nombre del tutor/a principal</label><input id="nueva-familia-nombre" placeholder="Ej. María López"></div>
      <div class="form-grupo"><label>Teléfono de contacto (opcional)</label><input id="nueva-familia-telefono" placeholder="600 000 000"></div>
      <button class="btn-principal azul" onclick="crearFamilia()">+ Crear familia y generar PIN</button>
      <div id="pin-recien-generado" class="pin-generado"></div>
    </div>

    <div class="tarjeta-admin">
      <div class="form-grupo" style="margin-bottom:8px"><label>Familias (${estado.familiasAdmin.length})</label></div>
      ${estado.familiasAdmin.length === 0 ? `
        <div class="vacio-estado"><span class="emoji-grande">👨‍👩‍👧</span><p>Todavía no hay familias dadas de alta.</p></div>
      ` : estado.familiasAdmin.map(f => `
        <div class="fila-lista-admin">
          <div class="fila-lista-admin-info">
            <div class="fila-lista-admin-nombre">${escapeHtml(f.nombre_apellidos)}</div>
            <div class="fila-lista-admin-detalle">PIN: ${f.pin}${f.telefono_contacto ? ' · ' + escapeHtml(f.telefono_contacto) : ''}</div>
          </div>
          <button class="btn-mini azul" onclick="regenerarPin('${f.id}', '${escapeHtml(f.nombre_apellidos)}')">Nuevo PIN</button>
          <button class="btn-mini rojo" onclick="eliminarFamilia('${f.id}', '${escapeHtml(f.nombre_apellidos)}')">Eliminar</button>
        </div>
      `).join('')}
    </div>
  `;
}

async function crearFamilia() {
  const nombre = document.getElementById('nueva-familia-nombre').value.trim();
  const telefono = document.getElementById('nueva-familia-telefono').value.trim();

  if (!nombre) { mostrarToast('Indica el nombre del tutor/a.'); return; }

  try {
    const resultado = await rpc('comedor_admin_crear_familia', { p_pin: estado.pinAdmin, p_nombre: nombre, p_telefono: telefono || null });
    const fila = resultado && resultado[0];
    const cajaPin = document.getElementById('pin-recien-generado');
    cajaPin.textContent = `PIN generado: ${fila.pin_generado}`;
    cajaPin.classList.add('visible');
    document.getElementById('nueva-familia-nombre').value = '';
    document.getElementById('nueva-familia-telefono').value = '';
    await cargarFamiliasAdmin();
    setTimeout(() => renderTabFamilias(), 50);
  } catch (e) {
    mostrarToast('No se pudo crear la familia.');
  }
}

async function regenerarPin(id, nombre) {
  if (!confirm(`¿Generar un nuevo PIN para ${nombre}? El PIN anterior dejará de funcionar.`)) return;
  try {
    const nuevoPin = await rpc('comedor_admin_regenerar_pin_familia', { p_pin: estado.pinAdmin, p_familia_id: id });
    mostrarToast(`Nuevo PIN de ${nombre}: ${nuevoPin}`, 4000);
    await cargarFamiliasAdmin();
    renderTabFamilias();
  } catch (e) {
    mostrarToast('No se pudo regenerar el PIN.');
  }
}

async function eliminarFamilia(id, nombre) {
  if (!confirm(`¿Eliminar a la familia ${nombre}? Esto también elimina a sus hijos/as del sistema.`)) return;
  try {
    await rpc('comedor_admin_eliminar_familia', { p_pin: estado.pinAdmin, p_id: id });
    mostrarToast('Familia eliminada.');
    await Promise.all([cargarFamiliasAdmin(), cargarAlumnosAdmin()]);
    renderTabFamilias();
  } catch (e) {
    mostrarToast('No se pudo eliminar la familia.');
  }
}

// ----- TAB CLASES -----

function renderTabClases() {
  const cont = document.getElementById('contenido-tab-admin');
  const clasesOpcionesClave = estado.clasesAdmin.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');

  cont.innerHTML = `
    <div class="tarjeta-admin">
      <div class="grid-2">
        <div class="form-grupo"><label>Nombre de la clase</label><input id="nueva-clase-nombre" placeholder="Ej. 3º A"></div>
        <div class="form-grupo"><label>Curso</label><input id="nueva-clase-curso" placeholder="Ej. 3"></div>
      </div>
      <button class="btn-principal azul" onclick="crearClase()">+ Crear clase</button>
    </div>

    <div class="tarjeta-admin">
      <div class="form-grupo" style="margin-bottom:8px"><label>Clases (${estado.clasesAdmin.length})</label></div>
      ${estado.clasesAdmin.length === 0 ? `
        <div class="vacio-estado"><span class="emoji-grande">🏫</span><p>Todavía no hay clases creadas.</p></div>
      ` : estado.clasesAdmin.map(c => `
        <div class="fila-lista-admin">
          <div class="fila-lista-admin-info">
            <div class="fila-lista-admin-nombre">${escapeHtml(c.nombre)}</div>
            <div class="fila-lista-admin-detalle">Curso ${escapeHtml(c.curso)}</div>
          </div>
          <button class="btn-mini rojo" onclick="eliminarClase('${c.id}', '${escapeHtml(c.nombre)}')">Eliminar</button>
        </div>
      `).join('')}
    </div>

    <div class="tarjeta-admin">
      <div class="form-grupo" style="margin-bottom:6px"><label>Claves de acceso para los docentes</label></div>
      <p style="font-size:12.5px;color:var(--marron-suave);font-weight:500;margin:0 0 10px">
        Cada clase puede tener una clave propia para que su tutor/a vea solo el listado de su grupo.
      </p>
      <div class="grid-2">
        <div class="form-grupo"><label>Clase</label><select id="nueva-clave-clase">${clasesOpcionesClave || '<option value="">Crea una clase primero</option>'}</select></div>
        <div class="form-grupo"><label>Clave</label><input id="nueva-clave-texto" placeholder="Ej. 4A" autocapitalize="characters"></div>
      </div>
      <button class="btn-principal azul" onclick="crearClaveProfesorado()">+ Crear clave</button>
    </div>

    <div class="tarjeta-admin">
      <div class="form-grupo" style="margin-bottom:8px"><label>Claves existentes (${estado.clavesProfesoradoAdmin.length})</label></div>
      ${estado.clavesProfesoradoAdmin.length === 0 ? `
        <div class="vacio-estado"><span class="emoji-grande">🔑</span><p>Todavía no hay claves de docentes creadas.</p></div>
      ` : estado.clavesProfesoradoAdmin.map(cp => `
        <div class="fila-lista-admin">
          <div class="fila-lista-admin-info">
            <div class="fila-lista-admin-nombre">${escapeHtml(cp.clase_nombre)}</div>
            <div class="fila-lista-admin-detalle">Clave: ${escapeHtml(cp.clave)}</div>
          </div>
          <button class="btn-mini rojo" onclick="eliminarClaveProfesorado('${cp.id}', '${escapeHtml(cp.clase_nombre)}')">Eliminar</button>
        </div>
      `).join('')}
    </div>
  `;
}

async function crearClaveProfesorado() {
  const claseId = document.getElementById('nueva-clave-clase').value;
  const clave = document.getElementById('nueva-clave-texto').value.trim();

  if (!claseId || !clave) { mostrarToast('Elige una clase y escribe una clave.'); return; }

  try {
    await rpc('comedor_admin_crear_clave_profesorado', { p_pin: estado.pinAdmin, p_clase_id: claseId, p_clave: clave });
    mostrarToast(`Clave ${clave.toUpperCase()} creada ✓`);
    await cargarClavesProfesoradoAdmin();
    renderTabClases();
  } catch (e) {
    mostrarToast('No se pudo crear la clave. ¿Ya existe esa clave?');
  }
}

async function eliminarClaveProfesorado(id, claseNombre) {
  if (!confirm(`¿Eliminar la clave de acceso de ${claseNombre}?`)) return;
  try {
    await rpc('comedor_admin_eliminar_clave_profesorado', { p_pin: estado.pinAdmin, p_id: id });
    mostrarToast('Clave eliminada.');
    await cargarClavesProfesoradoAdmin();
    renderTabClases();
  } catch (e) {
    mostrarToast('No se pudo eliminar la clave.');
  }
}

async function cargarClavesProfesoradoAdmin() {
  estado.clavesProfesoradoAdmin = await rpc('comedor_admin_listar_claves_profesorado', { p_pin: estado.pinAdmin }) || [];
}

async function crearClase() {
  const nombre = document.getElementById('nueva-clase-nombre').value.trim();
  const curso = document.getElementById('nueva-clase-curso').value.trim();
  if (!nombre || !curso) { mostrarToast('Indica nombre y curso.'); return; }

  try {
    const orden = estado.clasesAdmin.length + 1;
    await rpc('comedor_admin_crear_clase', { p_pin: estado.pinAdmin, p_nombre: nombre, p_curso: curso, p_orden: orden });
    mostrarToast(`Clase ${nombre} creada ✓`);
    await cargarClasesAdmin();
    renderTabClases();
  } catch (e) {
    mostrarToast('No se pudo crear la clase. ¿Ya existe ese nombre?');
  }
}

async function eliminarClase(id, nombre) {
  if (!confirm(`¿Eliminar la clase ${nombre}? Solo se puede si no tiene alumnos asignados.`)) return;
  try {
    await rpc('comedor_admin_eliminar_clase', { p_pin: estado.pinAdmin, p_id: id });
    mostrarToast('Clase eliminada.');
    await cargarClasesAdmin();
    renderTabClases();
  } catch (e) {
    mostrarToast('No se pudo eliminar: revisa que no tenga alumnos asignados.');
  }
}

// ----- TAB ESTADÍSTICAS -----

function renderTabEstadisticas() {
  const cont = document.getElementById('contenido-tab-admin');
  const hoy = hoyISO();
  const hace30 = sumarDias(hoy, -30);
  const mesActual = hoy.slice(0, 7); // YYYY-MM

  cont.innerHTML = `
    <div class="tarjeta-admin">
      <div class="form-grupo" style="margin-bottom:6px"><label>📊 Resumen mensual de asistencia (Excel por clase)</label></div>
      <p style="font-size:12.5px;color:var(--marron-suave);font-weight:500;margin:0 0 10px">
        Genera un Excel con una pestaña por clase: días asistidos, no asistidos y total a pagar (${estado.config.precio_dia || '5.00'}€/día).
      </p>
      <div class="grid-2">
        <div class="form-grupo"><label>Mes</label><input type="month" id="mes-excel" value="${mesActual}"></div>
        <div class="form-grupo"><label>Precio/día (€)</label><input type="number" id="precio-dia-excel" value="${estado.config.precio_dia || '5.00'}" step="0.01" min="0"></div>
      </div>
      <button class="btn-principal verde" onclick="generarExcelMensual()">⬇️ Descargar Excel mensual</button>
    </div>

    <div class="tarjeta-admin">
      <div class="grid-2">
        <div class="form-grupo"><label>Desde</label><input type="date" id="stats-desde" value="${hace30}"></div>
        <div class="form-grupo"><label>Hasta</label><input type="date" id="stats-hasta" value="${hoy}"></div>
      </div>
      <button class="btn-principal azul" onclick="cargarEstadisticas()">Calcular</button>
    </div>
    <div id="resultado-stats"></div>
  `;
}

async function cargarEstadisticas() {
  const desde = document.getElementById('stats-desde').value;
  const hasta = document.getElementById('stats-hasta').value;
  const cont = document.getElementById('resultado-stats');
  cont.innerHTML = `<div class="cargando"><div class="spinner"></div>Calculando…</div>`;

  try {
    const datos = await rpc('comedor_admin_estadisticas', { p_pin: estado.pinAdmin, p_desde: desde, p_hasta: hasta });
    estado.estadisticasAdmin = datos || [];

    const totalSi = estado.estadisticasAdmin.reduce((s, a) => s + Number(a.dias_si), 0);

    cont.innerHTML = `
      <div class="resumen-staff">
        <div class="stat-card"><div class="stat-numero verde">${totalSi}</div><div class="stat-label">Días totales con comedor</div></div>
        <div class="stat-card"><div class="stat-numero">${estado.estadisticasAdmin.length}</div><div class="stat-label">Alumnos</div></div>
      </div>
      <div class="tarjeta-admin">
        ${estado.estadisticasAdmin.map(a => `
          <div class="fila-lista-admin">
            <div class="fila-lista-admin-info">
              <div class="fila-lista-admin-nombre">${escapeHtml(a.nombre)} ${escapeHtml(a.apellidos)}</div>
              <div class="fila-lista-admin-detalle">${escapeHtml(a.clase_nombre)}</div>
            </div>
            <div style="font-weight:700;font-size:14px;color:var(--verde-oscuro)">${a.dias_si} días</div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) {
    cont.innerHTML = `<div class="vacio-estado"><p>No se pudieron calcular las estadísticas.</p></div>`;
  }
}

// ----- TAB CONFIG -----

function renderTabConfig() {
  const cont = document.getElementById('contenido-tab-admin');
  cont.innerHTML = `<div class="cargando"><div class="spinner"></div>Cargando ajustes…</div>`;
  cargarYRenderConfig();
}

async function cargarYRenderConfig() {
  const cont = document.getElementById('contenido-tab-admin');
  try {
    const filas = await rpc('comedor_admin_obtener_config', { p_pin: estado.pinAdmin });
    const cfg = {};
    (filas || []).forEach(f => { cfg[f.clave] = f.valor; });

    cont.innerHTML = `
      <div class="tarjeta-admin">
        <div class="form-grupo"><label>Hora límite para marcar el día</label><input id="cfg-hora-limite" type="time" value="${cfg.hora_limite || '09:30'}"></div>
        <div class="form-grupo"><label>Curso escolar</label><input id="cfg-curso" value="${escapeHtml(cfg.curso_escolar || '')}"></div>
        <div class="form-grupo"><label>PIN de personal de comedor</label><input id="cfg-pin-staff" value="${escapeHtml(cfg.pin_personal_comedor || '')}"></div>
        <div class="form-grupo"><label>PIN de administración</label><input id="cfg-pin-admin" value="${escapeHtml(cfg.pin_admin || '')}"></div>
        <button class="btn-principal azul" onclick="guardarConfig()">Guardar ajustes</button>
      </div>

      <div class="tarjeta-admin">
        <div class="form-grupo" style="margin-bottom:6px"><label>Menú mensual</label></div>
        <div id="menu-actual-info"><div class="cargando" style="padding:1rem"><div class="spinner"></div></div></div>
        <input type="file" id="menu-archivo-input" accept=".pdf,.jpg,.jpeg,.png" style="display:none" onchange="manejarSubidaMenu(this)">
        <button class="btn-secundario" style="margin-top:10px" onclick="document.getElementById('menu-archivo-input').click()">📋 Subir nuevo menú (PDF o imagen)</button>
        <div id="resultado-subida-menu"></div>
      </div>
    `;
    cargarInfoMenuActual();
  } catch (e) {
    cont.innerHTML = `<div class="vacio-estado"><p>No se pudieron cargar los ajustes.</p></div>`;
  }
}

async function cargarInfoMenuActual() {
  const cont = document.getElementById('menu-actual-info');
  if (!cont) return;
  try {
    const { data } = await supabaseClient.from('comedor_menu_actual').select('*').eq('id', 1).single();
    if (data && data.nombre_archivo) {
      const fecha = new Date(data.subido_en).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
      cont.innerHTML = `
        <div class="fila-staff" style="margin-bottom:10px">
          <span class="punto-estado si"></span>
          <span>${escapeHtml(data.nombre_archivo)} <span style="color:var(--marron-suave);font-weight:500">· subido el ${fecha}</span></span>
        </div>
      `;
    } else {
      cont.innerHTML = `<p style="font-size:13px;color:var(--marron-suave);font-weight:500;margin:0 0 10px">Todavía no se ha subido ningún menú.</p>`;
    }
  } catch (e) {
    cont.innerHTML = `<p style="font-size:13px;color:var(--marron-suave);font-weight:500;margin:0 0 10px">Todavía no se ha subido ningún menú.</p>`;
  }
}

async function manejarSubidaMenu(inputEl) {
  const archivo = inputEl.files[0];
  if (!archivo) return;

  const resultadoCont = document.getElementById('resultado-subida-menu');
  resultadoCont.innerHTML = `<div class="cargando" style="padding:1rem"><div class="spinner"></div>Subiendo menú…</div>`;

  const extension = archivo.name.split('.').pop().toLowerCase();
  const tipoArchivo = extension === 'pdf' ? 'pdf' : 'imagen';
  const nombreStorage = `menu_${Date.now()}.${extension}`;

  try {
    const cliente = obtenerSupabaseClient();
    const { error: errorSubida } = await cliente.storage
      .from('comedor-menu')
      .upload(nombreStorage, archivo, { upsert: true });

    if (errorSubida) throw errorSubida;

    await rpc('comedor_admin_actualizar_menu', {
      p_pin: estado.pinAdmin,
      p_nombre_archivo: archivo.name,
      p_ruta_storage: nombreStorage,
      p_tipo_archivo: tipoArchivo
    });

    resultadoCont.innerHTML = `<div class="pin-generado visible">✅ Menú actualizado correctamente.</div>`;
    await cargarInfoMenuActual();
  } catch (e) {
    resultadoCont.innerHTML = `<div class="mensaje-error visible">No se pudo subir el menú. Inténtalo de nuevo.</div>`;
  }
  inputEl.value = '';
}


async function guardarConfig() {
  const cambios = {
    hora_limite: document.getElementById('cfg-hora-limite').value,
    curso_escolar: document.getElementById('cfg-curso').value.trim(),
    pin_personal_comedor: document.getElementById('cfg-pin-staff').value.trim(),
    pin_admin: document.getElementById('cfg-pin-admin').value.trim()
  };

  try {
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor) await rpc('comedor_admin_actualizar_config', { p_pin: estado.pinAdmin, p_clave: clave, p_valor: valor });
    }
    if (cambios.pin_admin && cambios.pin_admin !== estado.pinAdmin) {
      estado.pinAdmin = cambios.pin_admin;
      guardarSesion();
    }
    mostrarToast('Ajustes guardados ✓');
    await cargarConfigPublica();
  } catch (e) {
    mostrarToast('No se pudieron guardar los ajustes.');
  }
}
