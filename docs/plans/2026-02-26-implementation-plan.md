# Nexas Pro Admin Panel — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build admin panel for order management + stock control, modernize pre-order flow to save directly to Supabase, eliminate spreadsheet dependency.

**Architecture:** 3 standalone HTML pages (admin-login, admin-pedidos, pre-pedido refactored) using Tailwind CDN + vanilla JS + Supabase REST API (anon key + auth session). Supabase RLS protects data.

**Tech Stack:** HTML, Tailwind CSS (CDN), vanilla JavaScript, Supabase (REST API + Auth + RLS)

**Supabase project ref:** `aeepepbqhdvatkmjuoyh`
**Anon key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZXBlcGJxaGR2YXRrbWp1b3loIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE1NTI2MDYsImV4cCI6MjA0NzEyODYwNn0.FcHYzLrFSVHxzEBFAtRRhthVDdljr8IcvbmaYkeu3rY`

**Existing DB state:**
- `products`: 68 rows, has cost/price. IDs 1-70 (with gaps). Same IDs as `estoque_produtos`. Uses `estoque_produtos_id_seq`.
- `customers`: has nome_fantasia, email, telefone, cnpj, endereco fields, role default 'user'
- `preorders`: uuid id, customer_id FK, status (default weird triple-quoted 'preorder'), order_number_int
- `preorder_items`: preorder_id FK, product_id FK (→products), qty, cost, price
- `orders`: uuid id, customer_id FK, status default 'pending', order_number, order_number_int, payment_method, invoice
- `order_items`: order_id FK, product_id FK (→products), qty, cost, price
- `profiles`: 1 admin (raphaas@hotmail.com, role=admin, id=4e2c156d). Note: profiles.id != auth.users.id (b0cf8502)
- `auth.users`: raphaas@hotmail.com exists (id=b0cf8502)
- Function `get_next_order_number()` exists and works across orders+preorders

**Visual identity:** dark bg (#1a1a2e or similar), gold accents (#f9efc7), Tailwind. Product images available in project root as .webp files.

---

## Task 1: DB Schema Changes

**Goal:** Fix preorders status default, add rejection_reason column, fix profiles.id linkage to auth.users, enable RLS on all tables.

**Step 1: Apply migration — fix preorders status default + add rejection_reason**

Use Supabase MCP `apply_migration` with name `fix_preorders_add_rejection`:

```sql
-- Fix the triple-quoted default on preorders.status
ALTER TABLE preorders ALTER COLUMN status SET DEFAULT 'preorder';

-- Add rejection_reason for when admin rejects a preorder
ALTER TABLE preorders ADD COLUMN IF NOT EXISTS rejection_reason text;
```

**Step 2: Apply migration — fix profiles to link with auth.users**

Use `apply_migration` with name `fix_profiles_auth_link`:

```sql
-- Update existing admin profile to match auth.users id
UPDATE profiles SET id = 'b0cf8502-ab6a-4cb6-a858-289605de6d99' WHERE email = 'raphaas@hotmail.com';
```

**Step 3: Apply migration — enable RLS + create policies**

Use `apply_migration` with name `enable_rls_policies`:

```sql
-- Helper function: check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- PRODUCTS: public read, admin write
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_select_public" ON products FOR SELECT USING (true);
CREATE POLICY "products_admin_insert" ON products FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "products_admin_update" ON products FOR UPDATE USING (public.is_admin());
CREATE POLICY "products_admin_delete" ON products FOR DELETE USING (public.is_admin());

-- CUSTOMERS: public insert, admin read/update
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_public_insert" ON customers FOR INSERT WITH CHECK (true);
CREATE POLICY "customers_admin_select" ON customers FOR SELECT USING (public.is_admin());
CREATE POLICY "customers_admin_update" ON customers FOR UPDATE USING (public.is_admin());

-- PREORDERS: public insert, admin full access
ALTER TABLE preorders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "preorders_public_insert" ON preorders FOR INSERT WITH CHECK (true);
CREATE POLICY "preorders_admin_select" ON preorders FOR SELECT USING (public.is_admin());
CREATE POLICY "preorders_admin_update" ON preorders FOR UPDATE USING (public.is_admin());
CREATE POLICY "preorders_admin_delete" ON preorders FOR DELETE USING (public.is_admin());

-- PREORDER_ITEMS: public insert, admin full access
ALTER TABLE preorder_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "preorder_items_public_insert" ON preorder_items FOR INSERT WITH CHECK (true);
CREATE POLICY "preorder_items_admin_select" ON preorder_items FOR SELECT USING (public.is_admin());
CREATE POLICY "preorder_items_admin_update" ON preorder_items FOR UPDATE USING (public.is_admin());
CREATE POLICY "preorder_items_admin_delete" ON preorder_items FOR DELETE USING (public.is_admin());

