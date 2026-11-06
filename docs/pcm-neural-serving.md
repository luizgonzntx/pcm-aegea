# PCM Neural — integração centralizada

## Estado da implantação

- O **Tira-dúvidas do site** funciona com dados SAP e ICM do painel por meio de cálculos e regras verificáveis.
- O carregamento manual de pesos e arquivos JSON foi removido da experiência do usuário.
- O código da interface contém um **gateway opcional de inferência privada** via `supabase.functions.invoke`.
- **O endpoint generativo não está implantado.** O classificador TextCNN V2 não é um LLM conversacional e não deve ser apresentado como tal.
- Não publicar os pesos nem os dossiês QUEST em GitHub Pages, JavaScript público, CDN ou Storage público.

## Arquitetura-alvo

Usuário autenticado -> Painel PCM -> Supabase Edge Function `pcm-neural-chat` -> serviço privado de consulta ao histórico + motor de cálculos + modelo de linguagem -> resposta citando as ordens e registros.

O Edge Function deverá **revalidar o usuário**, verificar associação e permissões da base, aplicar limites de consumo e identificar a revisão dos dados. A validação de acesso e a leitura de SAP, QUEST e ICM devem ocorrer no servidor, nunca confiando em tags, filtros ou números de OS enviados pelo navegador.

O serviço de inferência só deverá ter acesso às tabelas necessárias. RLS deve limitar o acesso do usuário; chaves de privilégio elevado nunca entram em `config.js`.

## Como ativar quando o servidor estiver disponível

1. Implantar a função privada autenticada no **projeto Supabase efetivamente usado pelo site** (identificar pelo `config.js`), com validação de JWT e de associação à equipe.
2. Criar armazenamento e ingestão privados para os dossiês SAP × QUEST × ICM, normalizados por OS/TAG e com proveniência.
3. Implantar um serviço persistente capaz de carregar o modelo validado uma única vez e atender vários usuários. O Colab é ambiente de treinamento, **não de produção 24/7**.
4. Configurar `PCM_CONFIG.neuralFunction = 'pcm-neural-chat'` somente depois de validar o endpoint. Sem essa configuração, a interface não faz requisições remotas nem finge conexão.
5. Exigir que o endpoint responda:
```json
{
  "title": "Parecer técnico — OS 900000000",
  "body": "Conclusão fundamentada no histórico recuperado.",
  "facts": [{"label":"Fonte","value":"OS 900000000 · QUEST · operação 0020"}],
  "source": "SAP/QUEST/ICM — revisão 12",
  "caveat": "Substituição ainda não comprovada."
}
```
A função deve receber somente pergunta (até 500 caracteres), alvo selecionado e contexto de filtros, tratar a entrada como **não confiável** e limitar tamanho/tempo de processamento. Não encaminhar todo o dataset no corpo da requisição.

## Requisitos de aceitação da IA conversacional

- Compreender perguntas parafraseadas e dar respostas diferentes conforme a OS.
- Diferenciar intervenção executada, prevista, negada e mudança administrativa, citando trechos originais.
- Comparar item, problema, causa e medida do ICM com o QUEST sem inventar vínculo entre linhas distintas.
- Registrar divergência, hipótese, incerteza e evidência; dizer quando os dados não sustentam conclusão.
- Produzir contagens de eventos consolidados pelo motor determinístico; nunca somar palavras encontradas.
- Medir qualidade com exemplos revisados por especialistas, não apenas comparação com rótulos automáticos.
- Preservar a confidencialidade: o navegador envia a pergunta, não todos os dossiês.

**Nota de infraestrutura:** até que o projeto Supabase correto esteja acessível e o serviço neural seja implantado, o gateway permanece desativado e o Tira-dúvidas apresenta somente análises da base. Isso é deliberado.
