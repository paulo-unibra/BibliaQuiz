# 📱 BibleQuiz - Sistema de Perfil e Ranking

Sistema completo de perfil de usuário e ranking global integrado ao Firebase.

## ✨ Funcionalidades Implementadas

### 🆔 **Identificação de Usuário**
- **UUID v4**: Gerado automaticamente na primeira execução
- **Autenticação Anônima**: Via Firebase Authentication
- **Persistência Local**: UUID salvo em AsyncStorage

### 👤 **Perfil de Usuário**
- **Nome/Apelido**: Personalização do nome de exibição
- **Foto de Perfil**: 
  - Seleção da galeria ou câmera
  - Redimensionamento automático para 300x300px
  - Upload para Firebase Storage
- **Pontuação**: Exibição da pontuação acumulada

### 🏆 **Sistema de Ranking**
- **Ranking Global**: Top 50 jogadores
- **Pontuação Acumulativa**: Score incrementa a cada quiz
- **Posição Atual**: Exibição da posição do usuário
- **Destaques**: Top 3 com medalhas especiais
- **Atualização em Tempo Real**: Pull-to-refresh

### 📊 **Integração com Quiz**
- **Score Automático**: Pontuação baseada em acertos/total × 100
- **Atualização no Firebase**: Score salvo automaticamente após cada quiz
- **Perfil Persistente**: Dados mantidos entre sessões

## 🚀 Como Configurar

### 1. **Configurar Firebase**

1. Crie um projeto no [Firebase Console](https://console.firebase.google.com/)
2. Ative **Authentication** > **Método de login anônimo**
3. Ative **Firestore Database**
4. Ative **Storage**
5. Configure as regras de segurança (veja `FIREBASE_RULES.md`)

### 2. **Configurar Variáveis de Ambiente**

Copie `.env.example` para `.env` e preencha os valores do Firebase:

```bash
cp .env.example .env
```

```env
EXPO_PUBLIC_FIREBASE_API_KEY=sua_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=seu_projeto.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=seu_projeto_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=seu_projeto.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=seu_messaging_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=seu_app_id
```

### 3. **Permissões (Android)**

Adicione ao `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-image-picker",
        {
          "photosPermission": "O app precisa de acesso às suas fotos para definir foto de perfil.",
          "cameraPermission": "O app precisa de acesso à câmera para tirar foto de perfil."
        }
      ]
    ]
  }
}
```

## 📁 Estrutura de Arquivos Criados

```
lib/
├── firebase.ts          # Configuração do Firebase
├── userService.ts       # Serviços de usuário e ranking
└── imageUtils.ts        # Utilitários para manipulação de imagem

components/
├── ProfileScreen.tsx    # Tela de perfil do usuário
└── RankingScreen.tsx    # Tela de ranking global

FIREBASE_RULES.md        # Regras de segurança
.env.example            # Exemplo de configuração
```

## 🗄️ Estrutura do Banco de Dados

### Firestore - Coleção `users`

```javascript
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "uid": "firebase_auth_uid",
  "nome": "João Silva",
  "fotoURL": "https://storage.googleapis.com/...",
  "score": 1250
}
```

### Storage - Estrutura de Pastas

```
/profile-images
  /{uid}
    /profile.jpg
```

## 🎮 Fluxo de Uso

1. **Primeira Execução**: 
   - UUID gerado automaticamente
   - Autenticação anônima no Firebase
   - Botões "Perfil" e "Ranking" aparecem no catálogo

2. **Configurar Perfil**:
   - Toque em "👤 Perfil"
   - Digite nome/apelido
   - Selecione foto (opcional)
   - Salve o perfil

3. **Jogar Quiz**:
   - Complete um questionário
   - Score é calculado automaticamente
   - Pontuação é salva no Firebase

4. **Ver Ranking**:
   - Toque em "🏆 Ranking"
   - Veja sua posição e dos outros jogadores
   - Puxe para baixo para atualizar

## 🎯 Sistema de Pontuação

```
Pontuação = (Acertos / Total de Perguntas) × 100
Score Acumulado = Score Anterior + Pontuação do Quiz
```

**Exemplo**: 8 acertos em 10 perguntas = 80 pontos

## 🛡️ Segurança

- **Leitura Pública**: Perfis são visíveis para ranking
- **Escrita Restrita**: Apenas o próprio usuário pode editar seu perfil
- **Upload Seguro**: Imagens apenas na pasta do próprio usuário
- **Autenticação**: Baseada em Firebase Auth UUID

## 📱 Componentes Visuais

### HeaderActions (Catálogo)
- Botões de acesso rápido para Perfil e Ranking
- Design responsivo com cores temáticas

### ProfileScreen
- Upload de foto com preview
- Validação de nome obrigatório
- Loading states e tratamento de erros

### RankingScreen
- Top 3 com medalhas e destaque visual
- Identificação do usuário atual
- Pull-to-refresh para atualização
- Estados vazios tratados

Agora seu BibleQuiz tem um sistema completo de perfil e ranking! 🚀