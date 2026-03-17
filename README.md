# API de WhatsApp para leads da Argacon

API em Node.js para atender leads da Argacon no WhatsApp usando dois modos:

- `web`: login por QR Code com `whatsapp-web.js`
- `cloud`: webhook oficial do WhatsApp Cloud API

O projeto agora esta configurado para usar `web` primeiro e permitir voltar depois para `cloud` sem refazer a logica de IA e leads.

## O que ela faz

- Recebe mensagens por QR Code no WhatsApp Web ou por webhook oficial
- Gera respostas com IA em portugues
- Usa contexto da Argacon para nao responder no escuro
- Salva o historico dos leads em `data/leads.json`
- Permite enriquecer a IA com arquivos locais em `data/knowledge`
- Disponibiliza endpoints para listar e inspecionar leads
- Tem um endpoint de simulacao para testar a IA sem WhatsApp real

## Requisitos

- Node.js 18.17+ instalado
- Se usar modo `web`: Chrome/Chromium compativel com Puppeteer
- Se usar modo `cloud`: conta no Meta for Developers com WhatsApp Cloud API
- Chave da IA do Google
- No modo `cloud`, um dominio publico ou tunel como ngrok/cloudflared para o webhook

## Configuracao

1. Copie `.env.example` para `.env`
2. Preencha as variaveis:

- `WHATSAPP_PROVIDER`: `web` ou `cloud`
- `GEMINI_API_KEY`: chave do Gemini
- `GEMINI_MODEL`: modelo Gemini, por padrao `gemini-2.5-flash`

Se for usar `web`:

- `WHATSAPP_WEB_SESSION_PATH`: pasta local para salvar a sessao
- `WHATSAPP_WEB_CLIENT_ID`: identificador da sessao
- `WHATSAPP_WEB_HEADLESS`: `true` ou `false`

Se for usar `cloud`:

- `WHATSAPP_VERIFY_TOKEN`: token de verificacao do webhook
- `WHATSAPP_ACCESS_TOKEN`: token de acesso do WhatsApp Cloud API
- `WHATSAPP_PHONE_NUMBER_ID`: ID do numero do WhatsApp

## Como rodar

```bash
npm install
npm start
```

Servidor padrao: `http://localhost:3000`

## Endpoints

### `GET /health`

Mostra status da API e se as principais configuracoes estao preenchidas.

### `GET /api/whatsapp/status`

Mostra o status atual do WhatsApp.

### `GET /api/whatsapp/qr`

Retorna o QR Code em `data URL` quando `WHATSAPP_PROVIDER=web`.

### `GET /api/whatsapp/qr/view`

Mostra uma pagina HTML simples com o QR Code para escanear no navegador.

### `GET /webhook`

Endpoint de verificacao do webhook do WhatsApp oficial. So funciona quando `WHATSAPP_PROVIDER=cloud`.

### `POST /webhook`

Recebe mensagens do WhatsApp oficial e responde automaticamente. So funciona quando `WHATSAPP_PROVIDER=cloud`.

### `POST /api/chat/simulate`

Simula uma conversa sem depender do WhatsApp.

Exemplo:

```json
{
  "phone": "5511999999999",
  "name": "Carlos",
  "message": "Ola, preciso de disco diamantado para porcelanato"
}
```

### `GET /api/leads`

Lista todos os leads salvos.

### `GET /api/leads/:phone`

Retorna o historico completo de um lead.

## Usando login por QR Code

1. Defina `WHATSAPP_PROVIDER=web`
2. Rode `npm install`
3. Rode `npm start`
4. Abra `http://localhost:3000/api/whatsapp/qr/view`
5. Escaneie o QR Code com o WhatsApp do numero que vai atender os leads

Depois de autenticado, a sessao fica salva localmente na pasta definida por `WHATSAPP_WEB_SESSION_PATH`.

## Base de conhecimento extra

Voce pode colocar arquivos `.txt`, `.md`, `.json` ou `.pdf` em `data/knowledge`.

Exemplos:

- `data/knowledge/catalogo.md`
- `data/knowledge/faq.txt`
- `data/knowledge/produtos.json`
- `data/knowledge/catalogo.pdf`

Esses arquivos entram no contexto enviado para a IA junto com as informacoes basicas da Argacon.

## Voltando depois para a Cloud API oficial

1. Troque `WHATSAPP_PROVIDER=cloud`
2. Preencha as variaveis do Meta
3. Configure `/webhook` no painel do Meta

## Configurando o webhook do WhatsApp oficial

No painel do Meta:

1. Cadastre a URL publica apontando para `/webhook`
2. Use o mesmo valor de `WHATSAPP_VERIFY_TOKEN`
3. Assine o campo de mensagens

O envio de resposta usa o endpoint oficial de mensagens do WhatsApp Cloud API. A API responde apenas quando recebe mensagem do cliente, o que encaixa no fluxo de atendimento de leads.

## Como a IA foi orientada

A IA foi instruida para:

- Responder como SDR/comercial da Argacon
- Fazer qualificacao de lead sem inventar preco, estoque ou prazo
- Coletar nome, empresa, cidade, produto, aplicacao, quantidade e urgencia
- Encaminhar para humano quando o cliente pedir algo que exige confirmacao comercial

## Observacoes

- O historico fica salvo em `data/leads.json`
- Se quiser colocar um CRM depois, o ponto mais simples e integrar em `src/services/store.js`
- Se o lead mandar audio, imagem ou documento, a API hoje pede que ele envie texto
- `whatsapp-web.js` e uma opcao pratica para MVP, mas nao oficial; para operacao critica, o ideal continua sendo a Cloud API
- Se a IA repetir sempre a mesma resposta, consulte `GET /health`; isso normalmente indica falta de `GEMINI_API_KEY` ou erro no retorno do Gemini
- O `/health` agora informa qual arquivo `.env` foi encontrado em `environment.loadedPath`
