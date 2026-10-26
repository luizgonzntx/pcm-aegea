# Águas de Teresina — Inteligência de Manutenção

Painel estático com identidade Aegea, mapa por coordenadas, aderência ao plano, ordens e ICM (Itens, Causas e Medidas).

## Endereços
- Interface: https://luizgonzntx.github.io/pcm-aegea/teresina/
- Projeto Supabase: xlbdhfjzxgfmsjstlzsd
- Este diretório é independente do SICAB na raiz do repositório.

## Acesso e primeira carga
A interface exige uma conta no Supabase Auth autorizada em public.pcm_teresina_members.
Administradores podem criar contas com e-mail, senha inicial e perfil na área administrativa. O cadastro usa uma Edge Function protegida; nunca coloque a chave `service_role` no navegador.
Para ativar o cadastro, configure o segredo da função e publique-a no projeto Supabase:
```sh
supabase secrets set SUPABASE_SERVICE_ROLE_KEY='VALOR_DA_SERVICE_ROLE' --project-ref xlbdhfjzxgfmsjstlzsd
supabase functions deploy admin-create-user --project-ref xlbdhfjzxgfmsjstlzsd
```
O administrador deve compartilhar a senha inicial com o novo usuário por um canal seguro.
O painel começa sem dados operacionais. Entre na área administrativa e importe os cinco arquivos XLSX (sistemas, ordens, itens, medidas e notas de parada) para realizar a primeira carga.
As próximas importações substituem o conjunto completo, após validação e confirmação no painel.
O conjunto é compartilhado entre os membros autorizados e fica no Supabase; não é incluído no repositório público.
Se outra sessão atualizar a base entre a leitura e a gravação, a revisão impede sobrescrever essa alteração.

## Autorizar consulta
Se necessário, autorize uma conta existente pelo SQL Editor do Supabase:
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
Notas de parada: Ordem, Data da nota, TAG Planta e Parada. A coluna `Parada` usa `X` para marcar ocorrências; Nota e Descrição são opcionais e mantidas para rastreabilidade.
Para MTBF/MTTR, inclua também Início da avaria, Início da avaria (hora), Fim da avaria e Fim da avaria (hora). Esses campos são opcionais para importar notas.
O importador procura o cabeçalho nas primeiras 20 linhas e ignora diferenças de caixa, acentos e espaços nos nomes das colunas. Arquivos devem ser XLSX e ter no máximo 25 MB.
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
- Importação com suporte a arrastar e soltar (Drag-and-Drop) e checklist de validação dos 5 arquivos `.xlsx`.
- Exportação CSV nas abas de Ordens, ICM (Matriz Cruzada) e Planos/Prazos (Aderência por Instalação).
- Data de entrada é criação; referência define competência; início real define começo do serviço.
- No prazo exige conclusão real <= prazo programado. Sem as datas, não avaliável.
- ICM conta ordens executadas distintas por item, causa ou medida. Não faz produto cartesiano entre tabelas.
- Causa registrada não equivale automaticamente a causa raiz.
- Suspensão ainda não tem mapeamento validado.
- A seção de paradas separa a contagem histórica da quinta planilha (`Parada = X`, ordens distintas por TAG Planta, filtradas pela Data da nota) das ocorrências identificadas pelo texto de ordens/itens. A flag não representa situação atual da planta.
- MTBF estimado por planta: média dos intervalos entre datas e horas de início de avarias distintas marcadas com `Parada = X`, somente quando a ordem vinculada está tecnicamente encerrada (`ENTE`) e é corretiva `ZNTP` ou emergencial corretiva `ZNTE`. A data/hora de início da nota define o período e o intervalo; ordens abertas, canceladas, de outros tipos ou sem início válido não entram.
- MTTR estimado por planta: média do tempo entre início e fim da avaria registrados na nota, usando o mesmo conjunto de ordens tecnicamente encerradas (`ENTE`), com `Parada = X` e tipo `ZNTP`/`ZNTE`. São necessárias data e hora válidas de início e fim; hora `00:00:00` é válida. Ordens sem fim válido ou com fim anterior ao início não entram no MTTR.
- Disponibilidade estimada por planta: `MTBF ÷ (MTBF + MTTR)`, apresentada como percentual quando ambos os indicadores podem ser calculados com os dados e filtros do período. A estimativa depende do histórico de avarias registrado e não substitui medição direta do tempo operacional.
- Nas tabelas de confiabilidade, a barra de disponibilidade usa verde para valores ≥ 85%, âmbar para 60% a < 85% e vermelho para valores < 60%; sem dados suficientes, o percentual aparece como indisponível.
- O ranking de confiabilidade por planta é ordenado da maior para a menor disponibilidade; plantas sem disponibilidade calculável aparecem ao final. Em telas móveis, a tabela é substituída por cartões compactos com posição, disponibilidade, MTBF e MTTR.
- MTBF e MTTR por ativo: mesmas regras de ordem tecnicamente encerrada, flag de parada, tipos `ZNTP`/`ZNTE`, período e horários válidos da confiabilidade por planta, agrupadas pela TAG Ativo da ordem (com a TAG da nota como alternativa quando a ordem não informar ativo), além da planta. Ocorrências sem TAG de ativo não são agrupadas.

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
