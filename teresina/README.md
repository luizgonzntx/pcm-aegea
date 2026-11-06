# Águas de Teresina — Inteligência de Manutenção

Painel estático com identidade Aegea, mapa por coordenadas, aderência ao plano, ordens e ICM (Itens, Causas e Medidas).

## Endereços
- Interface: https://luizgonzntx.github.io/pcm-aegea/teresina/
- Projeto Supabase: conforme `config.js` (atualmente `zvbkbjtajmdfrxonrhen`)
- O repositório contém exclusivamente o painel de Teresina e seus recursos de publicação e administração.

## Acesso e primeira carga
A interface exige uma conta no Supabase Auth autorizada em public.pcm_teresina_members.
Administradores podem criar contas com e-mail, senha inicial e perfil na área administrativa. O cadastro usa uma Edge Function protegida; nunca coloque a chave `service_role` no navegador.
Para ativar o cadastro, configure o segredo da função e publique-a no projeto Supabase:
```sh
supabase secrets set SUPABASE_SERVICE_ROLE_KEY='VALOR_DA_SERVICE_ROLE' --project-ref zvbkbjtajmdfrxonrhen
supabase functions deploy admin-create-user --project-ref zvbkbjtajmdfrxonrhen
```
O administrador deve compartilhar a senha inicial com o novo usuário por um canal seguro.
O painel começa sem dados operacionais. Na área administrativa, importe os cinco arquivos básicos XLSX (sistemas, ordens, itens, medidas e notas de parada) e, para os indicadores de esforço, o sexto XLSX de apontamentos SAP. A importação antiga de cinco arquivos continua possível, mas não fornece tempo de deslocamento/execução.
O conjunto é compartilhado entre os membros autorizados no Supabase e não é incluído no repositório público. A publicação substitui o conjunto completo após validação e confirmação. A revisão concorrente impede sobrescrever mudanças de outra sessão.

## Autorizar consulta
Se necessário, autorize uma conta existente pelo SQL Editor do Supabase:
```sql
insert into public.pcm_teresina_members(user_id, role)
select id, 'viewer' from auth.users where lower(email) = lower('EMAIL_DO_DIRETOR')
on conflict (user_id) do update set role = excluded.role;
```
Para um segundo responsável por importações, use admin. Não conceda acesso às tabelas ao papel anon.

## Dados
A exportação de **ordens** deve incluir:
`Ordem`, `TAG Planta`, `Centro`, `Data de referência`, `Hora de referência`, `Dta.início real`, `Início real hr.`, `Data de entrada`, `Status do sistema`, `Plano de manutenção` e `Tipo de ordem`.
Os campos opcionais `Prazo programado` e `Conclusão real` habilitam pontualidade. 
O arquivo de sistemas deve conter `COD_INFORMACAO`, `NOME`, `COD_LATITUDE` e `COD_LONGITUDE`.
Itens: `Ordem`, `Texto code causa`, `Texto code parte objeto`, `Texto de code para problema`.
Medidas: `Ordem`, `Texto do código da medida`.
A planilha de **notas de parada** deve conter `Ordem`, `Data da nota`, `TAG Planta`, `Parada`; para atribuição e intervalo entre falhas, inclua `Criado às` (hora SAP de criação). `Tipo de nota` (CE/CP), `Nota` e `Descrição` são preservados quando existentes.
A planilha de **apontamentos** deve conter `Ordem`, `Operação`, `ID SAP` e `Trabalho real` (horas decimais SAP). Para calcular o **MTTR ativo**, também deve incluir `Data de início de execução real`, `Hora de início de execução real`, `Data real do fim de execução` e `Hora real do fim de execução`. A operação 0010 representa deslocamento e não entra no tempo ativo de reparo; outras operações representam execução. O importador retém somente os apontamentos relacionados às ordens corretivas elegíveis, evitando excesso de volume no dataset.
O importador procura o cabeçalho nas primeiras 20 linhas e ignora diferenças de caixa, acentos e espaços; aceita cinco ou seis arquivos XLSX de até 25 MB cada. O JSON normalizado é limitado a 19 MB no navegador / 20 MB no banco. Não inclua planilhas com dados pessoais desnecessários.
Datas/hora inválidas, identificadores divergentes ou coordenadas inválidas impedem a carga; tempos incompletos não são preenchidos com valores inventados.

