# Setup: Tabla team_leagues

Para que funcione el scraper de ligas de equipos, necesitas crear esta tabla en Supabase:

## SQL para crear la tabla

```sql
CREATE TABLE IF NOT EXISTS team_leagues (
  id BIGSERIAL PRIMARY KEY,
  team_name TEXT NOT NULL,
  region TEXT NOT NULL,  -- AMER, EMEA, PAC, CN
  tier TEXT NOT NULL,    -- VCT, VCL, T3, GC, CG, Off
  tournament_name TEXT,  -- ej: "VCT AMER", "VCL EMEA"
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para queries rápidas
CREATE INDEX IF NOT EXISTS idx_team_leagues_team ON team_leagues(team_name);
CREATE INDEX IF NOT EXISTS idx_team_leagues_region ON team_leagues(region);
CREATE INDEX IF NOT EXISTS idx_team_leagues_tier ON team_leagues(tier);

-- Relación con tabla teams (opcional)
-- ALTER TABLE team_leagues 
-- ADD CONSTRAINT fk_team_name 
-- FOREIGN KEY (team_name) REFERENCES teams(name);
```

## Pasos:

1. Ve a Supabase → SQL Editor
2. Copia y pega el SQL arriba
3. Ejecuta
4. Luego puedes correr: `scrape_team_leagues.mjs`

## Qué guarda:

Cada fila es una relación: **Equipo X participa en Liga Y, Región Z**

Ejemplo:
```
team_name      | region | tier | tournament_name
===============================================
Team Vitality  | EMEA   | VCT  | VCT EMEA
100 Thieves    | AMER   | VCT  | VCT AMER
FNC            | EMEA   | VCL  | VCL EMEA
```

Esto permite:
- Saber en qué ligas juega cada equipo por región
- Filtrar equipos por liga y región en la UI
