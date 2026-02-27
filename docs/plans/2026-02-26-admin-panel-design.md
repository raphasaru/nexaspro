# Nexas Pro — Admin Panel & Order System Modernization

## Stack
HTML + Tailwind CDN + vanilla JS + Supabase REST API. Zero build step.

## Pages

1. **`pre-pedido.html`** (refatorado) — formulario publico. Cliente escolhe produtos de `products`, preenche nome/WhatsApp/email, submete. Salva customer + preorder + preorder_items no Supabase. Redireciona pro WhatsApp com resumo.

2. **`admin-login.html`** — login com Supabase Auth (email/senha). Redireciona pro painel.

3. **`admin-pedidos.html`** — painel principal. 3 abas:
   - **Pre-pedidos**: lista pendentes, aprovar/rejeitar (com motivo). Ao aprovar: desconta estoque de `products`, cria `orders` + `order_items`, gera botao WhatsApp.
   - **Pedidos**: lista aprovados com status (aprovado/enviado/entregue). Admin preenche payment_method.
   - **Estoque**: tabela editavel de produtos com +/- qty, cost/price editaveis.

## Auth
- Supabase Auth email/senha
- Multiplos admins: qualquer user com `profiles.role = 'admin'`
- Paginas admin verificam sessao no load, redirect pra login se nao autenticado

## RLS
- `products`: SELECT publico, UPDATE/INSERT/DELETE admin only
- `preorders` + `preorder_items`: INSERT publico, SELECT/UPDATE/DELETE admin only
- `orders` + `order_items`: tudo admin only
- `customers`: INSERT publico, SELECT/UPDATE admin only

## Data Flow

### Pre-pedido (cliente)
1. Fetch `products` do Supabase
2. Cliente escolhe qtd + preenche dados pessoais
3. Submit → upsert `customers` (by email) → insert `preorders` → insert `preorder_items`
4. Redirect WhatsApp com msg formatada

### Aprovacao (admin)
1. Lista `preorders` status=preorder com JOIN customer
2. Aprovar → update preorders.status=approved → create orders + order_items → decrement products.estoque
3. Se estoque insuficiente → bloqueia, mostra alerta
4. Botao WhatsApp com confirmacao

### Rejeicao (admin)
1. Admin clica rejeitar → preenche motivo
2. Update preorders.status=rejected, salva motivo

### Gestao estoque (admin)
- Tabela editavel: qty com +/-, cost/price editaveis
- Visual: verde >=100, amarelo >=50, vermelho <50, esgotado <=5

## Migracao
- Copiar 68 registros de `estoque_produtos` → `products`
- `estoque_produtos` permanece intacta (legado prod)
- Remover coluna `subcategoria` de products (nao necessaria)

## Visual
- Fundo escuro, tons dourados (#f9efc7), Tailwind
- Imagens de produto onde fizer sentido
