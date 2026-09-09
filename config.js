// ============================================
// Configuración de conexión a Supabase
// La SUPABASE_ANON_KEY es pública por diseño:
// está protegida por las políticas RLS de la
// base de datos (verificación de PIN real),
// no por mantenerla en secreto.
// ============================================

const SUPABASE_URL = 'https://vbpqptitwzxywwhmfqmz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZicHFwdGl0d3p4eXd3aG1mcW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNDc1MTMsImV4cCI6MjA5NjkyMzUxM30._P_OyPCNmllfWz1BspwP9g0QJEWw_sm2it2eAMMOKqY';

let supabaseClient = null;

if (typeof window.supabase !== 'undefined') {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.error('La librería de Supabase no se cargó a tiempo. Se reintentará en app.js.');
}

function obtenerSupabaseClient() {
  if (!supabaseClient && typeof window.supabase !== 'undefined') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}
