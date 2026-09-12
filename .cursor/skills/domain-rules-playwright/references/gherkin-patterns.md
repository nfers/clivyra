# Gherkin patterns — Clivyra domain rules

## Anatomy

```gherkin
Feature: <capacidade>
  Como <papel autenticado>
  Quero <capacidade>
  Para <resultado de negócio>

  Background:
    Given que estou autenticado como <papel> do tenant "<tenant>"

  Scenario: <nome orientado a regra>
    Given <estado de domínio>
    When <ação ou evento>
    Then <efeito de negócio>
```

## Mapping verbs to domain language

| Camada ruim (UI) | Camada boa (domínio) |
| --- | --- |
| clico em Salvar | registro um novo paciente com dados válidos |
| vejo toast verde | o paciente fica disponível na lista do meu tenant |
| o botão some | não tenho permissão para cancelar o contrato |
| URL muda | o agendamento é confirmado para o horário escolhido |

## Scenario templates

### Happy path

```gherkin
Scenario: recepção cria lead com telefone válido
  Given que estou autenticado como RECEPTION do tenant "Studio Alpha"
  When registro um lead com nome e telefone válidos
  Then o lead aparece no CRM do tenant "Studio Alpha"
  And o status inicial é "Novo"
```

### Validation

```gherkin
Scenario: não permite criar paciente sem nome
  Given que estou autenticado como PROFESSIONAL do tenant "Studio Alpha"
  When tento registrar um paciente sem nome
  Then vejo erro de validação no campo nome
  And nenhum paciente é persistido
```

### Authorization (negative)

```gherkin
Scenario: profissional não administra usuários
  Given que estou autenticado como PROFESSIONAL do tenant "Studio Alpha"
  When tento abrir a administração de usuários
  Then o acesso é negado
  And nenhum usuário é listado
```

### Tenant isolation (critical)

```gherkin
Scenario: não acessa paciente de outro tenant pelo mesmo id
  Given que existe um paciente "P1" no tenant "Studio Beta"
  And que estou autenticado como ADMIN do tenant "Studio Alpha"
  When tento abrir o paciente "P1" pelo identificador
  Then recebo resposta de não encontrado ou proibido
  And nenhum dado clínico do paciente é exibido
```

### Persistence / reload

```gherkin
Scenario: contrato criado permanece após recarregar
  Given que estou autenticado como ADMIN do tenant "Studio Alpha"
  And que criei um contrato ativo para o paciente "Ana"
  When recarrego a página de contratos
  Then o contrato de "Ana" continua listado como ativo
```

### State machine / business invariant

```gherkin
Scenario: contrato cancelado não permite novo agendamento de plano
  Given que o paciente "Ana" possui contrato cancelado no tenant "Studio Alpha"
  And que estou autenticado como RECEPTION do tenant "Studio Alpha"
  When tento agendar uma aula vinculada a esse contrato
  Then a operação é rejeitada com mensagem de contrato inválido
```

## Tags sugeridas

Use tags para filtrar execução:

- `@happy`
- `@validation`
- `@authz`
- `@tenant-isolation`
- `@clinical` (cuidado LGPD — dados sintéticos apenas)
- `@finance`
- `@regression`

## One rule per scenario

Ruim:

```gherkin
Scenario: fluxo completo de paciente
  # cria, edita, agenda, cancela, troca tenant...
```

Bom: um scenario por invariante, nomeado pelo resultado da regra.

## Examples / Scenario Outline

Use quando a mesma regra varia por papel ou estado:

```gherkin
Scenario Outline: apenas papéis autorizados criam despesa
  Given que estou autenticado como <papel> do tenant "Studio Alpha"
  When tento registrar uma despesa válida
  Then o resultado é <resultado>

  Examples:
    | papel         | resultado |
    | OWNER         | permitido |
    | ADMIN         | permitido |
    | PROFESSIONAL  | negado    |
    | RECEPTION     | negado    |
```
