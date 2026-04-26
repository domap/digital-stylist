-- Digital Stylist — PostgreSQL schema for MCP-backed domains (customer, appointment, associate).
-- Apply:
--   digital-stylist-pg-bootstrap --dev
--   or: psql "$STYLIST_PG_DSN" -v ON_ERROR_STOP=1 -f digital_stylist/infra/postgres/schema.sql
--
-- Zero-trust posture (operational):
--   * Use a non-superuser role (e.g. stylist_app). FORCE ROW LEVEL SECURITY so even the owner obeys RLS.
--   * TLS: set STYLIST_PG_SSLMODE=require (default in staging/production via app settings).
--   * Tenant + subject are enforced via session GUCs set by MCP tools each transaction (never trust tool args
--     for secrets; tenant_id comes from STYLIST_PG_TENANT_ID in the MCP process environment).
--   * Bind validated end-user identity at the HTTP/gateway layer and pass only that identity into graph
--     state; MCP subprocess inherits tenant from env. For stronger assurance, add signed JWT verification
--     in the worker before invoking the graph.

CREATE SCHEMA IF NOT EXISTS stylist;

CREATE TABLE IF NOT EXISTS stylist.customers (
    tenant_id text NOT NULL,
    user_id text NOT NULL,
    profile_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS stylist.associates (
    tenant_id text NOT NULL,
    associate_id text NOT NULL,
    store_id text NOT NULL,
    display_name text NOT NULL,
    email text,
    phone text,
    skills_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    active boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, associate_id)
);

CREATE INDEX IF NOT EXISTS associates_store_idx ON stylist.associates (tenant_id, store_id) WHERE active;

CREATE TABLE IF NOT EXISTS stylist.appointments (
    tenant_id text NOT NULL,
    booking_id text NOT NULL,
    store_id text NOT NULL,
    slot_label text NOT NULL,
    purpose text NOT NULL DEFAULT 'styling_consultation',
    status text NOT NULL DEFAULT 'confirmed',
    customer_user_id text NOT NULL,
    associate_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, booking_id)
);

CREATE INDEX IF NOT EXISTS appointments_customer_idx
    ON stylist.appointments (tenant_id, customer_user_id);

ALTER TABLE stylist.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stylist.customers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_isolation ON stylist.customers;
CREATE POLICY customers_isolation ON stylist.customers
    FOR ALL
    USING (
        tenant_id = current_setting('app.tenant_id', true)
        AND user_id = current_setting('app.subject_user_id', true)
    )
    WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        AND user_id = current_setting('app.subject_user_id', true)
    );

-- Internal read (worker stylist routes): session GUCs app.tenant_id + app.internal_api='true' (via set_config in app).
DROP POLICY IF EXISTS customers_internal_read ON stylist.customers;
CREATE POLICY customers_internal_read ON stylist.customers
    FOR SELECT
    USING (
        tenant_id = current_setting('app.tenant_id', true)
        AND current_setting('app.internal_api', true) = 'true'
    );

ALTER TABLE stylist.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stylist.appointments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointments_customer_rw ON stylist.appointments;
CREATE POLICY appointments_customer_rw ON stylist.appointments
    FOR ALL
    USING (
        tenant_id = current_setting('app.tenant_id', true)
        AND customer_user_id = current_setting('app.subject_user_id', true)
    )
    WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        AND customer_user_id = current_setting('app.subject_user_id', true)
    );

ALTER TABLE stylist.associates ENABLE ROW LEVEL SECURITY;
ALTER TABLE stylist.associates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS associates_tenant_read ON stylist.associates;
CREATE POLICY associates_tenant_read ON stylist.associates
    FOR SELECT
    USING (tenant_id = current_setting('app.tenant_id', true));

-- Optional seed for local dev (safe to re-run)
INSERT INTO stylist.customers (tenant_id, user_id, profile_json)
VALUES (
    'default',
    'guest',
    '{"user_id": "guest", "sizes": {"tops": "M", "bottoms": "32", "dress": "8"}, "budget_ceiling": 200.0, "preferred_brands": [], "style_feedback": [], "hard_rules": ["Never over budget_ceiling for full outfits unless user opts in."]}'::jsonb
)
ON CONFLICT (tenant_id, user_id) DO NOTHING;

INSERT INTO stylist.associates (tenant_id, associate_id, store_id, display_name, email, skills_json, active)
VALUES (
    'default',
    'as_demo_1',
    'flagship_nyc',
    'Alex Rivera',
    NULL,
    '["formalwear", "denim"]'::jsonb,
    true
)
ON CONFLICT (tenant_id, associate_id) DO NOTHING;

