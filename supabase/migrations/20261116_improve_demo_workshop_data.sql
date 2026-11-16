-- =============================================================================
-- MIGRACIÓN IDEMPOTENTE: Datos de demostración realistas para Crash Solution
-- Cuenta objetivo: prueba@gmail.com
-- Taller de demostración: Crash Solution (0f7fc485-7a19-422c-bd79-c69d8f54790f)
-- =============================================================================
-- Reglas aplicadas:
-- 1. No modifica contraseñas, sesiones ni configuración de autenticación.
-- 2. No incluye contraseñas, tokens ni claves secretas.
-- 3. Verifica la relación entre auth.users (prueba@gmail.com) y workshop_members.
-- 4. Opera exclusivamente sobre el workshop_id verificado (0f7fc485-7a19-422c-bd79-c69d8f54790f).
-- 5. Conserva intactos los registros creados manualmente que no son de demostración
--    (ej. trabajo LOCAL-00046 / id 792af0cd-5c64-46d5-a7c8-a17c84795ed6).
-- 6. No inventa marcas comerciales, SKU oficiales ni compatibilidades no verificadas.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_user_id uuid;
  v_workshop_id uuid := '0f7fc485-7a19-422c-bd79-c69d8f54790f';
  v_is_member boolean := false;
BEGIN
  -- 1. Identificar el usuario de demostración mediante Supabase Auth
  SELECT u.id
    INTO v_user_id
    FROM auth.users u
   WHERE lower(u.email) = 'prueba@gmail.com'
   LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró la cuenta de demostración prueba@gmail.com en auth.users.';
  END IF;

  -- 2. Verificar pertenencia e identificación del taller de demostración
  SELECT EXISTS (
    SELECT 1
      FROM public.workshop_members wm
      JOIN public.workshops w ON w.id = wm.workshop_id
     WHERE wm.user_id = v_user_id
       AND wm.workshop_id = v_workshop_id
       AND lower(coalesce(w.email, '')) = 'prueba@gmail.com'
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'El taller % no corresponde de forma verificada al usuario de demostración prueba@gmail.com.', v_workshop_id;
  END IF;

  -- 3. Actualizar datos comerciales ficticios pero profesionales del taller demo
  UPDATE public.workshops
     SET name = 'Crash Solution',
         legal_name = 'Crash Solution Taller Integral S.R.L.',
         address = 'Av. Warnes 1450, CABA',
         phone = '011 4855-0100',
         whatsapp = '+54 9 11 5555-0100'
   WHERE id = v_workshop_id;

  -- ===========================================================================
  -- 4. ACTUALIZAR LOS 15 TRABAJOS DE DEMOSTRACIÓN (DEMO-0001 .. DEMO-0015)
  --    Se conserva intacto cualquier otro trabajo (ej. LOCAL-00046).
  -- ===========================================================================

  -- DEMO-0001: Martín Fernández — Volkswagen Gol Trend 2017 — AB 482 KD (Modo Detallado, Bicapa)
  UPDATE public.jobs
     SET status = 'Aprobado',
         customer_name = 'Martín Fernández',
         vehicle_plate = 'AB 482 KD',
         updated_at = timezone('utc', now()),
         payload = '{
           "id": "8dd5a80a-5099-4f00-b1e7-d992c9bc2a91",
           "number": "DEMO-0001",
           "demo": true,
           "status": "Aprobado",
           "budgetMode": "detailed",
           "paintType": "Bicapa",
           "area": "Lado derecho",
           "discount": 0,
           "tax": 21,
           "customParts": {},
           "generalNote": "Vehículo ingresado por colisión lateral derecha leve.",
           "observations": "Reparación de puerta delantera derecha y pintura",
           "syncStatus": "synced",
           "customer": {"name": "Martín Fernández", "phone": "+54 9 11 5555-0101", "email": "martin.fernandez@demo-taller.invalid"},
           "vehicle": {"make": "Volkswagen", "model": "Gol Trend", "plate": "AB 482 KD", "year": 2017, "color": "Gris Plata", "mileage": 84500},
           "rec": {
             "cliente": "Martín Fernández",
             "telefono": "+54 9 11 5555-0101",
             "email": "martin.fernandez@demo-taller.invalid",
             "patente": "AB 482 KD",
             "marca": "Volkswagen",
             "modelo": "Gol Trend",
             "anio": "2017",
             "color": "Gris Plata",
             "vin": "9BWAB45U0HP500101",
             "km": "84500",
             "seguro": "Federación Patronal",
             "siniestro": "SIN-2026-1041",
             "pintura": "Bicapa",
             "fecha": "2026-11-10",
             "dano": "Abolladura y roce profundo en puerta delantera derecha y guardabarros delantero derecho.",
             "obs": "Reparación de puerta delantera derecha y pintura"
           },
           "inspection": {
             "Lado derecho|||Puerta delantera derecha": {"status": "danado", "works": ["Chapa", "Pintura", "Reparar"], "note": "Desabollado de panel exterior y aplicación de bicapa.", "photos": []},
             "Parte delantera|||Guardabarros delantero derecho": {"status": "danado", "works": ["Chapa", "Pintura"], "note": "Alineación de borde de guardabarros y difuminado.", "photos": []}
           },
           "quote": [
             {"id": "d1-l1", "source": "inspection", "pieceKey": "Lado derecho|||Puerta delantera derecha", "piece": "Puerta delantera derecha", "area": "Lado derecho", "workType": "Chapa", "unit": "día", "qty": 2, "price": 48000, "desc": "Puerta delantera derecha · Chapa"},
             {"id": "d1-l2", "source": "inspection", "pieceKey": "Lado derecho|||Puerta delantera derecha", "piece": "Puerta delantera derecha", "area": "Lado derecho", "workType": "Pintura", "unit": "paño", "qty": 1.5, "price": 82000, "desc": "Puerta delantera derecha · Pintura"},
             {"id": "d1-l3", "source": "inspection", "pieceKey": "Parte delantera|||Guardabarros delantero derecho", "piece": "Guardabarros delantero derecho", "area": "Parte delantera", "workType": "Chapa", "unit": "día", "qty": 1, "price": 48000, "desc": "Guardabarros delantero derecho · Chapa"},
             {"id": "d1-l4", "source": "inspection", "pieceKey": "Parte delantera|||Guardabarros delantero derecho", "piece": "Guardabarros delantero derecho", "area": "Parte delantera", "workType": "Pintura", "unit": "paño", "qty": 1, "price": 82000, "desc": "Guardabarros delantero derecho · Pintura"}
           ],
           "summaryBudget": {"chapaDays": 3, "chapaDayPrice": 48000, "pinturaPanels": 2.5, "pinturaPanelPrice": 82000},
           "document": {
             "date": "2026-11-10",
             "validDays": 15,
             "paintType": "Bicapa",
             "terms": "Incluye materiales de cabina presurizada, colorimetría computarizada y lustrado final.",
             "observations": "Incluye materiales de cabina presurizada, colorimetría computarizada y lustrado final."
           }
         }'::jsonb
   WHERE id = '8dd5a80a-5099-4f00-b1e7-d992c9bc2a91'
     AND workshop_id = v_workshop_id
     AND job_number = 'DEMO-0001';

  -- DEMO-0002: Carolina Gómez — Toyota Corolla 2020 — AE 731 LM (Modo Resumido Aseguradora, Tricapa)
  UPDATE public.jobs
     SET status = 'Enviado',
         customer_name = 'Carolina Gómez',
         vehicle_plate = 'AE 731 LM',
         updated_at = timezone('utc', now()),
         payload = '{
           "id": "b1792f8e-03ab-4475-bd7a-5df2cd5a8dbb",
           "number": "DEMO-0002",
           "demo": true,
           "status": "Enviado",
           "budgetMode": "summary",
           "paintType": "Tricapa",
           "area": "Parte delantera",
           "discount": 0,
           "tax": 21,
           "customParts": {},
           "generalNote": "Relevamiento fotográfico enviado a compañía de seguros.",
           "observations": "Reacondicionamiento de paragolpes delantero",
           "syncStatus": "synced",
           "customer": {"name": "Carolina Gómez", "phone": "+54 9 11 5555-0102", "email": "carolina.gomez@demo-taller.invalid"},
           "vehicle": {"make": "Toyota", "model": "Corolla", "plate": "AE 731 LM", "year": 2020, "color": "Blanco Perlado", "mileage": 52300},
           "rec": {
             "cliente": "Carolina Gómez",
             "telefono": "+54 9 11 5555-0102",
             "email": "carolina.gomez@demo-taller.invalid",
             "patente": "AE 731 LM",
             "marca": "Toyota",
             "modelo": "Corolla",
             "anio": "2020",
             "color": "Blanco Perlado",
             "vin": "9BRBL3HE0L0200102",
             "km": "52300",
             "seguro": "La Segunda Seguros",
             "siniestro": "SIN-2026-2088",
             "pintura": "Tricapa",
             "fecha": "2026-11-11",
             "dano": "Fisura en puntera derecha de paragolpes delantero y desalineación de soportes.",
             "obs": "Reacondicionamiento de paragolpes delantero"
           },
           "inspection": {
             "Parte delantera|||Paragolpes delantero": {"status": "danado", "works": ["Chapa", "Pintura", "Reparar"], "note": "Soldadura plástica, encuadre y pintura tricapa blanco perlado.", "photos": []}
           },
           "quote": [
             {"id": "d2-l1", "source": "inspection", "pieceKey": "Parte delantera|||Paragolpes delantero", "piece": "Paragolpes delantero", "area": "Parte delantera", "workType": "Chapa", "unit": "día", "qty": 1.5, "price": 52000, "desc": "Paragolpes delantero · Chapa"},
             {"id": "d2-l2", "source": "inspection", "pieceKey": "Parte delantera|||Paragolpes delantero", "piece": "Paragolpes delantero", "area": "Parte delantera", "workType": "Pintura", "unit": "paño", "qty": 2, "price": 95000, "desc": "Paragolpes delantero · Pintura"},
             {"id": "d2-l3", "source": null, "pieceKey": null, "piece": "Juego de guías laterales de paragolpes", "area": "", "workType": "Repuesto", "unit": "juego", "qty": 1, "price": 38000, "description": "Juego de guías laterales de paragolpes · Repuesto", "desc": "Juego de guías laterales de paragolpes · Repuesto"}
           ],
           "summaryBudget": {"chapaDays": 1.5, "chapaDayPrice": 52000, "pinturaPanels": 2, "pinturaPanelPrice": 95000},
           "document": {
             "date": "2026-11-11",
             "validDays": 15,
             "paintType": "Tricapa",
             "terms": "Presupuesto confeccionado para compañía aseguradora. Acabado tricapa perlado con difuminado.",
             "observations": "Presupuesto confeccionado para compañía aseguradora. Acabado tricapa perlado con difuminado."
           }
         }'::jsonb
   WHERE id = 'b1792f8e-03ab-4475-bd7a-5df2cd5a8dbb'
     AND workshop_id = v_workshop_id
     AND job_number = 'DEMO-0002';

  -- DEMO-0003: Diego Rodríguez — Peugeot 208 2022 — AF 264 PR (Modo Detallado, Bicapa)
  UPDATE public.jobs
     SET status = 'Aprobado',
         customer_name = 'Diego Rodríguez',
         vehicle_plate = 'AF 264 PR',
         updated_at = timezone('utc', now()),
         payload = '{
           "id": "58134089-9a8b-4c06-91d2-1c9f87e51a5e",
           "number": "DEMO-0003",
           "demo": true,
           "status": "Aprobado",
           "budgetMode": "detailed",
           "paintType": "Bicapa",
           "area": "Parte delantera",
           "discount": 5,
           "tax": 21,
           "customParts": {},
           "generalNote": "Unidad en sector de preparación de pintura.",
           "observations": "Reparación de guardabarros y capó",
           "syncStatus": "synced",
           "customer": {"name": "Diego Rodríguez", "phone": "+54 9 11 5555-0103", "email": "diego.rodriguez@demo-taller.invalid"},
           "vehicle": {"make": "Peugeot", "model": "208", "plate": "AF 264 PR", "year": 2022, "color": "Azul Quasar", "mileage": 31200},
           "rec": {
             "cliente": "Diego Rodríguez",
             "telefono": "+54 9 11 5555-0103",
             "email": "diego.rodriguez@demo-taller.invalid",
             "patente": "AF 264 PR",
             "marca": "Peugeot",
             "modelo": "208",
             "anio": "2022",
             "color": "Azul Quasar",
             "vin": "8ADUW5FP0NG300103",
             "km": "31200",
             "seguro": "Sancor Seguros",
             "siniestro": "SIN-2026-3115",
             "pintura": "Bicapa",
             "fecha": "2026-11-08",
             "dano": "Impacto frontal izquierdo con deformación en capó y guardabarros delantero izquierdo.",
             "obs": "Reparación de guardabarros y capó"
           },
           "inspection": {
             "Parte delantera|||Capot": {"status": "danado", "works": ["Chapa", "Pintura", "Reparar"], "note": "Escuadrado de frente de capot y pintura completa.", "photos": []},
             "Parte delantera|||Guardabarros delantero izquierdo": {"status": "danado", "works": ["Chapa", "Pintura"], "note": "Planchado de nervadura y pintura bicapa.", "photos": []}
           },
           "quote": [
             {"id": "d3-l1", "source": "inspection", "pieceKey": "Parte delantera|||Capot", "piece": "Capot", "area": "Parte delantera", "workType": "Chapa", "unit": "día", "qty": 2, "price": 50000, "desc": "Capot · Chapa"},
             {"id": "d3-l2", "source": "inspection", "pieceKey": "Parte delantera|||Capot", "piece": "Capot", "area": "Parte delantera", "workType": "Pintura", "unit": "paño", "qty": 2, "price": 85000, "desc": "Capot · Pintura"},
             {"id": "d3-l3", "source": "inspection", "pieceKey": "Parte delantera|||Guardabarros delantero izquierdo", "piece": "Guardabarros delantero izquierdo", "area": "Parte delantera", "workType": "Chapa", "unit": "día", "qty": 1.5, "price": 50000, "desc": "Guardabarros delantero izquierdo · Chapa"},
             {"id": "d3-l4", "source": "inspection", "pieceKey": "Parte delantera|||Guardabarros delantero izquierdo", "piece": "Guardabarros delantero izquierdo", "area": "Parte delantera", "workType": "Pintura", "unit": "paño", "qty": 1, "price": 85000, "desc": "Guardabarros delantero izquierdo · Pintura"}
           ],
           "summaryBudget": {"chapaDays": 3.5, "chapaDayPrice": 50000, "pinturaPanels": 3, "pinturaPanelPrice": 85000},
           "document": {
             "date": "2026-11-08",
             "validDays": 15,
             "paintType": "Bicapa",
             "terms": "Incluye alineación de frente, selladores anticorrosivos y garantía de pintura.",
             "observations": "Incluye alineación de frente, selladores anticorrosivos y garantía de pintura."
           }
         }'::jsonb
   WHERE id = '58134089-9a8b-4c06-91d2-1c9f87e51a5e'
     AND workshop_id = v_workshop_id
     AND job_number = 'DEMO-0003';

  -- DEMO-0004: Laura Martínez — Ford Ranger 2019 — AC 593 HT (Modo Detallado, Bicapa)
  UPDATE public.jobs
     SET status = 'Aprobado',
         customer_name = 'Laura Martínez',
         vehicle_plate = 'AC 593 HT',
         updated_at = timezone('utc', now()),
         payload = '{
           "id": "aa31123a-af05-4d8c-a9d8-df36d41123e0",
           "number": "DEMO-0004",
           "demo": true,
           "status": "Aprobado",
           "budgetMode": "detailed",
           "paintType": "Bicapa",
           "area": "Parte delantera",
           "discount": 0,
           "tax": 21,
           "customParts": {},
           "generalNote": "Óptica recibida para montaje y regulación.",
           "observations": "Reemplazo de óptica delantera y encuadre de frente",
           "syncStatus": "synced",
           "customer": {"name": "Laura Martínez", "phone": "+54 9 11 5555-0104", "email": "laura.martinez@demo-taller.invalid"},
           "vehicle": {"make": "Ford", "model": "Ranger", "plate": "AC 593 HT", "year": 2019, "color": "Gris Magnetic", "mileage": 112400},
           "rec": {
             "cliente": "Laura Martínez",
             "telefono": "+54 9 11 5555-0104",
             "email": "laura.martinez@demo-taller.invalid",
             "patente": "AC 593 HT",
             "marca": "Ford",
             "modelo": "Ranger",
             "anio": "2019",
             "color": "Gris Magnetic",
             "vin": "8AFAR23L0KJ400104",
             "km": "112400",
             "seguro": "Rivadavia Seguros",
             "siniestro": "SIN-2026-4190",
             "pintura": "Bicapa",
             "fecha": "2026-11-09",
             "dano": "Rotura de óptica delantera derecha y deformación en soporte de frente.",
             "obs": "Reemplazo de óptica delantera y encuadre de frente"
           },
           "inspection": {
             "Parte delantera|||Óptica delantera derecha": {"status": "danado", "works": ["Reemplazar"], "note": "Sustitución de óptica rota y regulación de haz luminoso.", "photos": []},
             "Parte delantera|||Paragolpes delantero": {"status": "danado", "works": ["Chapa", "Pintura"], "note": "Escuadrado de soporte lateral derecho y retoque bicapa.", "photos": []}
           },
           "quote": [
             {"id": "d4-l1", "source": "inspection", "pieceKey": "Parte delantera|||Óptica delantera derecha", "piece": "Óptica delantera derecha", "area": "Parte delantera", "workType": "Reemplazar", "unit": "pieza", "qty": 1, "price": 195000, "desc": "Óptica delantera derecha · Reemplazar"},
             {"id": "d4-l2", "source": "inspection", "pieceKey": "Parte delantera|||Paragolpes delantero", "piece": "Paragolpes delantero", "area": "Parte delantera", "workType": "Chapa", "unit": "día", "qty": 1, "price": 55000, "desc": "Paragolpes delantero · Chapa"},
             {"id": "d4-l3", "source": "inspection", "pieceKey": "Parte delantera|||Paragolpes delantero", "piece": "Paragolpes delantero", "area": "Parte delantera", "workType": "Pintura", "unit": "paño", "qty": 1.5, "price": 88000, "desc": "Paragolpes delantero · Pintura"}
           ],
           "summaryBudget": {"chapaDays": 1, "chapaDayPrice": 55000, "pinturaPanels": 1.5, "pinturaPanelPrice": 88000},
           "document": {
             "date": "2026-11-09",
             "validDays": 15,
             "paintType": "Bicapa",
             "terms": "Incluye montaje, sellado y regulación de óptica delantera.",
             "observations": "Incluye montaje, sellado y regulación de óptica delantera."
           }
         }'::jsonb
   WHERE id = 'aa31123a-af05-4d8c-a9d8-df36d41123e0'
     AND workshop_id = v_workshop_id
     AND job_number = 'DEMO-0004';

  -- DEMO-0005: Nicolás Pereira — Renault Sandero 2018 — AD 817 NC (Modo Detallado, Bicapa)
  UPDATE public.jobs
     SET status = 'Aprobado',
         customer_name = 'Nicolás Pereira',
         vehicle_plate = 'AD 817 NC',
         updated_at = timezone('utc', now()),
         payload = '{
           "id": "3d506579-3f37-485a-8e34-ca892fa87862",
           "number": "DEMO-0005",
           "demo": true,
           "status": "Aprobado",
           "budgetMode": "detailed",
           "paintType": "Bicapa",
           "area": "Lado izquierdo",
           "discount": 0,
           "tax": 21,
           "customParts": {},
           "generalNote": "Trabajo finalizado y retirado por el titular.",
           "observations": "Pintura de puerta trasera izquierda",
           "syncStatus": "synced",
           "customer": {"name": "Nicolás Pereira", "phone": "+54 9 11 5555-0105", "email": "nicolas.pereira@demo-taller.invalid"},
           "vehicle": {"make": "Renault", "model": "Sandero", "plate": "AD 817 NC", "year": 2018, "color": "Rojo Fuego", "mileage": 76800},
           "rec": {
             "cliente": "Nicolás Pereira",
             "telefono": "+54 9 11 5555-0105",
             "email": "nicolas.pereira@demo-taller.invalid",
             "patente": "AD 817 NC",
             "marca": "Renault",
             "modelo": "Sandero",
             "anio": "2018",
             "color": "Rojo Fuego",
             "vin": "93Y5SRD40JJ500105",
             "km": "76800",
             "seguro": "Particular",
             "siniestro": "",
             "pintura": "Bicapa",
             "fecha": "2026-11-02",
             "dano": "Rayón profundo longitudinal en puerta trasera izquierda.",
             "obs": "Pintura de puerta trasera izquierda"
           },
           "inspection": {
             "Lado izquierdo|||Puerta trasera izquierda": {"status": "danado", "works": ["Pintura", "Pulido"], "note": "Preparación con aparejo 2K, pintura bicapa y pulido de empalme.", "photos": []}
           },
           "quote": [
             {"id": "d5-l1", "source": "inspection", "pieceKey": "Lado izquierdo|||Puerta trasera izquierda", "piece": "Puerta trasera izquierda", "area": "Lado izquierdo", "workType": "Pintura", "unit": "paño", "qty": 1.5, "price": 80000, "desc": "Puerta trasera izquierda · Pintura"}
           ],
           "summaryBudget": {"chapaDays": "", "chapaDayPrice": "", "pinturaPanels": 1.5, "pinturaPanelPrice": 80000},
           "document": {
             "date": "2026-11-02",
             "validDays": 15,
             "paintType": "Bicapa",
             "terms": "Trabajo finalizado y entregado con control de brillo.",
             "observations": "Trabajo finalizado y entregado con control de brillo."
           }
         }'::jsonb
   WHERE id = '3d506579-3f37-485a-8e34-ca892fa87862'
     AND workshop_id = v_workshop_id
     AND job_number = 'DEMO-0005';

  -- DEMO-0006: Valentina López — Fiat Cronos 2021 — AE 426 SJ (Modo Resumido Aseguradora, Bicapa)
  UPDATE public.jobs
     SET status = 'Enviado',
         customer_name = 'Valentina López',
         vehicle_plate = 'AE 426 SJ',
         updated_at = timezone('utc', now()),
         payload = '{
           "id": "038b5795-7295-4de0-861c-8e01a54f7640",
           "number": "DEMO-0006",
           "demo": true,
           "status": "Enviado",
           "budgetMode": "summary",
           "paintType": "Bicapa",
           "area": "Lado derecho",
           "discount": 0,
           "tax": 21,
           "customParts": {},
           "generalNote": "Cotización emitida en formato resumido para perito de compañía.",
           "observations": "Reparación de abolladura lateral",
           "syncStatus": "synced",
           "customer": {"name": "Valentina López", "phone": "+54 9 11 5555-0106", "email": "valentina.lopez@demo-taller.invalid"},
           "vehicle": {"make": "Fiat", "model": "Cronos", "plate": "AE 426 SJ", "year": 2021, "color": "Gris Silverstone", "mileage": 48900},
           "rec": {
             "cliente": "Valentina López",
             "telefono": "+54 9 11 5555-0106",
             "email": "valentina.lopez@demo-taller.invalid",
             "patente": "AE 426 SJ",
             "marca": "Fiat",
             "modelo": "Cronos",
             "anio": "2021",
             "color": "Gris Silverstone",
             "vin": "8AP359A20MU600106",
             "km": "48900",
             "seguro": "Allianz Argentina",
             "siniestro": "SIN-2026-5204",
             "pintura": "Bicapa",
             "fecha": "2026-11-12",
             "dano": "Abolladura en faldón lateral derecho y puerta trasera derecha por roce en estacionamiento.",
             "obs": "Reparación de abolladura lateral"
           },
           "inspection": {
             "Lado derecho|||Puerta trasera derecha": {"status": "danado", "works": ["Chapa", "Pintura"], "note": "Extracción de golpe en línea de cintura.", "photos": []},
             "Lado derecho|||Zócalo derecho": {"status": "danado", "works": ["Chapa", "Pintura"], "note": "Desabollado con spotter y protección texturada.", "photos": []}
           },
           "quote": [
             {"id": "d6-l1", "source": "inspection", "pieceKey": "Lado derecho|||Puerta trasera derecha", "piece": "Puerta trasera derecha", "area": "Lado derecho", "workType": "Chapa", "unit": "día", "qty": 1.5, "price": 49000, "desc": "Puerta trasera derecha · Chapa"},
             {"id": "d6-l2", "source": "inspection", "pieceKey": "Lado derecho|||Puerta trasera derecha", "piece": "Puerta trasera derecha", "area": "Lado derecho", "workType": "Pintura", "unit": "paño", "qty": 1.5, "price": 84000, "desc": "Puerta trasera derecha · Pintura"},
             {"id": "d6-l3", "source": "inspection", "pieceKey": "Lado derecho|||Zócalo derecho", "piece": "Zócalo derecho", "area": "Lado derecho", "workType": "Chapa", "unit": "día", "qty": 1, "price": 49000, "desc": "Zócalo derecho · Chapa"},
             {"id": "d6-l4", "source": "inspection", "pieceKey": "Lado derecho|||Zócalo derecho", "piece": "Zócalo derecho", "area": "Lado derecho", "workType": "Pintura", "unit": "paño", "qty": 1, "price": 84000, "desc": "Zócalo derecho · Pintura"}
           ],
           "summaryBudget": {"chapaDays": 2.5, "chapaDayPrice": 49000, "pinturaPanels": 2.5, "pinturaPanelPrice": 84000},
           "document": {
             "date": "2026-11-12",
             "validDays": 15,
             "paintType": "Bicapa",
             "terms": "Presupuesto totalizado para inspección de compañía aseguradora.",
             "observations": "Presupuesto totalizado para inspección de compañía aseguradora."
           }
         }'::jsonb
   WHERE id = '038b5795-7295-4de0-861c-8e01a54f7640'
     AND workshop_id = v_workshop_id
     AND job_number = 'DEMO-0006';

  -- DEMO-0007: Sebastián Romero — Chevrolet Onix 2020 — AD 659 BK (Modo Detallado, Bicapa)
  UPDATE public.jobs
     SET status = 'Aprobado',
         customer_name = 'Sebastián Romero',
         vehicle_plate = 'AD 659 BK',
         updated_at = timezone('utc', now()),
         payload = '{
           "id": "fc31f403-acc0-4df2-b139-18c612e8d02c",
           "number": "DEMO-0007",
           "demo": true,
           "status": "Aprobado",
           "budgetMode": "detailed",
           "paintType": "Bicapa",
           "area": "Parte trasera",
           "discount": 0,
           "tax": 21,
           "customParts": {},
           "generalNote": "En etapa de bancada ligera y escuadrado de portón.",
           "observations": "Reparación de portón trasero",
           "syncStatus": "synced",
           "customer": {"name": "Sebastián Romero", "phone": "+54 9 11 5555-0107", "email": "sebastian.romero@demo-taller.invalid"},
           "vehicle": {"make": "Chevrolet", "model": "Onix", "plate": "AD 659 BK", "year": 2020, "color": "Blanco Summit", "mileage": 61500},
           "rec": {
             "cliente": "Sebastián Romero",
             "telefono": "+54 9 11 5555-0107",
             "email": "sebastian.romero@demo-taller.invalid",
             "patente": "AD 659 BK",
             "marca": "Chevrolet",
             "modelo": "Onix",
             "anio": "2020",
             "color": "Blanco Summit",
             "vin": "9BGEA48A0LG700107",
             "km": "61500",
             "seguro": "Mercantil Andina",
             "siniestro": "SIN-2026-6120",
             "pintura": "Bicapa",
             "fecha": "2026-11-07",
             "dano": "Golpe trasero con hundimiento central en portón trasero y roce en paragolpes.",
             "obs": "Reparación de portón trasero"
           },
           "inspection": {
             "Parte trasera|||Portón trasero": {"status": "danado", "works": ["Chapa", "Pintura", "Reparar"], "note": "Recuperación de nervadura de portón, sellado interior y pintura.", "photos": []},
             "Parte trasera|||Paragolpes trasero": {"status": "danado", "works": ["Pintura"], "note": "Lijado y repintado completo de paragolpes trasero.", "photos": []}
           },
           "quote": [
             {"id": "d7-l1", "source": "inspection", "pieceKey": "Parte trasera|||Portón trasero", "piece": "Portón trasero", "area": "Parte trasera", "workType": "Chapa", "unit": "día", "qty": 2.5, "price": 50000, "desc": "Portón trasero · Chapa"},
             {"id": "d7-l2", "source": "inspection", "pieceKey": "Parte trasera|||Portón trasero", "piece": "Portón trasero", "area": "Parte trasera", "workType": "Pintura", "unit": "paño", "qty": 1.5, "price": 84000, "desc": "Portón trasero · Pintura"},
             {"id": "d7-l3", "source": "inspection", "pieceKey": "Parte trasera|||Paragolpes trasero", "piece": "Paragolpes trasero", "area": "Parte trasera", "workType": "Pintura", "unit": "paño", "qty": 1.5, "price": 84000, "desc": "Paragolpes trasero · Pintura"}
           ],
           "summaryBudget": {"chapaDays": 2.5, "chapaDayPrice": 50000, "pinturaPanels": 3, "pinturaPanelPrice": 84000},
           "document": {
             "date": "2026-11-07",
             "validDays": 15,
             "paintType": "Bicapa",
             "terms": "Incluye desmontaje de luneta y burletes para acabado original.",
             "observations": "Incluye desmontaje de luneta y burletes para acabado original."
           }
         }'::jsonb
   WHERE id = 'fc31f403-acc0-4df2-b139-18c612e8d02c'
     AND workshop_id = v_workshop_id
     AND job_number = 'DEMO-0007';

  -- DEMO-0008: Florencia Medina — Volkswagen Amarok 2023 — AG 382 RF (Modo Resumido Aseguradora, Tricapa)
  UPDATE public.jobs
     SET status = 'Aprobado',
         customer_name = 'Florencia Medina',
         vehicle_plate = 'AG 382 RF',
         updated_at = timezone('utc', now()),
         payload = '{
           "id": "f94c3cb9-567f-40cd-a913-90801a591692",
           "number": "DEMO-0008",
           "demo": true,
           "status": "Aprobado",
           "budgetMode": "summary",
           "paintType": "Tricapa",
           "area": "Lado izquierdo",
           "discount": 0,
           "tax": 21,
           "customParts": {},
           "generalNote": "Orden aprobada por compañía Zurich Seguros.",
           "observations": "Presupuesto de chapa y pintura por siniestro",
           "syncStatus": "synced",
           "customer": {"name": "Florencia Medina", "phone": "+54 9 11 5555-0108", "email": "florencia.medina@demo-taller.invalid"},
           "vehicle": {"make": "Volkswagen", "model": "Amarok", "plate": "AG 382 RF", "year": 2023, "color": "Blanco Cristal Perlado", "mileage": 24600},
           "rec": {
             "cliente": "Florencia Medina",
             "telefono": "+54 9 11 5555-0108",
             "email": "florencia.medina@demo-taller.invalid",
             "patente": "AG 382 RF",
             "marca": "Volkswagen",
             "modelo": "Amarok",
             "anio": "2023",
             "color": "Blanco Cristal Perlado",
             "vin": "8AWDB42H0PA800108",
             "km": "24600",
             "seguro": "Zurich Seguros",
             "siniestro": "SIN-2026-7340",
             "pintura": "Tricapa",
             "fecha": "2026-11-13",
             "dano": "Siniestro lateral izquierdo en caja de carga y puerta trasera izquierda.",
             "obs": "Presupuesto de chapa y pintura por siniestro"
           },
           "inspection": {
             "Lado izquierdo|||Puerta trasera izquierda": {"status": "danado", "works": ["Chapa", "Pintura"], "note": "Conformado de panel y aplicación de tricapa.", "photos": []},
             "Lado izquierdo|||Guardabarros trasero izquierdo": {"status": "danado", "works": ["Chapa", "Pintura"], "note": "Reparación de lateral de caja y pintura.", "photos": []}
           },
           "quote": [
             {"id": "d8-l1", "source": "inspection", "pieceKey": "Lado izquierdo|||Puerta trasera izquierda", "piece": "Puerta trasera izquierda", "area": "Lado izquierdo", "workType": "Chapa", "unit": "día", "qty": 2, "price": 56000, "desc": "Puerta trasera izquierda · Chapa"},
             {"id": "d8-l2", "source": "inspection", "pieceKey": "Lado izquierdo|||Puerta trasera izquierda", "piece": "Puerta trasera izquierda", "area": "Lado izquierdo", "workType": "Pintura", "unit": "paño", "qty": 1.5, "price": 96000, "desc": "Puerta trasera izquierda · Pintura"},
             {"id": "d8-l3", "source": "inspection", "pieceKey": "Lado izquierdo|||Guardabarros trasero izquierdo", "piece": "Guardabarros trasero izquierdo", "area": "Lado izquierdo", "workType": "Chapa", "unit": "día", "qty": 3, "price": 56000, "desc": "Guardabarros trasero izquierdo · Chapa"},
             {"id": "d8-l4", "source": "inspection", "pieceKey": "Lado izquierdo|||Guardabarros trasero izquierdo", "piece": "Guardabarros trasero izquierdo", "area": "Lado izquierdo", "workType": "Pintura", "unit": "paño", "qty": 2.5, "price": 96000, "desc": "Guardabarros trasero izquierdo · Pintura"}
           ],
           "summaryBudget": {"chapaDays": 5, "chapaDayPrice": 56000, "pinturaPanels": 4, "pinturaPanelPrice": 96000},
           "document": {
             "date": "2026-11-13",
             "validDays": 15,
             "paintType": "Tricapa",
             "terms": "Presupuesto aprobado por compañía de seguros bajo modalidad totalizada (días de chapa y paños de pintura).",
             "observations": "Presupuesto aprobado por compañía de seguros bajo modalidad totalizada (días de chapa y paños de pintura)."
           }
         }'::jsonb
   WHERE id = 'f94c3cb9-567f-40cd-a913-90801a591692'
     AND workshop_id = v_workshop_id
     AND job_number = 'DEMO-0008';

  -- DEMO-0009: Facundo Acosta — Toyota Hilux 2021 — AE 914 VP
  UPDATE public.jobs
     SET status = 'Enviado',
         customer_name = 'Facundo Acosta',
         vehicle_plate = 'AE 914 VP',
         updated_at = timezone('utc', now()),
         payload = '{
           "id": "927b5b3a-aa6c-404b-9047-50b7434b94f4",
           "number": "DEMO-0009",
           "demo": true,
           "status": "Enviado",
           "budgetMode": "detailed",
           "paintType": "Bicapa",
           "area": "Parte trasera",
           "discount": 0,
           "tax": 21,
           "customParts": {},
           "generalNote": "Aguardando autorización de repuestos accesorios.",
           "observations": "Reparación de compuerta trasera y pintura bicapa",
           "syncStatus": "synced",
           "customer": {"name": "Facundo Acosta", "phone": "+54 9 11 5555-0109", "email": "facundo.acosta@demo-taller.invalid"},
           "vehicle": {"make": "Toyota", "model": "Hilux", "plate": "AE 914 VP", "year": 2021, "color": "Gris Oscuro", "mileage": 95400},
           "rec": {
             "cliente": "Facundo Acosta",
             "telefono": "+54 9 11 5555-0109",
             "email": "facundo.acosta@demo-taller.invalid",
             "patente": "AE 914 VP",
             "marca": "Toyota",
             "modelo": "Hilux",
             "anio": "2021",
             "color": "Gris Oscuro",
             "vin": "8AJBA8CD0M1900109",
             "km": "95400",
             "seguro": "San Cristóbal Seguros",
             "siniestro": "SIN-2026-8112",
             "pintura": "Bicapa",
             "fecha": "2026-11-13",
             "dano": "Abolladura en compuerta de caja trasera y paragolpes trasero.",
             "obs": "Reparación de compuerta trasera y pintura bicapa"
           },
           "inspection": {
             "Parte trasera|||Portón trasero": {"status": "danado", "works": ["Chapa", "Pintura"], "note": "Enderezado de compuerta de caja y repintado.", "photos": []}
           },
           "quote": [
             {"id": "d9-l1", "source": "inspection", "pieceKey": "Parte trasera|||Portón trasero", "piece": "Portón trasero", "area": "Parte trasera", "workType": "Chapa", "unit": "día", "qty": 2, "price": 54000, "desc": "Portón trasero · Chapa"},
             {"id": "d9-l2", "source": "inspection", "pieceKey": "Parte trasera|||Portón trasero", "piece": "Portón trasero", "area": "Parte trasera", "workType": "Pintura", "unit": "paño", "qty": 2, "price": 86000, "desc": "Portón trasero · Pintura"}
           ],
           "summaryBudget": {"chapaDays": 2, "chapaDayPrice": 54000, "pinturaPanels": 2, "pinturaPanelPrice": 86000},
           "document": {
             "date": "2026-11-13",
             "validDays": 15,
             "paintType": "Bicapa",
             "terms": "Incluye desmontaje de accesorios de caja y protección anticorrosiva.",
             "observations": "Incluye desmontaje de accesorios de caja y protección anticorrosiva."
           }
         }'::jsonb
   WHERE id = '927b5b3a-aa6c-404b-9047-50b7434b94f4'
     AND workshop_id = v_workshop_id
     AND job_number = 'DEMO-0009';

  -- DEMO-0010: Camila Pereyra — Chevrolet Cruze 2019 — AC 748 MD
  UPDATE public.jobs
     SET status = 'Aprobado',
         customer_name = 'Camila Pereyra',
         vehicle_plate = 'AC 748 MD',
         updated_at = timezone('utc', now()),
         payload = '{
           "id": "e91c1ebe-deb5-4da4-ab24-1203846de5a1",
           "number": "DEMO-0010",
           "demo": true,
           "status": "Aprobado",
           "budgetMode": "detailed",
           "paintType": "Bicapa",
           "area": "Parte trasera",
           "discount": 0,
           "tax": 21,
           "customParts": {},
           "generalNote": "Entregado conforme con control de calidad.",
           "observations": "Pintura de paragolpes trasero y difuminado lateral",
           "syncStatus": "synced",
           "customer": {"name": "Camila Pereyra", "phone": "+54 9 11 5555-0110", "email": "camila.pereyra@demo-taller.invalid"},
           "vehicle": {"make": "Chevrolet", "model": "Cruze", "plate": "AC 748 MD", "year": 2019, "color": "Negro Ouro", "mileage": 68900},
           "rec": {
             "cliente": "Camila Pereyra",
             "telefono": "+54 9 11 5555-0110",
             "email": "camila.pereyra@demo-taller.invalid",
             "patente": "AC 748 MD",
             "marca": "Chevrolet",
             "modelo": "Cruze",
             "anio": "2019",
             "color": "Negro Ouro",
             "vin": "8AGBB69S0KA000110",
             "km": "68900",
             "seguro": "Provincia Seguros",
             "siniestro": "SIN-2026-8450",
             "pintura": "Bicapa",
             "fecha": "2026-11-04",
             "dano": "Roce en paragolpes trasero y guardabarros trasero derecho.",
             "obs": "Pintura de paragolpes trasero y difuminado lateral"
           },
           "inspection": {
             "Parte trasera|||Paragolpes trasero": {"status": "danado", "works": ["Pintura", "Reparar"], "note": "Masillado plástico y pintura bicapa.", "photos": []},
             "Lado derecho|||Guardabarros trasero derecho": {"status": "danado", "works": ["Pintura", "Pulido"], "note": "Barnizado y pulido de integración.", "photos": []}
           },
           "quote": [
             {"id": "d10-l1", "source": "inspection", "pieceKey": "Parte trasera|||Paragolpes trasero", "piece": "Paragolpes trasero", "area": "Parte trasera", "workType": "Pintura", "unit": "paño", "qty": 1.5, "price": 84000, "desc": "Paragolpes trasero · Pintura"},
             {"id": "d10-l2", "source": "inspection", "pieceKey": "Lado derecho|||Guardabarros trasero derecho", "piece": "Guardabarros trasero derecho", "area": "Lado derecho", "workType": "Pintura", "unit": "paño", "qty": 1, "price": 84000, "desc": "Guardabarros trasero derecho · Pintura"}
           ],
           "summaryBudget": {"chapaDays": "", "chapaDayPrice": "", "pinturaPanels": 2.5, "pinturaPanelPrice": 84000},
           "document": {
             "date": "2026-11-04",
             "validDays": 15,
             "paintType": "Bicapa",
             "terms": "Unidad entregada con lustrado de terminación.",
             "observations": "Unidad entregada con lustrado de terminación."
           }
         }'::jsonb
   WHERE id = 'e91c1ebe-deb5-4da4-ab24-1203846de5a1'
     AND workshop_id = v_workshop_id
     AND job_number = 'DEMO-0010';

  -- DEMO-0011: Agustín Morales — Renault Kangoo 2018 — AD 319 GF
  UPDATE public.jobs
     SET status = 'Aprobado',
         customer_name = 'Agustín Morales',
         vehicle_plate = 'AD 319 GF',
         updated_at = timezone('utc', now()),
         payload = '{
           "id": "7b9124be-c0f1-4699-8329-2128f82661c2",
           "number": "DEMO-0011",
           "demo": true,
           "status": "Aprobado",
           "budgetMode": "detailed",
           "paintType": "Bicapa",
           "area": "Lado derecho",
           "discount": 0,
           "tax": 21,
           "customParts": {},
           "generalNote": "En cabina de pintura.",
           "observations": "Reparación de puerta lateral corrediza y pintura",
           "syncStatus": "synced",
           "customer": {"name": "Agustín Morales", "phone": "+54 9 11 5555-0111", "email": "agustin.morales@demo-taller.invalid"},
           "vehicle": {"make": "Renault", "model": "Kangoo", "plate": "AD 319 GF", "year": 2018, "color": "Blanco Glaciar", "mileage": 134200},
           "rec": {
             "cliente": "Agustín Morales",
             "telefono": "+54 9 11 5555-0111",
             "email": "agustin.morales@demo-taller.invalid",
             "patente": "AD 319 GF",
             "marca": "Renault",
             "modelo": "Kangoo",
             "anio": "2018",
             "color": "Blanco Glaciar",
             "vin": "8A1KC0000JL100111",
             "km": "134200",
             "seguro": "Mapfre Seguros",
             "siniestro": "SIN-2026-8891",
             "pintura": "Bicapa",
             "fecha": "2026-11-11",
             "dano": "Hundimiento en panel lateral derecho y regulación de corredera.",
             "obs": "Reparación de puerta lateral corrediza y pintura"
           },
           "inspection": {
             "Lado derecho|||Puerta trasera derecha": {"status": "danado", "works": ["Chapa", "Pintura"], "note": "Desabollado de portón lateral corredizo y alineación de guías.", "photos": []}
           },
           "quote": [
             {"id": "d11-l1", "source": "inspection", "pieceKey": "Lado derecho|||Puerta trasera derecha", "piece": "Puerta trasera derecha", "area": "Lado derecho", "workType": "Chapa", "unit": "día", "qty": 2, "price": 48000, "desc": "Puerta trasera derecha · Chapa"},
             {"id": "d11-l2", "source": "inspection", "pieceKey": "Lado derecho|||Puerta trasera derecha", "piece": "Puerta trasera derecha", "area": "Lado derecho", "workType": "Pintura", "unit": "paño", "qty": 2, "price": 80000, "desc": "Puerta trasera derecha · Pintura"}
           ],
           "summaryBudget": {"chapaDays": 2, "chapaDayPrice": 48000, "pinturaPanels": 2, "pinturaPanelPrice": 80000},
           "document": {
             "date": "2026-11-11",
             "validDays": 15,
             "paintType": "Bicapa",
             "terms": "Incluye regulación de rodamientos de puerta corrediza.",
             "observations": "Incluye regulación de rodamientos de puerta corrediza."
           }
         }'::jsonb
   WHERE id = '7b9124be-c0f1-4699-8329-2128f82661c2'
     AND workshop_id = v_workshop_id
     AND job_number = 'DEMO-0011';

  -- DEMO-0012: Julieta Giménez — Volkswagen Polo 2021 — AE 508 TR
  UPDATE public.jobs
     SET status = 'Aprobado',
         customer_name = 'Julieta Giménez',
         vehicle_plate = 'AE 508 TR',
         updated_at = timezone('utc', now()),
         payload = '{
           "id": "274db80a-9970-4ce3-8f6b-01d5e265756f",
           "number": "DEMO-0012",
           "demo": true,
           "status": "Aprobado",
           "budgetMode": "summary",
           "paintType": "Bicapa",
           "area": "Lado izquierdo",
           "discount": 0,
           "tax": 21,
           "customParts": {},
           "generalNote": "Turno asignado para ingreso a taller el lunes.",
           "observations": "Reparación de puerta delantera izquierda y pintura",
           "syncStatus": "synced",
           "customer": {"name": "Julieta Giménez", "phone": "+54 9 11 5555-0112", "email": "julieta.gimenez@demo-taller.invalid"},
           "vehicle": {"make": "Volkswagen", "model": "Polo", "plate": "AE 508 TR", "year": 2021, "color": "Gris Platino", "mileage": 41700},
           "rec": {
             "cliente": "Julieta Giménez",
             "telefono": "+54 9 11 5555-0112",
             "email": "julieta.gimenez@demo-taller.invalid",
             "patente": "AE 508 TR",
             "marca": "Volkswagen",
             "modelo": "Polo",
             "anio": "2021",
             "color": "Gris Platino",
             "vin": "9BWAG5BZ0MP200112",
             "km": "41700",
             "seguro": "Río Uruguay Seguros",
             "siniestro": "SIN-2026-9034",
             "pintura": "Bicapa",
             "fecha": "2026-11-14",
             "dano": "Abolladura en puerta delantera izquierda y carcasa de espejo retrovisor.",
             "obs": "Reparación de puerta delantera izquierda y pintura"
           },
           "inspection": {
             "Lado izquierdo|||Puerta delantera izquierda": {"status": "danado", "works": ["Chapa", "Pintura"], "note": "Desabollado de panel y pintura bicapa completa.", "photos": []},
             "Lado izquierdo|||Espejo izquierdo": {"status": "danado", "works": ["Pintura"], "note": "Pintura de cacha de espejo retrovisor.", "photos": []}
           },
           "quote": [
             {"id": "d12-l1", "source": "inspection", "pieceKey": "Lado izquierdo|||Puerta delantera izquierda", "piece": "Puerta delantera izquierda", "area": "Lado izquierdo", "workType": "Chapa", "unit": "día", "qty": 1.5, "price": 50000, "desc": "Puerta delantera izquierda · Chapa"},
             {"id": "d12-l2", "source": "inspection", "pieceKey": "Lado izquierdo|||Puerta delantera izquierda", "piece": "Puerta delantera izquierda", "area": "Lado izquierdo", "workType": "Pintura", "unit": "paño", "qty": 1.5, "price": 85000, "desc": "Puerta delantera izquierda · Pintura"},
             {"id": "d12-l3", "source": "inspection", "pieceKey": "Lado izquierdo|||Espejo izquierdo", "piece": "Espejo izquierdo", "area": "Lado izquierdo", "workType": "Pintura", "unit": "paño", "qty": 0.5, "price": 85000, "desc": "Espejo izquierdo · Pintura"}
           ],
           "summaryBudget": {"chapaDays": 1.5, "chapaDayPrice": 50000, "pinturaPanels": 2, "pinturaPanelPrice": 85000},
           "document": {
             "date": "2026-11-14",
             "validDays": 15,
             "paintType": "Bicapa",
             "terms": "Presupuesto totalizado aprobado para orden de reparación.",
             "observations": "Presupuesto totalizado aprobado para orden de reparación."
           }
         }'::jsonb
   WHERE id = '274db80a-9970-4ce3-8f6b-01d5e265756f'
     AND workshop_id = v_workshop_id
     AND job_number = 'DEMO-0012';

  -- DEMO-0013: Tomás Navarro — Jeep Renegade 2021 — AE 862 CX
  UPDATE public.jobs
     SET status = 'Enviado',
         customer_name = 'Tomás Navarro',
         vehicle_plate = 'AE 862 CX',
         updated_at = timezone('utc', now()),
         payload = '{
           "id": "9753340e-4425-42a6-bec1-abb9e896581c",
           "number": "DEMO-0013",
           "demo": true,
           "status": "Enviado",
           "budgetMode": "detailed",
           "paintType": "Bicapa",
           "area": "Lado derecho",
           "discount": 0,
           "tax": 21,
           "customParts": {},
           "generalNote": "Presupuesto enviado al cliente por WhatsApp.",
           "observations": "Reparación de guardabarros trasero y pintura",
           "syncStatus": "synced",
           "customer": {"name": "Tomás Navarro", "phone": "+54 9 11 5555-0113", "email": "tomas.navarro@demo-taller.invalid"},
           "vehicle": {"make": "Jeep", "model": "Renegade", "plate": "AE 862 CX", "year": 2021, "color": "Verde Recon", "mileage": 54100},
           "rec": {
             "cliente": "Tomás Navarro",
             "telefono": "+54 9 11 5555-0113",
             "email": "tomas.navarro@demo-taller.invalid",
             "patente": "AE 862 CX",
             "marca": "Jeep",
             "modelo": "Renegade",
             "anio": "2021",
             "color": "Verde Recon",
             "vin": "988611100MK300113",
             "km": "54100",
             "seguro": "Patronal Seguros",
             "siniestro": "SIN-2026-9210",
             "pintura": "Bicapa",
             "fecha": "2026-11-14",
             "dano": "Abolladura en guardabarros trasero derecho y moldura de pasarrueda.",
             "obs": "Reparación de guardabarros trasero y pintura"
           },
           "inspection": {
             "Lado derecho|||Guardabarros trasero derecho": {"status": "danado", "works": ["Chapa", "Pintura"], "note": "Conformado de chapa y aplicación de bicapa.", "photos": []}
           },
           "quote": [
             {"id": "d13-l1", "source": "inspection", "pieceKey": "Lado derecho|||Guardabarros trasero derecho", "piece": "Guardabarros trasero derecho", "area": "Lado derecho", "workType": "Chapa", "unit": "día", "qty": 2, "price": 52000, "desc": "Guardabarros trasero derecho · Chapa"},
             {"id": "d13-l2", "source": "inspection", "pieceKey": "Lado derecho|||Guardabarros trasero derecho", "piece": "Guardabarros trasero derecho", "area": "Lado derecho", "workType": "Pintura", "unit": "paño", "qty": 1.5, "price": 86000, "desc": "Guardabarros trasero derecho · Pintura"}
           ],
           "summaryBudget": {"chapaDays": 2, "chapaDayPrice": 52000, "pinturaPanels": 1.5, "pinturaPanelPrice": 86000},
           "document": {
             "date": "2026-11-14",
             "validDays": 15,
             "paintType": "Bicapa",
             "terms": "Incluye clips de sujeción de moldura de pasarrueda.",
             "observations": "Incluye clips de sujeción de moldura de pasarrueda."
           }
         }'::jsonb
   WHERE id = '9753340e-4425-42a6-bec1-abb9e896581c'
     AND workshop_id = v_workshop_id
     AND job_number = 'DEMO-0013';

  -- DEMO-0014: Lucía Cabrera — Nissan Kicks 2022 — AF 615 ZN
  UPDATE public.jobs
     SET status = 'Aprobado',
         customer_name = 'Lucía Cabrera',
         vehicle_plate = 'AF 615 ZN',
         updated_at = timezone('utc', now()),
         payload = '{
           "id": "b8d24b65-a83b-4af0-a675-6b5ec222d923",
           "number": "DEMO-0014",
           "demo": true,
           "status": "Aprobado",
           "budgetMode": "detailed",
           "paintType": "Tricapa",
           "area": "Techo",
           "discount": 0,
           "tax": 21,
           "customParts": {},
           "generalNote": "Colorimetría perlada verificada con probeta.",
           "observations": "Reparación de techo y pintura tricapa",
           "syncStatus": "synced",
           "customer": {"name": "Lucía Cabrera", "phone": "+54 9 11 5555-0114", "email": "lucia.cabrera@demo-taller.invalid"},
           "vehicle": {"make": "Nissan", "model": "Kicks", "plate": "AF 615 ZN", "year": 2022, "color": "Blanco Perlado", "mileage": 29800},
           "rec": {
             "cliente": "Lucía Cabrera",
             "telefono": "+54 9 11 5555-0114",
             "email": "lucia.cabrera@demo-taller.invalid",
             "patente": "AF 615 ZN",
             "marca": "Nissan",
             "modelo": "Kicks",
             "anio": "2022",
             "color": "Blanco Perlado",
             "vin": "94DFCAP15NB400114",
             "km": "29800",
             "seguro": "SMG Seguros",
             "siniestro": "SIN-2026-9518",
             "pintura": "Tricapa",
             "fecha": "2026-11-15",
             "dano": "Abolladura suave en techo y parante delantero derecho por caída de rama.",
             "obs": "Reparación de techo y pintura tricapa"
           },
           "inspection": {
             "Techo|||Techo": {"status": "danado", "works": ["Chapa", "Pintura"], "note": "Desabollado de panel de techo y aplicación de sistema tricapa.", "photos": []}
           },
           "quote": [
             {"id": "d14-l1", "source": "inspection", "pieceKey": "Techo|||Techo", "piece": "Techo", "area": "Techo", "workType": "Chapa", "unit": "día", "qty": 2.5, "price": 54000, "desc": "Techo · Chapa"},
             {"id": "d14-l2", "source": "inspection", "pieceKey": "Techo|||Techo", "piece": "Techo", "area": "Techo", "workType": "Pintura", "unit": "paño", "qty": 2.5, "price": 95000, "desc": "Techo · Pintura"}
           ],
           "summaryBudget": {"chapaDays": 2.5, "chapaDayPrice": 54000, "pinturaPanels": 2.5, "pinturaPanelPrice": 95000},
           "document": {
             "date": "2026-11-15",
             "validDays": 15,
             "paintType": "Tricapa",
             "terms": "Incluye desmontaje preventivo de tapizado interior de techo.",
             "observations": "Incluye desmontaje preventivo de tapizado interior de techo."
           }
         }'::jsonb
   WHERE id = 'b8d24b65-a83b-4af0-a675-6b5ec222d923'
     AND workshop_id = v_workshop_id
     AND job_number = 'DEMO-0014';

  -- DEMO-0015: Gonzalo Benítez — Ford EcoSport 2022 — AF 439 KL
  UPDATE public.jobs
     SET status = 'Borrador',
         customer_name = 'Gonzalo Benítez',
         vehicle_plate = 'AF 439 KL',
         updated_at = timezone('utc', now()),
         payload = '{
           "id": "1272d061-c94b-46bb-8834-4c653e37ce6b",
           "number": "DEMO-0015",
           "demo": true,
           "status": "Borrador",
           "budgetMode": "detailed",
           "paintType": "Bicapa",
           "area": "Parte delantera",
           "discount": 0,
           "tax": 21,
           "customParts": {},
           "generalNote": "Inspección inicial completada en recepción.",
           "observations": "Presupuesto de chapa y pintura lateral derecho",
           "syncStatus": "synced",
           "customer": {"name": "Gonzalo Benítez", "phone": "+54 9 11 5555-0115", "email": "gonzalo.benitez@demo-taller.invalid"},
           "vehicle": {"make": "Ford", "model": "EcoSport", "plate": "AF 439 KL", "year": 2022, "color": "Azul Belice", "mileage": 37500},
           "rec": {
             "cliente": "Gonzalo Benítez",
             "telefono": "+54 9 11 5555-0115",
             "email": "gonzalo.benitez@demo-taller.invalid",
             "patente": "AF 439 KL",
             "marca": "Ford",
             "modelo": "EcoSport",
             "anio": "2022",
             "color": "Azul Belice",
             "vin": "9BFZB55P0NB500115",
             "km": "37500",
             "seguro": "Federación Patronal",
             "siniestro": "SIN-2026-9840",
             "pintura": "Bicapa",
             "fecha": "2026-11-16",
             "dano": "Abolladura en guardabarros delantero derecho y roce en puerta delantera derecha.",
             "obs": "Presupuesto de chapa y pintura lateral derecho"
           },
           "inspection": {
             "Parte delantera|||Guardabarros delantero derecho": {"status": "danado", "works": ["Chapa", "Pintura"], "note": "Conformado de arco de guardabarros y pintura bicapa.", "photos": []},
             "Lado derecho|||Puerta delantera derecha": {"status": "danado", "works": ["Pintura", "Pulido"], "note": "Difuminado de color y barnizado.", "photos": []}
           },
           "quote": [
             {"id": "d15-l1", "source": "inspection", "pieceKey": "Parte delantera|||Guardabarros delantero derecho", "piece": "Guardabarros delantero derecho", "area": "Parte delantera", "workType": "Chapa", "unit": "día", "qty": 1.5, "price": 50000, "desc": "Guardabarros delantero derecho · Chapa"},
             {"id": "d15-l2", "source": "inspection", "pieceKey": "Parte delantera|||Guardabarros delantero derecho", "piece": "Guardabarros delantero derecho", "area": "Parte delantera", "workType": "Pintura", "unit": "paño", "qty": 1, "price": 84000, "desc": "Guardabarros delantero derecho · Pintura"},
             {"id": "d15-l3", "source": "inspection", "pieceKey": "Lado derecho|||Puerta delantera derecha", "piece": "Puerta delantera derecha", "area": "Lado derecho", "workType": "Pintura", "unit": "paño", "qty": 1, "price": 84000, "desc": "Puerta delantera derecha · Pintura"}
           ],
           "summaryBudget": {"chapaDays": 1.5, "chapaDayPrice": 50000, "pinturaPanels": 2, "pinturaPanelPrice": 84000},
           "document": {
             "date": "2026-11-16",
             "validDays": 15,
             "paintType": "Bicapa",
             "terms": "Presupuesto sujeto a verificación de soportes internos tras desarme.",
             "observations": "Presupuesto sujeto a verificación de soportes internos tras desarme."
           }
         }'::jsonb
   WHERE id = '1272d061-c94b-46bb-8834-4c653e37ce6b'
     AND workshop_id = v_workshop_id
     AND job_number = 'DEMO-0015';

  -- ===========================================================================
  -- 5. ACTUALIZAR LOS 20 PRODUCTOS DE STOCK DEMO DEL TALLER
  --    Conserva id, workshop_id, quantity y archived_at para no alterar
  --    ningún movimiento de stock histórico.
  --    No inventa marcas comerciales (brand = NULL) ni SKU oficiales (sku = NULL).
  -- ===========================================================================

  -- 1. Primer aparejo gris 2K — 1 L (DEMO-SKU-001)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Primer aparejo gris 2K — 1 L',
         category = 'Pintura y recubrimientos',
         brand = NULL,
         description = 'Imprimación rellenadora de dos componentes de alto espesor para preparación de paneles.',
         unit = 'litro',
         minimum_quantity = 4,
         purchase_price = 28500,
         sale_price = 0,
         location = 'Estante A-1 · Cabina',
         notes = 'Uso con catalizador 4:1'
   WHERE id = 'f37ed2cd-80c2-4e3c-b7b5-e0db0a623f45'
     AND workshop_id = v_workshop_id;

  -- 2. Masilla poliéster universal — 1 kg (DEMO-SKU-002)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Masilla poliéster universal — 1 kg',
         category = 'Masillas y abrasivos',
         brand = NULL,
         description = 'Masilla de relleno liviana de fácil lijado para nivelación de superficies de chapa.',
         unit = 'kg',
         minimum_quantity = 5,
         purchase_price = 16500,
         sale_price = 0,
         location = 'Estante B-1 · Preparación',
         notes = 'Incluye peróxido endurecedor'
   WHERE id = 'a5086443-6d69-45fb-b6ea-6b4951a28571'
     AND workshop_id = v_workshop_id;

  -- 3. Barniz transparente 2K — 1 L (DEMO-SKU-003)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Barniz transparente 2K — 1 L',
         category = 'Pintura y recubrimientos',
         brand = NULL,
         description = 'Barniz acrílico poliuretánico de altos sólidos con filtro UV para sistemas bicapa y tricapa.',
         unit = 'litro',
         minimum_quantity = 4,
         purchase_price = 34000,
         sale_price = 0,
         location = 'Estante A-2 · Cabina',
         notes = 'Terminación de alto brillo'
   WHERE id = '257c987d-9e5b-4f98-b1c1-b0f92123d79d'
     AND workshop_id = v_workshop_id;

  -- 4. Catalizador para barniz 2K — 500 ml (DEMO-SKU-004)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Catalizador para barniz 2K — 500 ml',
         category = 'Pintura y recubrimientos',
         brand = NULL,
         description = 'Endurecedor isocianato de secado medio para barniz transparente 2K.',
         unit = 'unidad',
         minimum_quantity = 4,
         purchase_price = 19000,
         sale_price = 0,
         location = 'Estante A-2 · Cabina',
         notes = 'Conservar bien cerrado en ambiente seco'
   WHERE id = 'dd33ad11-a4ff-4a25-b602-4989b46647ad'
     AND workshop_id = v_workshop_id;

  -- 5. Diluyente acrílico — 1 L (DEMO-SKU-005)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Diluyente acrílico — 1 L',
         category = 'Pintura y recubrimientos',
         brand = NULL,
         description = 'Diluyente balanceado de evaporación media para ajuste de viscosidad en bases y aparejos.',
         unit = 'litro',
         minimum_quantity = 6,
         purchase_price = 11500,
         sale_price = 0,
         location = 'Armario inflamables · Sector 1',
         notes = 'Evaporación estándar 20-25 °C'
   WHERE id = 'bdeb83a2-0e27-454c-952e-fd9e3158547c'
     AND workshop_id = v_workshop_id;

  -- 6. Disco de lija P80 — 150 mm (DEMO-SKU-006)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Disco de lija P80 — 150 mm',
         category = 'Masillas y abrasivos',
         brand = NULL,
         description = 'Disco abrasivo con velcro y 6 perforaciones para desbaste inicial de masilla y chapa.',
         unit = 'unidad',
         minimum_quantity = 15,
         purchase_price = 1200,
         sale_price = 0,
         location = 'Gaveta C-1 · Lijado',
         notes = 'Para lijadora roto-orbital 150 mm'
   WHERE id = 'a4375b43-f9dd-46cb-911f-1124151e54cb'
     AND workshop_id = v_workshop_id;

  -- 7. Disco de lija P180 — 150 mm (DEMO-SKU-007)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Disco de lija P180 — 150 mm',
         category = 'Masillas y abrasivos',
         brand = NULL,
         description = 'Disco abrasivo con velcro para afinado de masilla poliéster previo al aparejo.',
         unit = 'unidad',
         minimum_quantity = 15,
         purchase_price = 1200,
         sale_price = 0,
         location = 'Gaveta C-2 · Lijado',
         notes = 'Para lijadora roto-orbital 150 mm'
   WHERE id = 'baf9ed9e-68ce-4cf5-a915-cd3a298389db'
     AND workshop_id = v_workshop_id;

  -- 8. Disco de lija P400 — 150 mm (DEMO-SKU-008)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Disco de lija P400 — 150 mm',
         category = 'Masillas y abrasivos',
         brand = NULL,
         description = 'Disco abrasivo fino para lijado de primer aparejo antes de aplicar base color.',
         unit = 'unidad',
         minimum_quantity = 15,
         purchase_price = 1200,
         sale_price = 0,
         location = 'Gaveta C-3 · Lijado',
         notes = 'Para lijadora roto-orbital 150 mm'
   WHERE id = 'b611d1f1-1c6a-4f0d-acc2-c6fe7009dda3'
     AND workshop_id = v_workshop_id;

  -- 9. Cinta de enmascarar automotor — 24 mm (DEMO-SKU-009)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Cinta de enmascarar automotor — 24 mm',
         category = 'Consumibles',
         brand = NULL,
         description = 'Cinta crepada resistente a temperatura de cabina (hasta 80 °C) sin dejar residuo adhesivo.',
         unit = 'rollo',
         minimum_quantity = 10,
         purchase_price = 3800,
         sale_price = 0,
         location = 'Estante D-1 · Enmascarado',
         notes = 'Rollo de 50 metros'
   WHERE id = '5b003a22-7daf-4715-83d7-8c7fc2f96a3a'
     AND workshop_id = v_workshop_id;

  -- 10. Film de enmascarado automotor (DEMO-SKU-010)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Film de enmascarado automotor',
         category = 'Consumibles',
         brand = NULL,
         description = 'Bobina de film plástico con tratamiento electrostático para adherencia de pulverizado.',
         unit = 'rollo',
         minimum_quantity = 2,
         purchase_price = 29000,
         sale_price = 0,
         location = 'Estante D-2 · Enmascarado',
         notes = 'Ancho desplegado 4 m'
   WHERE id = '34591da9-fc43-4f47-b2f5-d83f0754accf'
     AND workshop_id = v_workshop_id;

  -- 11. Paño de microfibra (DEMO-SKU-011)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Paño de microfibra',
         category = 'Consumibles',
         brand = NULL,
         description = 'Paño de microfibra de corte láser sin costura para retiro de pulimentos y lustrado final.',
         unit = 'unidad',
         minimum_quantity = 8,
         purchase_price = 3200,
         sale_price = 0,
         location = 'Gaveta E-1 · Detailing',
         notes = '40 x 40 cm · 380 GSM'
   WHERE id = '276743a7-7b32-46b2-815c-1dd6ce349270'
     AND workshop_id = v_workshop_id;

  -- 12. Desengrasante antisilicona — 1 L (DEMO-SKU-012)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Desengrasante antisilicona — 1 L',
         category = 'Pintura y recubrimientos',
         brand = NULL,
         description = 'Limpiador de superficies para eliminar ceras, grasas y siliconas antes de pintar.',
         unit = 'litro',
         minimum_quantity = 4,
         purchase_price = 12800,
         sale_price = 0,
         location = 'Estante A-3 · Cabina',
         notes = 'Aplicar con paño libre de pelusa'
   WHERE id = '958bf13a-b1c9-4af1-9a1e-54c44756b33f'
     AND workshop_id = v_workshop_id;

  -- 13. Pulimento de corte — 1 kg (DEMO-SKU-013)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Pulimento de corte — 1 kg',
         category = 'Masillas y abrasivos',
         brand = NULL,
         description = 'Pasta abrasiva libre de siliconas para eliminar marcas de lija P1500/P2000 sobre barniz curado.',
         unit = 'kg',
         minimum_quantity = 3,
         purchase_price = 36500,
         sale_price = 0,
         location = 'Gaveta E-2 · Lustrado',
         notes = 'Apto para boina de lana o espuma dura'
   WHERE id = 'cf0f4799-8778-46f2-8e39-8971129f2c48'
     AND workshop_id = v_workshop_id;

  -- 14. Cinta de enmascarar automotor — 48 mm (DEMO-SKU-014, archivado de demostración)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Cinta de enmascarar automotor — 48 mm',
         category = 'Consumibles',
         brand = NULL,
         description = 'Cinta crepada ancha para protección de molduras y cristales en cabina.',
         unit = 'rollo',
         minimum_quantity = 6,
         purchase_price = 7400,
         sale_price = 0,
         location = 'Estante D-1 · Enmascarado',
         notes = 'Rollo de 50 metros'
   WHERE id = '0a28179c-1a04-4bc2-8bce-64f6c5c12ec3'
     AND workshop_id = v_workshop_id;

  -- 15. Guantes de nitrilo (DEMO-SKU-015)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Guantes de nitrilo',
         category = 'Seguridad e higiene',
         brand = NULL,
         description = 'Caja de guantes descartables de nitrilo resistentes a solventes y pinturas.',
         unit = 'caja',
         minimum_quantity = 4,
         purchase_price = 14500,
         sale_price = 0,
         location = 'Estante F-1 · Seguridad',
         notes = 'Caja por 100 unidades sin polvo'
   WHERE id = 'f206acbb-a98e-4a81-9c58-e4b000eec694'
     AND workshop_id = v_workshop_id;

  -- 16. Kit de reparación de paragolpes (DEMO-SKU-016)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Kit de reparación de paragolpes',
         category = 'Carrocería',
         brand = NULL,
         description = 'Conjunto de malla de refuerzo inoxidable y adhesivo bicomponente estructural para plásticos.',
         unit = 'kit',
         minimum_quantity = 2,
         purchase_price = 31000,
         sale_price = 0,
         location = 'Estante B-2 · Plásticos',
         notes = 'Apto para PP, EPDM y ABS'
   WHERE id = '8f185922-543e-4b16-96d6-eb521bcfe308'
     AND workshop_id = v_workshop_id;

  -- 17. Masilla plástica flexible para paragolpes — 500 g (DEMO-SKU-017)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Masilla plástica flexible para paragolpes — 500 g',
         category = 'Masillas y abrasivos',
         brand = NULL,
         description = 'Masilla elástica formulada para piezas plásticas deformables y paragolpes.',
         unit = 'unidad',
         minimum_quantity = 3,
         purchase_price = 14800,
         sale_price = 0,
         location = 'Estante B-2 · Plásticos',
         notes = 'Alta adherencia y flexibilidad'
   WHERE id = '01ce7fe6-6d6c-4058-a0c0-3b8a5a06f003'
     AND workshop_id = v_workshop_id;

  -- 18. Promotor de adherencia para plásticos — 1 L (DEMO-SKU-018)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Promotor de adherencia para plásticos — 1 L',
         category = 'Pintura y recubrimientos',
         brand = NULL,
         description = 'Imprimación transparente monocomponente para asegurar anclaje sobre polipropileno.',
         unit = 'litro',
         minimum_quantity = 3,
         purchase_price = 17900,
         sale_price = 0,
         location = 'Estante A-3 · Cabina',
         notes = 'Listo para aplicar a soplete'
   WHERE id = '3388758b-b0e9-487a-a480-76ae84a45fa5'
     AND workshop_id = v_workshop_id;

  -- 19. Sellador poliuretánico de carrocería — 310 ml (DEMO-SKU-019)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Sellador poliuretánico de carrocería — 310 ml',
         category = 'Carrocería',
         brand = NULL,
         description = 'Cartucho de sellador elástico pintable para uniones de paneles, guardabarros y pisos.',
         unit = 'unidad',
         minimum_quantity = 5,
         purchase_price = 13200,
         sale_price = 0,
         location = 'Estante B-3 · Chapa',
         notes = 'Pintable húmedo sobre húmedo'
   WHERE id = '492d8f6a-04d0-4f1b-ba4e-ecb046d1b02d'
     AND workshop_id = v_workshop_id;

  -- 20. Paño atrapapolvo barnizado (DEMO-SKU-020)
  UPDATE public.stock_items
     SET sku = NULL,
         name = 'Paño atrapapolvo barnizado',
         category = 'Consumibles',
         brand = NULL,
         description = 'Gasa impregnada para recolección de partículas en cabina antes de aplicar color o barniz.',
         unit = 'unidad',
         minimum_quantity = 10,
         purchase_price = 2100,
         sale_price = 0,
         location = 'Estante A-1 · Cabina',
         notes = 'Envase individual sellado'
   WHERE id = '51815abe-09f6-4aca-8ea2-f895ca9c75e2'
     AND workshop_id = v_workshop_id;

  -- ===========================================================================
  -- 6. ELIMINAR COMPATIBILIDADES FICTICIAS NO VERIFICADAS DEL TALLER DEMO
  --    (Los productos del taller demo son consumibles de chapa y pintura, y la
  --    consigna prohíbe inventar compatibilidades de repuestos sin verificarlas).
  -- ===========================================================================
  DELETE FROM public.part_compatibility
   WHERE workshop_id = v_workshop_id
     AND stock_item_id IN (
       'f37ed2cd-80c2-4e3c-b7b5-e0db0a623f45',
       'a5086443-6d69-45fb-b6ea-6b4951a28571',
       '257c987d-9e5b-4f98-b1c1-b0f92123d79d',
       'dd33ad11-a4ff-4a25-b602-4989b46647ad',
       'bdeb83a2-0e27-454c-952e-fd9e3158547c',
       'a4375b43-f9dd-46cb-911f-1124151e54cb',
       'baf9ed9e-68ce-4cf5-a915-cd3a298389db',
       'b611d1f1-1c6a-4f0d-acc2-c6fe7009dda3',
       '5b003a22-7daf-4715-83d7-8c7fc2f96a3a',
       '34591da9-fc43-4f47-b2f5-d83f0754accf'
     );

  -- ===========================================================================
  -- 7. NORMALIZAR GLOSAS DE DEMOSTRACIÓN EN MOVIMIENTOS DE STOCK DEL TALLER DEMO
  --    Sin eliminar ni alterar cantidades, fechas ni saldos.
  -- ===========================================================================
  UPDATE public.stock_movements
     SET reason = 'Ingreso inicial de inventario'
   WHERE workshop_id = v_workshop_id
     AND reason = 'Stock inicial de demostración';

  UPDATE public.stock_movements
     SET reason = 'Consumo registrado en orden de taller'
   WHERE workshop_id = v_workshop_id
     AND reason = 'Consumo en trabajo de prueba';

END $$;

COMMIT;
