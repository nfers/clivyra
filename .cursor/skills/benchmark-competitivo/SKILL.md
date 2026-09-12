---
name: benchmark-competitivo
description: >-
  Pesquisa concorrentes públicos para orientar o Clivyra sem copiar produtos:
  confirma capacidades, compara fluxos e traduz aprendizados em decisões
  priorizadas, seguras e compatíveis com o P0.
---

# Benchmark competitivo do Clivyra

Use esta skill para comparar concorrentes de gestão de clínicas, fisioterapia
ou studios de Pilates e converter evidências públicas em decisões de produto.

O objetivo é aprender com padrões consolidados, não reproduzir interfaces,
textos, regras proprietárias, dados de clientes ou posicionamento de terceiros.

## Instruções

### 1. Delimite o benchmark

Registre antes da pesquisa:

- concorrentes e URLs oficiais;
- segmento comparado;
- decisão de produto a informar;
- escopo alvo: P0, P1 ou P2;
- data da pesquisa.

Se não houver uma decisão explícita, compare apenas as capacidades que atendem
à jornada do Clivyra:

```text
Cliente/Paciente → Plano → Agenda → Atendimento → Clínico → Financeiro → Comunicação
```

### 2. Colete apenas evidência pública

Use o Bright Data para consultar URLs oficiais com `scrape_as_markdown` e buscar
páginas públicas de funcionalidades, preços, ajuda e termos com
`search_engine` ou `search_engine_batch`.

Para cada afirmação, registre:

- capacidade observada;
- fonte e data de acesso;
- evidência curta e factual;
- confiança: confirmada, parcial ou não confirmada.

Ausência em página pública não prova ausência no produto. Nunca trate hipótese,
marketing ou demonstração incompleta como funcionalidade confirmada.

### 3. Avalie pelos princípios do Clivyra

Classifique cada capacidade contra estes critérios:

| Critério | Pergunta de decisão |
| --- | --- |
| Jornada única | Reduz mudança de contexto entre paciente, agenda, clínico e financeiro? |
| Operação mobile-first | Permite concluir a ação frequente com poucos passos? |
| Relevância P0 | Resolve a rotina validada de cadastro, agenda, plano/pagamento e clínico lite? |
| Segurança e LGPD | Minimiza dados, preserva autorização, auditoria e privacidade clínica? |
| Multi-tenancy | Pode operar com `tenantId` derivado da sessão e isolamento completo? |
| Domínio | É regra explícita de serviço/domínio, não apenas comportamento de tela? |
| Evolução | Pode entrar por módulo/adaptador sem acoplamento a fornecedor? |
| Evidência de valor | Tem métrica operacional que valide a hipótese no piloto? |

Rejeite ou adie qualquer ideia que:

- dependa de dados clínicos em notificações ou IA sem necessidade;
- misture dados entre tenants;
- transfira decisão privilegiada para automação/IA;
- torne uma integração externa a fonte de verdade do core;
- aumente o P0 sem solucionar uma dor validada.

### 4. Produza a matriz e a recomendação

Use este formato:

| Capacidade | Concorrente/evidência | Aprendizado | Decisão Clivyra | Prioridade | Métrica |
| --- | --- | --- | --- | --- | --- |
| Agenda com conflitos | Confirmada / URL | Tornar conflitos visíveis no fluxo | Agenda com validação no backend | P0 | Conflitos evitados |

Para cada recomendação, defina uma decisão concreta:

- **adotar como princípio**: problema e padrão são comprovados, mas a
  implementação será própria;
- **adaptar**: há valor, com alteração necessária para o domínio Clivyra;
- **adiar**: benefício real, mas fora do P0;
- **rejeitar**: contraria segurança, LGPD, foco ou arquitetura.

Finalize com:

1. três aprendizados prioritários;
2. mudanças propostas no P0/P1/P2;
3. hipóteses e métricas de validação;
4. riscos, lacunas de evidência e decisões ainda abertas;
5. lista de fontes públicas com data.

### 5. Atualize a documentação de produto

Quando o benchmark resultar em uma decisão aprovada:

- atualize a matriz de requisitos, o MVP Scope e o roadmap;
- mantenha o registro de fontes e a distinção entre evidência e inferência;
- crie/atualize um ADR se a decisão alterar fonte de verdade, modelo de
  tenancy, segurança, integração ou arquitetura.

Não altere o P0 automaticamente: uma mudança de escopo requer decisão explícita
de produto e critério de aceite.

## Exemplos

### Comparar agenda para studios

```text
/benchmark-competitivo
Concorrentes: AgendaMais, Nextfit e SeuFisio
Decisão: priorização da agenda de Pilates
Escopo: P1
```

Resultado esperado: matriz que separa recursos confirmados de alegações não
verificadas, prioriza capacidade e presença conforme a jornada, e mantém
reposição/lista de espera fora do P0 se não forem necessárias para o piloto.

### Avaliar automação de cobrança

```text
/benchmark-competitivo
Concorrentes: três soluções brasileiras para clínicas
Decisão: lembrete de pagamento
Escopo: P1
```

Resultado esperado: recomendação para comunicação acionada por eventos do
domínio, com status de entrega, dados mínimos e sem conteúdo clínico.

## Notas de desempenho

- Faça consultas de busca independentes em lote.
- Extraia primeiro URLs oficiais; evite fontes de afiliados e agregadores.
- Reaproveite uma matriz existente quando a data de pesquisa for recente.
- Pesquise páginas específicas de recurso depois de identificar lacunas na
  página inicial.

## Solução de problemas

### Bright Data indisponível ou sem autenticação

Não produza afirmações de concorrência sem evidência. Informe a falha de acesso,
peça para executar `/bd-setup` e retome a pesquisa quando o conector estiver
autenticado.

### Página bloqueada ou vazia

Busque uma página oficial específica de funcionalidades, preços, central de
ajuda ou material público. Marque a capacidade como não confirmada se não houver
evidência confiável.

### Recomendação amplia o P0

Registre a ideia em P1/P2 com sua métrica. Só promova para P0 após validar a dor
do piloto, impacto operacional e controles de segurança/LGPD.