-- Fitting-room holds (Connect → Postgres); Clienteling lists open rows and subscribes to ``pg_notify`` / polls.
CREATE TABLE IF NOT EXISTS stylist.fitting_room_reservations (
    tenant_id text NOT NULL,
    reservation_id uuid NOT NULL DEFAULT gen_random_uuid(),
    store_id text NOT NULL,
    slot_label text NOT NULL,
    customer_user_id text,
    product_ids text[] NOT NULL DEFAULT '{}'::text[],
    total_cost numeric(12, 2) NOT NULL DEFAULT 0,
    notification_channels jsonb NOT NULL DEFAULT '["email"]'::jsonb,
    source text,
    task_status text NOT NULL DEFAULT 'open'
        CHECK (task_status IN ('open', 'in_progress', 'done')),
    claimed_by text,
    claimed_at timestamptz,
    done_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, reservation_id)
);

CREATE INDEX IF NOT EXISTS fitting_room_reservations_tenant_status_created_idx
    ON stylist.fitting_room_reservations (tenant_id, task_status, created_at DESC);

ALTER TABLE stylist.fitting_room_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stylist.fitting_room_reservations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fitting_room_reservations_internal_rw ON stylist.fitting_room_reservations;
CREATE POLICY fitting_room_reservations_internal_rw ON stylist.fitting_room_reservations
    FOR ALL
    USING (
        tenant_id = current_setting('app.tenant_id', true)
        AND current_setting('app.internal_api', true) = 'true'
    )
    WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        AND current_setting('app.internal_api', true) = 'true'
    );

CREATE OR REPLACE FUNCTION stylist.notify_fitting_room_changed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM pg_notify(
        'stylist_fitting_room',
        json_build_object(
            'tenant_id', NEW.tenant_id,
            'reservation_id', NEW.reservation_id::text,
            'task_status', NEW.task_status
        )::text
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_fitting_room_reservations_notify ON stylist.fitting_room_reservations;
CREATE TRIGGER tr_fitting_room_reservations_notify
    AFTER INSERT OR UPDATE OF task_status ON stylist.fitting_room_reservations
    FOR EACH ROW
    EXECUTE FUNCTION stylist.notify_fitting_room_changed();

-- Stylist worker catalog + tenant defaults (no application-layer JSON fallbacks).
CREATE TABLE IF NOT EXISTS stylist.catalog_products (
    tenant_id text NOT NULL,
    product_id text NOT NULL,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    price numeric(12, 2) NOT NULL DEFAULT 0,
    brand text NOT NULL DEFAULT '',
    category text NOT NULL DEFAULT '',
    sizes jsonb NOT NULL DEFAULT '[]'::jsonb,
    colors jsonb NOT NULL DEFAULT '[]'::jsonb,
    fit text NOT NULL DEFAULT '',
    image_asset_name text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, product_id)
);

ALTER TABLE stylist.catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stylist.catalog_products FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_products_internal_read ON stylist.catalog_products;
CREATE POLICY catalog_products_internal_read ON stylist.catalog_products
    FOR SELECT
    USING (
        tenant_id = current_setting('app.tenant_id', true)
        AND current_setting('app.internal_api', true) = 'true'
    );

DROP POLICY IF EXISTS catalog_products_internal_insert ON stylist.catalog_products;
CREATE POLICY catalog_products_internal_insert ON stylist.catalog_products
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        AND current_setting('app.internal_api', true) = 'true'
    );

DROP POLICY IF EXISTS catalog_products_internal_update ON stylist.catalog_products;
CREATE POLICY catalog_products_internal_update ON stylist.catalog_products
    FOR UPDATE
    USING (
        tenant_id = current_setting('app.tenant_id', true)
        AND current_setting('app.internal_api', true) = 'true'
    )
    WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        AND current_setting('app.internal_api', true) = 'true'
    );

CREATE TABLE IF NOT EXISTS stylist.tenant_retail_config (
    tenant_id text NOT NULL PRIMARY KEY,
    config jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stylist.tenant_retail_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE stylist.tenant_retail_config FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_retail_config_internal_read ON stylist.tenant_retail_config;
CREATE POLICY tenant_retail_config_internal_read ON stylist.tenant_retail_config
    FOR SELECT
    USING (
        tenant_id = current_setting('app.tenant_id', true)
        AND current_setting('app.internal_api', true) = 'true'
    );

DROP POLICY IF EXISTS tenant_retail_config_internal_insert ON stylist.tenant_retail_config;
CREATE POLICY tenant_retail_config_internal_insert ON stylist.tenant_retail_config
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        AND current_setting('app.internal_api', true) = 'true'
    );

DROP POLICY IF EXISTS tenant_retail_config_internal_update ON stylist.tenant_retail_config;
CREATE POLICY tenant_retail_config_internal_update ON stylist.tenant_retail_config
    FOR UPDATE
    USING (
        tenant_id = current_setting('app.tenant_id', true)
        AND current_setting('app.internal_api', true) = 'true'
    )
    WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        AND current_setting('app.internal_api', true) = 'true'
    );
