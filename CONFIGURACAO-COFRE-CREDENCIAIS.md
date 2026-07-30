# Cofre de credenciais fiscais

Configure no ambiente da API uma chave exclusiva chamada:

```text
CREDENCIAIS_MASTER_KEY
```

Gere uma chave de 32 bytes em base64 uma única vez:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Cadastre o valor no Render como variável secreta. Não salve a chave no Git,
na Web, em mensagens ou em arquivos de configuração do projeto.

Se a chave for perdida, os segredos existentes não poderão ser recuperados.
Antes de trocar a chave, é obrigatório implementar uma rotação controlada.

Nesta etapa o cofre:

- criptografa senhas, códigos e arquivos A1 com AES-256-GCM;
- nunca devolve os segredos pela API;
- permite acesso somente ao perfil Administrador;
- registra cadastro, alteração de status e exclusão no histórico;
- não acessa portais e não transmite declarações.
