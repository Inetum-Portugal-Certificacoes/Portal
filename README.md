# Portal Certificacoes

Aplicacao web publicada em GitHub Pages com autenticacao por email/password no Supabase Auth.

## Modelo de seguranca

- O utilizador faz login em `login.html` via Supabase Auth.
- A app valida whitelist ativa em `authorized_emails`.
- Os dados sao lidos via REST do Supabase com token de sessao do utilizador.
- Sem login valido nao ha token de sessao, e os dados nao sao devolvidos.

## Variaveis publicas da app

A configuracao de frontend esta em `app-config.js`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Deploy

O deploy e automatico via GitHub Actions em push para `main`:

- Workflow: `.github/workflows/gh-pages.yml`

## Estrutura de dados principal

Tabelas usadas no frontend:

- `stay_certified`
- `stay_certified_notas`
- `planeamento`
- `planeamento_notas`
- `indicadores`
- `authorized_emails`

## Nota

Scripts legados de migracao/importacao local e ficheiros de exemplo foram removidos para reduzir superficie de risco e ruido no repositorio.