## Critérios e Funcionalidades Analíticas
- Centro PITE é o filtro interno para Águas de Teresina. O código não é apresentado na interface.
- NEXE prevalece sobre ENTE; ENTE classifica execução; ENCE isolado não comprova execução.
- Aderência: ordens executadas com plano preenchido / ordens do plano com referência dentro do intervalo. Ordens abertas e não executadas permanecem no denominador.
- Indicador complementar: execução com início real no próprio intervalo.
- Semáforo de saúde das instalações (Mapa e Lista): Verde (aderência ≥ 85% sem ordens vencidas), Âmbar (60% a 84%), Vermelho (< 60% ou ordens vencidas em aberto) e Azul (sem plano no período).
- Análises de PCM integradas:
  - Distribuição por Tipo de Ordem (com filtro rápido em 1 clique).
  - Top Ativos Críticos com maior volume de intervenções executadas.
  - Matriz de Componente × Problema × Causa da mesma linha de item. As medidas são rankings independentes, sem presumir vínculo item↔medida pelo número da ordem.
- Atalhos rápidos de período (Mês, 90 dias, Ano, Tudo), filtro por Prioridade e busca rápida de instalações.
- Importação com suporte a arrastar e soltar (Drag-and-Drop) e checagem prévia de cinco arquivos obrigatórios e sexto de apontamentos, com cobertura de horários SAP e qualidade do ICM.
- Exportação CSV nas abas de Ordens, ICM (Matriz Cruzada) e Planos/Prazos (Aderência por Instalação).
- Data de entrada é criação; referência define competência; início real define começo do serviço.
- No prazo exige conclusão real <= prazo programado. Sem as datas, não avaliável.
- ICM considera apenas ZNTE/ZNTP com ENTE. Rankings de componentes, causas e medidas contam ordens distintas, excluem campos vazios/placeholder e não associam itens a medidas sem vínculo explícito. A matriz só apresenta Componente × Problema × Causa registrados na mesma linha de item. Admin mostra cobertura do diagnóstico antes de publicar.
- Causa registrada não equivale automaticamente a causa raiz.
- Suspensão ainda não tem mapeamento validado.
- A seção de paradas prioriza CE/CP com Parada = X e ENTE. Consultas baseadas em texto e notas com X sem validação estão em detalhes recolhidos, para não serem confundidas com os indicadores oficiais. A seção de paradas separa a contagem histórica da quinta planilha (`Parada = X`, ordens distintas por TAG Planta, filtradas pela Data da nota) das ocorrências identificadas pelo texto de ordens/itens. A flag não representa situação atual da planta.
- **Paradas elegíveis:** notas com `Parada = X` e tipo de nota CE/CP (quando informado), com ordem SAP `ZNTE` ou `ZNTP` e status `ENTE` sem `NEXE`, agrupadas sem duplicar a mesma ordem por planta.
- **Tempo médio de atribuição:** `(Dta.início real + Início real hr.) − (Data da nota + Criado às)`, em horas por ordem. Intervencões iniciadas antes da criação são sinalizadas como inválidas e não entram na média; hora da avaria não substitui `Criado às`.
- **MTTR ativo (indicador gerencial):** em cada ordem elegível, somar a duração da **união dos intervalos positivos de execução** registrados nas operações diferentes de 0010. Técnicos simultâneos não multiplicam a duração; lacunas sem execução apontada não são adicionadas. Registros com horas de trabalho negativas (estornos) neutralizam uma confirmação positiva correspondente pela ordem, operação, profissional, valor absoluto e datas/horas; duplicatas exatas são eliminadas; a identificação do técnico não é obrigatória para calcular a duração cronológica. Ordens sem início/fim válido não entram na média e aparecem como indisponíveis, sem usar a referência de fechamento como substituta. **Este MTTR ativo não representa necessariamente o tempo total até o restabelecimento do equipamento.**
- **Intervalo por referência (auditoria, fora do MTTR ativo):** `(Data de referência + Hora de referência) − (Dta.início real + Início real hr.)`. Preservado como `referenceMttrHours`, sem confundir com o tempo de execução ativo.
- **Tempo total de parada:** `(Data de referência + Hora de referência) − (Data da nota + Criado às)` (medida documental, não comprova indisponibilidade contínua).
- **Tempo médio de deslocamento:** por ordem, `soma(Trabalho real, operação 0010) / quantidade de ID SAP distintos da operação 0010`; média das ordens válidas por planta.
- **Tempo médio de execução:** por ordem, `soma(Trabalho real positivo, operações diferentes de 0010, com ID SAP) / quantidade de ID SAP distintos dessas operações`; média das ordens válidas por planta. Apontamentos sem ID SAP ainda podem compor o MTTR ativo, mas não são atribuídos artificialmente a um profissional.
- **Tempo médio de atendimento:** deslocamento médio + execução média por planta, se ambos estiverem disponíveis. Horas apontadas são esforço de equipe, diferentes do intervalo cronológico do MTTR.
- **MTBF indicativo:** por `TAG Ativo`, média dos intervalos não negativos entre o fechamento por referência de uma CE e a criação da CE seguinte (em ordens distintas); a planta agrega os intervalos dos ativos, não intercala falhas de equipamentos diferentes. Sem horários de criação ou sem recorrência, aparece indisponível.
- **Disponibilidade operacional:** não é calculada a partir do MTTR ativo com MTBF indicativo. Exige horas efetivas de operação/indisponibilidade (telemetria ou início/fim real da parada validado).

