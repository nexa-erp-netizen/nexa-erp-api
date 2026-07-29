# Google Drive no Nexa ERP

## Google Cloud

1. Crie ou selecione um projeto no Google Cloud.
2. Ative a **Google Drive API**.
3. Configure a tela de consentimento OAuth como **Interna** para o Google Workspace da empresa.
4. Crie uma credencial **ID do cliente OAuth** do tipo **Aplicativo da Web**.
5. Cadastre este URI de redirecionamento autorizado:

```text
https://nexa-erp-api.onrender.com/google-drive/callback
```

## Variáveis no Render da API

```text
GOOGLE_DRIVE_CLIENT_ID
GOOGLE_DRIVE_CLIENT_SECRET
GOOGLE_DRIVE_REDIRECT_URI=https://nexa-erp-api.onrender.com/google-drive/callback
DRIVE_TOKEN_ENCRYPTION_KEY
```

`DRIVE_TOKEN_ENCRYPTION_KEY` deve ser uma sequência aleatória longa, exclusiva e
mantida em segredo. Não altere essa chave após conectar o Drive, pois ela protege
o token salvo no banco.

## Primeiro uso

1. Entre no Nexa ERP como Administrador.
2. Abra **Configurações > Google Drive**.
3. Clique em **Conectar Google Drive**.
4. Autorize a conta do Workspace.
5. Selecione **Contabilidade Infinity1** como pasta principal.
6. Confirme o vínculo entre cada cliente e sua pasta.

A integração solicita somente leitura. A Nexa não recebe permissão para alterar,
mover ou excluir arquivos.