-- ORDERS: admin only
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_admin_all" ON orders FOR ALL USING (public.is_admin());

-- ORDER_ITEMS: admin only
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_admin_all" ON order_items FOR ALL USING (public.is_admin());

-- PROFILES: admin read own + all admins
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_admin_select" ON profiles FOR SELECT USING (public.is_admin());
```

**Step 4: Verify** — Run `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'` to confirm RLS is enabled.

---

## Task 2: Shared JS Config File

**Goal:** Create a shared config so all HTML pages use same Supabase URL/key and auth helpers.

**File:** Create `/Users/charbellelopes/nexas-sys/supabase-config.js`

```javascript
const SUPABASE_URL = 'https://aeepepbqhdvatkmjuoyh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZXBlcGJxaGR2YXRrbWp1b3loIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE1NTI2MDYsImV4cCI6MjA0NzEyODYwNn0.FcHYzLrFSVHxzEBFAtRRhthVDdljr8IcvbmaYkeu3rY';

// Auth helpers
async function supabaseAuth() {
  // Uses supabase-js loaded via CDN
  const { createClient } = supabase;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// REST API helper with optional auth token
async function supabaseRest(path, options = {}) {
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    'Prefer': options.prefer || 'return=representation',
    ...options.headers
  };
  // If we have a session, add auth header
  const token = localStorage.getItem('sb-access-token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    headers['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// RPC call helper
async function supabaseRpc(fnName, params = {}) {
  const token = localStorage.getItem('sb-access-token');
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`,
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`RPC ${fnName} failed: ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
```

---

## Task 3: Admin Login Page

**File:** Create `/Users/charbellelopes/nexas-sys/admin-login.html`