- Nas tabelas de confiabilidade, a barra de disponibilidade usa verde para valores ≥ 85%, âmbar para 60% a < 85% e vermelho para valores < 60%; sem dados suficientes, o percentual aparece como indisponível.
- O ranking de confiabilidade por planta é ordenado da maior para a menor disponibilidade; plantas sem disponibilidade calculável aparecem ao final. Em telas móveis, a tabela é substituída por cartões compactos com posição, disponibilidade, MTBF e MTTR.
- MTBF e MTTR por ativo: mesmas regras de ordem tecnicamente encerrada, flag de parada, tipos `ZNTP`/`ZNTE`, período e horários válidos da confiabilidade por planta, agrupadas pela TAG Ativo da ordem (com a TAG da nota como alternativa quando a ordem não informar ativo), além da planta. Ocorrências sem TAG de ativo não são agrupadas.

## Publicação e verificação
Arquivos estáticos, sem build. O GitHub Pages existente publica a raiz; o painel está na subpasta teresina.
Dependências fixadas: Leaflet 1.9.4, supabase-js 2.49.4, SheetJS 0.20.3.
Fontes e grafismos necessários ao painel ficam em `assets/`, junto à aplicação.
O mapa usa tiles OpenStreetMap e requer internet; se falhar, a lista de instalações continua utilizável.
Testes: node teresina/test-core.cjs
Sintaxe: node --check teresina/app.js
A validação de regras foi executada; não houve inspeção visual automatizada nesta entrega.
A chave no config.js é pública e só autoriza o que as políticas RLS permitem. Nunca inserir chaves secretas no frontend.

## Banco
database/schema.sql registra o esquema aplicado pela migração pcm_teresina_private_dataset.
Apenas a coluna payload é editável por administradores autenticados. Revisão, autor e data da alteração são definidos no banco.
A mesma instância atende outros aplicativos; esta implantação usa somente tabelas pcm_teresina_*.

## Desenvolvimento local

Na raiz do repositório, use `python3 -m http.server 8000 --bind 127.0.0.1`.
O arquivo inicial redireciona para `teresina/`. Não há instalação de pacotes nem build obrigatório.
Para gerar a versão do Cloudflare Pages, execute `bash scripts/build-cloudflare-pages.sh` e configure `dist` como diretório de saída.
Valide os recursos de ambas as versões com `node scripts/check-static.cjs` após gerar `dist`.
O CI executa os testes de regras, a checagem de sintaxe e a validação dos recursos publicados.

