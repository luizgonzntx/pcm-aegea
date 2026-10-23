# Águas de Teresina — Inteligência de Manutenção

Painel estático com identidade Aegea, mapa por coordenadas, aderência ao plano, ordens e ICM (Itens, Causas e Medidas).

## Endereços
- Interface: https://luizgonzntx.github.io/pcm-aegea/teresina/
- Projeto Supabase: xlbdhfjzxgfmsjstlzsd
- Este diretório é independente do SICAB na raiz do repositório.

## Acesso e primeira carga
A interface exige uma conta já existente no Supabase Auth e autorizada em public.pcm_teresina_members.
A conta do proprietário foi autorizada como admin. Não há cadastro público ou envio automático de convites.
O painel começa sem dados operacionais. Entre e importe os quatro arquivos XLSX (sistemas, ordens, itens e medidas) para realizar a primeira carga.
As próximas importações substituem o conjunto completo, após validação e confirmação no painel.
O conjunto é compartilhado entre os membros autorizados e fica no Supabase; não é incluído no repositório público.
Se outra sessão atualizar a base entre a leitura e a gravação, a revisão impede sobrescrever essa alteração.

## Autorizar consulta
No SQL Editor do Supabase, após criar a conta no Authentication:
```sql
insert into public.pcm_teresina_members(user_id, role)
select id, 'viewer' from auth.users where lower(email) = lower('EMAIL_DO_DIRETOR')
on conflict (user_id) do update set role = excluded.role;
```
Para um segundo responsável por importações, use admin. Não conceda acesso às tabelas ao papel anon.

## Dados
A exportação de ordens deve incluir:
Ordem; TAG Planta; Centro; Data de referência; Dta.início real; Data de entrada; Status do sistema; Plano de manutenção; Tipo de ordem.
Os campos opcionais Prazo programado e Conclusão real habilitam a avaliação de pontualidade.
O arquivo de sistemas deve ter COD_INFORMACAO, NOME, COD_LATITUDE e COD_LONGITUDE.
Itens: Ordem, Texto code causa, Texto code parte objeto, Texto de code para problema.
Medidas: Ordem, Texto do código da medida.
A primeira linha é usada como cabeçalho. Arquivos devem ser XLSX e ter no máximo 25 MB.
Datas inválidas, identificadores divergentes e coordenadas inválidas impedem a carga.
O conjunto normalizado tem limite de 19 MB na interface / 20 MB no banco.

## Critérios e Funcionalidades Analíticas
- Centro PITE é o filtro interno para Águas de Teresina. O código não é apresentado na interface.
- NEXE prevalece sobre ENTE; ENTE classifica execução; ENCE isolado não comprova execução.
- Aderência: ordens executadas com plano preenchido / ordens do plano com referência dentro do intervalo. Ordens abertas e não executadas permanecem no denominador.
- Indicador complementar: execução com início real no próprio intervalo.
- Semáforo de saúde das instalações (Mapa e Lista): Verde (aderência ≥ 85% sem ordens vencidas), Âmbar (60% a 84%), Vermelho (< 60% ou ordens vencidas em aberto) e Azul (sem plano no período).
- Análises de PCM integradas:
  - Distribuição por Tipo de Ordem (com filtro rápido em 1 clique).
  - Top Ativos Críticos com maior volume de intervenções executadas.
  - Matriz Cruzada Item (Componente) × Problema × Causa × Medida para diagnóstico de falhas recorrentes.
- Atalhos rápidos de período (Mês, 90 dias, Ano, Tudo), filtro por Prioridade e busca rápida de instalações.
- Importação com suporte a arrastar e soltar (Drag-and-Drop) e checklist de validação dos 4 arquivos `.xlsx`.
- Exportação CSV nas abas de Ordens, ICM (Matriz Cruzada) e Planos/Prazos (Aderência por Instalação).
- Data de entrada é criação; referência define competência; início real define começo do serviço.
- No prazo exige conclusão real <= prazo programado. Sem as datas, não avaliável.
- ICM conta ordens executadas distintas por item, causa ou medida. Não faz produto cartesiano entre tabelas.
- Causa registrada não equivale automaticamente a causa raiz.
- Suspensão ainda não tem mapeamento validado.

## Publicação e verificação
Arquivos estáticos, sem build. O GitHub Pages existente publica a raiz; o painel está na subpasta teresina.
Dependências fixadas: Leaflet 1.9.4, supabase-js 2.49.4, SheetJS 0.20.3.
Fontes e grafismos Aegea são reutilizados de ../aegea-assets/.
O mapa usa tiles OpenStreetMap e requer internet; se falhar, a lista de instalações continua utilizável.
Testes: node teresina/test-core.cjs
Sintaxe: node --check teresina/app.js
A validação de regras foi executada; não houve inspeção visual automatizada nesta entrega.
A chave no config.js é pública e só autoriza o que as políticas RLS permitem. Nunca inserir chaves secretas no frontend.

## Banco
database/schema.sql registra o esquema aplicado pela migração pcm_teresina_private_dataset.
Apenas a coluna payload é editável por administradores autenticados. Revisão, autor e data da alteração são definidos no banco.
A mesma instância atende outros aplicativos; esta implantação usa somente tabelas pcm_teresina_*.