**Design:**
- Dark background (#1a1a2e), centered card
- Nexas Pro logo/title in gold (#f9efc7)
- Email + password inputs
- Login button, error message area
- Uses Supabase JS CDN for auth (`@supabase/supabase-js@2` via CDN)
- On successful login: store session token in localStorage, redirect to admin-pedidos.html
- On error: show inline error message

**Key implementation details:**
- Load `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>`
- Load `<script src="supabase-config.js"></script>`
- Auth flow:
  ```javascript
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { showError(error.message); return; }
  localStorage.setItem('sb-access-token', data.session.access_token);
  localStorage.setItem('sb-refresh-token', data.session.refresh_token);
  window.location.href = 'admin-pedidos.html';
  ```
- Check if already logged in on page load → redirect to admin-pedidos.html

---

## Task 4: Admin Panel — Shell + Auth Guard + Navigation

**File:** Create `/Users/charbellelopes/nexas-sys/admin-pedidos.html`

**Design:**
- Dark sidebar or top bar with navigation: Pre-pedidos | Pedidos | Estoque
- Header with "Nexas Pro Admin" title + logout button
- Main content area that changes based on active tab
- Auth guard: on load, verify session with Supabase, redirect to login if invalid
- Dark theme (#1a1a2e bg, #f9efc7 accents, white text)

**Key implementation details:**
- Load Supabase JS CDN + supabase-config.js
- Auth guard on load:
  ```javascript
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = 'admin-login.html'; return; }
  localStorage.setItem('sb-access-token', session.access_token);
  ```
- Listen for token refresh:
  ```javascript
  sb.auth.onAuthStateChange((event, session) => {
    if (session) localStorage.setItem('sb-access-token', session.access_token);
    else window.location.href = 'admin-login.html';
  });
  ```
- Tab switching: show/hide div sections, update active tab style
- Logout: `sb.auth.signOut()`, clear localStorage, redirect to login
- All 3 tab content areas (pre-pedidos, pedidos, estoque) as empty divs — filled in subsequent tasks

---

## Task 5: Admin Panel — Pre-pedidos Tab

**Goal:** List preorders with customer info, allow approve/reject.

**Section within admin-pedidos.html** — `<div id="tab-preorders">`

**Data fetch:**
```
GET /rest/v1/preorders?status=eq.preorder&select=*,customers(nome_fantasia,email,telefone),preorder_items(qty,products(nome,categoria))&order=created_at.desc
```

**UI:**
- Card list or table, each preorder shows:
  - Order # (order_number_int), date, customer name, phone, email
  - Expandable item list (product name + qty)
  - Two buttons: "Aprovar" (green) and "Rejeitar" (red)

**Approve flow (JS function `approvePreorder(preorderId)`):**
1. Fetch preorder + preorder_items with product details
2. Check stock: for each item, verify `products.estoque >= qty`. If any insufficient → alert and abort.
3. Call `get_next_order_number` via RPC to get next order number
4. INSERT into `orders`: customer_id, status='approved', order_number_int
5. INSERT into `order_items`: for each preorder_item, copy product_id, qty, cost, price with new order_id
6. UPDATE `products` for each item: `estoque = estoque - qty` (use PATCH with filter)
7. UPDATE `preorders` set status='approved'
8. Show success toast + WhatsApp button

**WhatsApp message generation:**
```javascript
function generateWhatsAppLink(customer, orderNumber, items) {
  const itemList = items.map(i => `• ${i.qty}x ${i.product_name}`).join('\n');
  const msg = `Olá ${customer.nome_fantasia}! 🎉\n\nSeu pedido #${orderNumber} foi aprovado!\n\nItens:\n${itemList}\n\nEquipe Nexas Pro`;
  return `https://wa.me/55${customer.telefone.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`;
}
```

**Reject flow (JS function `rejectPreorder(preorderId)`):**
1. Prompt for rejection reason (modal or inline input)
2. UPDATE `preorders` set status='rejected', rejection_reason=reason
3. Show confirmation toast

---

## Task 6: Admin Panel — Pedidos Tab

**Goal:** List approved/active orders with status management.

**Section within admin-pedidos.html** — `<div id="tab-orders">`

**Data fetch:**
```
GET /rest/v1/orders?select=*,customers(nome_fantasia,email,telefone),order_items(qty,cost,price,products(nome))&order=created_at.desc
```

**UI:**
- Table with columns: #, Data, Cliente, Status, Pagamento, NF, Ações
- Status badge (color coded): approved (yellow), shipped (blue), delivered (green)
- Inline editable: payment_method (dropdown: PIX, Boleto, Cartão, Transferência), invoice (text input)
- Status change buttons: Enviado → Entregue
- Expandable row to see items + values (qty × price)
- Filter bar: by status (all/approved/shipped/delivered)

**Update flow:**
- Status change: PATCH `/rest/v1/orders?id=eq.{id}` with `{ status: newStatus }`
- Payment method: PATCH with `{ payment_method: value }`
- Invoice: PATCH with `{ invoice: value }`

---

## Task 7: Admin Panel — Estoque Tab

**Goal:** View and manage product inventory inline.

**Section within admin-pedidos.html** — `<div id="tab-stock">`

**Data fetch:**
```
GET /rest/v1/products?select=id,nome,categoria,estoque,cost,price,diameter,taper&order=id
```

**UI:**
- Table grouped by category (Máquina first, then cartuchos by type suffix RL/RS/RM/M1)
- Columns: Nome, Diâmetro, Taper, Estoque, Custo, Preço, Ações
- Stock cell: number display + colored indicator (green/yellow/red) + inline +/- buttons
- Cost/Price cells: click-to-edit inputs
- Search/filter bar at top
- "Salvar" button per row or auto-save on blur

**Update flow:**
- Stock change: PATCH `/rest/v1/products?id=eq.{id}` with `{ estoque: newValue }`
- Cost/Price change: PATCH with `{ cost: value, price: value }`

---

## Task 8: Refactor pre-pedido.html

**Goal:** Read from `products` table, add customer form, save preorder to Supabase, redirect to WhatsApp.

**File:** Modify `/Users/charbellelopes/nexas-sys/pre-pedido.html`

**Changes:**
1. Add `<script src="supabase-config.js"></script>` — use shared config
2. Change fetch URL from `estoque_produtos` to `products`
3. Add customer data form section before the submit button:
   - Nome fantasia (required)
   - Email (required)
   - Telefone/WhatsApp (required)
   - Fields match `customers` table columns
4. Update `goToSummary()` → `submitPreorder()`:
   - Validate customer fields
   - Upsert customer by email → get customer_id
   - Call `get_next_order_number` RPC → get order_number_int
   - INSERT preorders with customer_id, status='preorder', order_number_int
   - INSERT preorder_items for each selected product (product_id, qty)
   - Build WhatsApp message with order summary
   - Redirect to `https://wa.me/55{phone}?text={encoded_message}`
5. Update visual identity to match admin panel (dark bg, gold accents) — optional, can keep current purple theme for client-facing page
6. Remove hardcoded API key, use supabase-config.js instead

**WhatsApp message format for pre-order:**
```
Olá! Segue meu pré-pedido Nexas Pro #123:

• 2x Genesis Preto
• 5x 1003RL
• 3x 1207RM

Nome: João Silva
WhatsApp: (11) 99999-9999
Email: joao@email.com
```

---

## Task Order / Dependencies

```
Task 1 (DB migrations) → must be first
Task 2 (shared config) → must be before 3,4,8
Task 3 (login page) → must be before 4
Task 4 (admin shell) → must be before 5,6,7
Task 5 (pre-pedidos tab) → after 4
Task 6 (pedidos tab) → after 4
Task 7 (estoque tab) → after 4
Task 8 (refactor pre-pedido) → after 2, independent of 3-7
```

Tasks 5, 6, 7 can be parallelized after Task 4.
Task 8 can be parallelized with Tasks 3-7 (only depends on Task 2).