## Levantamento de equipamentos das plantas

Ao clicar em um ponto do mapa ou em uma instalação da lista, os equipamentos correspondentes aparecem diretamente no início dos detalhes, sem consulta manual ou seletor de unidades.
Nos detalhes de uma instalação, o levantamento aparece automaticamente quando seu nome corresponde exatamente a um nome ou alias de `inventory.js`, ignorando acentos, caixa e pontuação.
A numeração inicial é ignorada (ex.: “1 - ETA Sul”). Nomes completos de subseções, como “ETA Sul - Captação”, exibem apenas os equipamentos da subseção. Nomes parciais não geram vínculo: “Dirceu” não identifica com segurança Booster Dirceu ou Elevatória Dirceu. Plantas sem vínculo mostram que o levantamento ainda não está cadastrado, sem oferecer dados de outra unidade.

`inventory.js` contém a transcrição e os aliases explícitos. A fonte é preliminar, sem data de referência, e não acompanha os filtros de ordens ou o período.
“Mat.” foi confirmado como **Em manutenção**. A potência (CV) pertence à seção, não a cada linha de equipamento.
A notação de projeto (ex.: `3+2`), as divergências de quantidades e os campos ausentes foram preservados. Não são calculados totais ou disponibilidade a partir dessas quantidades.
A numeração repetida da imagem não é usada como identificador. Atualizações deste levantamento devem ser feitas no arquivo; a importação das cinco planilhas básicas (e apontamentos opcionais) continua separada.

## Publicação de produção no Cloudflare

O site de produção é https://pcm-aegea-teresina.pages.dev/.
O workflow `.github/workflows/deploy-cloudflare.yml` publica alterações de `main` e também permite execução manual pelo GitHub Actions.
Ele valida o painel, gera `dist/`, publica no projeto `pcm-aegea-teresina` e compara os arquivos servidos com o build do commit.
Usa os secrets de repositório `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` (também aceita `CF_API_TOKEN` e `CF_ACCOUNT_ID`). Os valores permanecem no GitHub; não devem ser colocados no código.
O token deve ter permissão de edição do Cloudflare Pages na conta do projeto existente.

## Visão enxuta de indicadores
A aba **Indicadores** apresenta apenas cinco tempos: deslocamento, execução, atendimento, MTTR ativo e MTBF indicativo. O tempo até início real (atribuição) continua calculado e preservado nos dados para auditoria, mas não aparece nos indicadores, no gráfico mensal ou na tabela por ativo. A seleção de uma planta na lista ou no mapa abre a aba já filtrada. Na aba é possível selecionar outra planta e/ou TAG Ativo.
O gráfico mensal suavizado usa a **Data da nota** para agrupar ocorrências; meses sem tempos válidos mostram lacunas, nunca zero artificial. Ao selecionar MTBF, o intervalo entre duas falhas CE do mesmo ativo é atribuído ao mês da segunda falha; o evento anterior pode estar fora do intervalo de datas filtrado.
A tabela detalha os cinco indicadores por TAG Ativo, sem apresentar campos de auditoria ou paradas inferidas por texto. O painel mostra um traço quando os horários ou apontamentos não permitem calcular o indicador. A fonte continua auditável no conjunto importado e nas ordens SAP.
O resultado é obtido por média de ordens elegíveis; deslocamento e execução são primeiro divididos pelo número de técnicos distintos da categoria em cada ordem e só depois consolidados. Atendimento representa a soma dessas duas médias. O MTTR ativo é uma média de durações cronológicas de execução consolidada por OS, **não** uma divisão por quantidade de técnicos. Para aplicar esse cálculo em produção, publique pelo admin os cinco arquivos básicos mais a exportação atualizada de apontamentos SAP; o deploy de código, isoladamente, não altera os dados do Supabase.
