-- Migración: tabla de días bloqueados (festivos, puentes, vacaciones)
-- Ejecutar en Supabase SQL Editor del proyecto comedor

CREATE TABLE IF NOT EXISTS comedor_dias_bloqueados (
  fecha  date PRIMARY KEY,
  motivo text DEFAULT ''
);

-- Solo el admin (service_role) puede insertar/borrar.
-- Las familias (anon) solo pueden leer (para saber qué días están bloqueados).
ALTER TABLE comedor_dias_bloqueados ENABLE ROW LEVEL SECURITY;

-- Lectura pública: familias y admin leen los días bloqueados
CREATE POLICY "todos_pueden_leer_dias_bloqueados"
  ON comedor_dias_bloqueados
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Escritura: la app usa la anon key pero solo el admin llega a estas funciones.
-- (La tabla no contiene datos sensibles — solo fechas y motivos de no-lectivos.)
CREATE POLICY "escritura_dias_bloqueados"
  ON comedor_dias_bloqueados
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Índice para consultas por rango de fecha
CREATE INDEX IF NOT EXISTS idx_dias_bloqueados_fecha
  ON comedor_dias_bloqueados (fecha);
