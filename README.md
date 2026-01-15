# 🎫 FOZ RP - Sistema de Tickets Discord

Bot de Discord completo para gerenciamento de tickets com painel de controle web integrado.

## 📋 Funcionalidades

### 🎮 Sistema de Tickets

-   ✅ Criação de tickets via painel interativo
-   📝 Categorias personalizáveis (Suporte Geral, Denúncia, Bug/Report, Revisão de Ban, Parceria, Financeiro)
-   👥 Sistema de permissões por cargo
-   🔒 Tickets privados com controle de acesso
-   📊 Transcrições automáticas em HTML
-   ⏰ Sistema de alertas para tickets inativos
-   🏷️ Renomear, adicionar/remover usuários e fechar tickets

### 🎛️ Painel de Controle Web

-   🔐 Sistema de autenticação com JWT
-   📊 Monitoramento em tempo real (CPU, RAM, Ping)
-   📝 Editor de configuração (config.yml)
-   📟 Console com logs do bot ao vivo
-   🔄 Controle do bot (Iniciar/Parar/Reiniciar)
-   📱 Interface responsiva (Desktop e Mobile)

## 🚀 Instalação com Docker (Recomendado)

### 1. Pré-requisitos

-   [Docker](https://docs.docker.com/get-docker/)
-   [Docker Compose](https://docs.docker.com/compose/install/)
-   Token do Bot Discord

### 2. Configurar variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# Discord
DISCORD_TOKEN=seu_token_discord_aqui
CLIENT_ID=seu_client_id
GUILD_ID=seu_guild_id

# Painel Web
WEB_PORT=27015
JWT_SECRET=sua_chave_secreta_jwt_aqui

# Ambiente
NODE_ENV=production
```

> **Gerar JWT_SECRET seguro:**
>
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

### 3. Iniciar o container

```bash
docker-compose up -d
```

### 4. Verificar status

```bash
docker-compose logs -f
```

### 5. Acessar o painel

Abra seu navegador em: **http://localhost:27015**

**Credenciais padrão:**

-   Usuário: `admin`
-   Senha: `admin123`

⚠️ **IMPORTANTE:** Altere estas credenciais após o primeiro login!

## 🛠️ Comandos Docker Úteis

```bash
# Parar o bot
docker-compose stop

# Reiniciar o bot
docker-compose restart

# Ver logs
docker-compose logs -f

# Parar e remover containers
docker-compose down

# Rebuild após mudanças
docker-compose up -d --build
```

## 📂 Estrutura de Dados

O Docker persiste os seguintes dados:

```
./data/          # Banco de dados SQLite
./config.yml     # Configurações do bot
```

## ⚙️ Configuração

### Editar config.yml

Você pode editar o arquivo `config.yml` diretamente ou usar o painel web.

**Principais configurações:**

#### 1. Categorias de Tickets

```yaml
categories:
    - id: "suporte-geral"
      name: "📞 Suporte Geral"
      emoji: "📞"
      description: "Ajuda e suporte geral"
      channelId: "seu_canal_id"
      staffRoles: ["cargo_coord", "cargo_admin", "cargo_moderador"]
```

#### 2. Sistema de Permissões

Configure os cargos que podem atender cada tipo de ticket no campo `staffRoles`.

**Exemplo de permissões:**

| Categoria      | COORD | ADMIN | MODERADOR |
| -------------- | ----- | ----- | --------- |
| Suporte Geral  | ✔️    | ✔️    | ✔️        |
| Denúncia       | ✔️    | ✔️    | ❌        |
| Bug/Report     | ✔️    | ✔️    | ✔️        |
| Revisão de Ban | ✔️    | ✔️    | ❌        |
| Parceria       | ✔️    | ❌    | ❌        |
| Financeiro     | ✔️    | ❌    | ❌        |

#### 3. Cores e Aparência

```yaml
appearance:
    colors:
        primary: "#1a1a2e"
        success: "#16a34a"
        warning: "#d97706"
        error: "#dc2626"
        info: "#2563eb"
```

## 🔐 Segurança

### Alterar senha do painel

1. Gerar hash da nova senha:

```bash
# Com Docker
docker exec -it fozbot-panel node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('sua_nova_senha', 10).then(hash => console.log(hash));"

# Ou use o script incluído
docker exec -it fozbot-panel node generate-password.js
```

2. Editar `src/web/auth.js` com o novo hash:

```javascript
const users = [
    {
        username: "admin",
        passwordHash: "SEU_NOVO_HASH_AQUI",
    },
];
```

3. Reiniciar o container:

```bash
docker-compose restart
```

## 📝 Comandos do Bot

### Comandos Slash

-   `/painel` - Criar painel de tickets
-   `/adicionar @usuário` - Adicionar usuário ao ticket
-   `/remover @usuário` - Remover usuário do ticket
-   `/renomear <nome>` - Renomear ticket
-   `/fechar [motivo]` - Fechar ticket
-   `/transcricao` - Gerar transcrição do ticket
-   `/alertar <tempo>` - Configurar alerta de inatividade

## 🔧 Desenvolvimento Local (Sem Docker)

### 1. Instalar dependências

```bash
npm install
```

### 2. Instalar dependências do painel

```bash
cd web && npm install
```

### 3. Configurar .env

Crie o arquivo `.env` conforme descrito acima.

### 4. Deploy dos comandos slash

```bash
npm run deploy
```

### 5. Iniciar em desenvolvimento

```bash
# Terminal 1 - Backend
npm run web:dev

# Terminal 2 - Frontend (opcional)
cd web && npm run dev
```

## 📦 Tecnologias Utilizadas

### Backend

-   **Discord.js** v14 - Interação com Discord API
-   **Express.js** - Servidor web
-   **Socket.IO** - Comunicação em tempo real
-   **Better-SQLite3** - Banco de dados
-   **JWT** - Autenticação
-   **bcryptjs** - Hash de senhas

### Frontend

-   **React** + **Vite** - Interface do usuário
-   **TailwindCSS** - Estilização

## 🐛 Resolução de Problemas

### Bot não inicia

1. Verifique se o token está correto no `.env`
2. Certifique-se que o bot tem as permissões necessárias
3. Verifique os logs: `docker-compose logs -f`

### Painel não carrega

1. Verifique se a porta 27015 está disponível
2. Certifique-se que o JWT_SECRET está configurado
3. Limpe o cache do navegador

### Comandos não aparecem

1. Execute: `docker exec -it fozbot-panel node src/deploy-commands.js`
2. Aguarde até 1 hora para sincronização global

## 📄 Licença

MIT License - Sinta-se livre para usar e modificar.

## 🤝 Suporte

Para dúvidas ou problemas, abra uma issue.

---

**Sistema de Suporte Discord**
