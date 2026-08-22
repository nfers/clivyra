Padrão de commits

Formato exigido

type(scope) descrição

Exemplos:

- feat(create-logo) adiciona novo logo ao site
- fix(auth) corrige validação do token
- chore(deps) atualiza dependências

Instalação dos hooks

Depois de clonar o repositório, execute:

```bash
sh scripts/install-git-hooks.sh
```

Isso configura o Git para usar o diretório `.githooks` e torna o gancho `commit-msg` executável.
