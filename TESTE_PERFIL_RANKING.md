# 🧪 Guia de Teste - Sistema de Perfil e Ranking

## 🔧 Pré-requisitos para Teste

Antes de testar, você precisa configurar o Firebase:

### 1. **Criar Projeto Firebase**
1. Acesse [Firebase Console](https://console.firebase.google.com/)
2. Clique em "Adicionar projeto" 
3. Digite o nome do projeto (ex: "BibleQuiz")
4. Desative Google Analytics (opcional)
5. Crie o projeto

### 2. **Configurar Authentication**
1. No menu lateral, clique em "Authentication"
2. Vá para a aba "Método de login" 
3. Ative "Anônimo"
4. Salve

### 3. **Configurar Firestore**
1. No menu lateral, clique em "Firestore Database"
2. Clique em "Criar banco de dados"
3. Escolha "Começar no modo de teste" (por enquanto)
4. Selecione uma localização (ex: southamerica-east1)

### 4. **Configurar Storage**
1. No menu lateral, clique em "Storage"
2. Clique em "Começar"
3. Escolha "Começar no modo de teste" (por enquanto)
4. Confirme a localização

### 5. **Obter Configurações**
1. Clique no ícone de configuração ⚙️ > "Configurações do projeto"
2. Na aba "Geral", role até "Seus aplicativos"
3. Clique no ícone `</>` para adicionar aplicativo web
4. Digite um nome (ex: "BibleQuiz Web")
5. **COPIE** todas as configurações que aparecem

### 6. **Configurar .env**
```env
# Cole os valores copiados do Firebase aqui:
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSy...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=biblequiz-xxx.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=biblequiz-xxx
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=biblequiz-xxx.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
EXPO_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123

# Mantenha suas configurações existentes:
EXPO_PUBLIC_GOOGLE_API_KEY=sua_chave_do_google_drive
EXPO_PUBLIC_DRIVE_FOLDER_ID=seu_folder_id_do_drive
```

## 🧪 Roteiro de Testes

### **Teste 1: Inicialização do Sistema** ✅

1. **Executar o app**: `npm start`
2. **Abrir no dispositivo/emulador**
3. **Verificar**: Botões "👤 Perfil" e "🏆 Ranking" aparecem no catálogo
4. **Console**: Verificar logs de autenticação anônima (sem erros)

**Resultado Esperado**: Botões aparecem, sem erros no console

---

### **Teste 2: Primeira Configuração de Perfil** 👤

1. **Tocar em "👤 Perfil"**
2. **Tela deve carregar** com "Criar Perfil"
3. **Digitar nome**: "João Teste"
4. **Tocar no círculo da foto** → Escolher "Galeria" ou "Câmera"
5. **Selecionar uma imagem**
6. **Tocar "Criar Perfil"**
7. **Aguardar salvamento** (loading)
8. **Voltar ao catálogo**

**Resultado Esperado**: Perfil criado, imagem enviada para Firebase Storage

---

### **Teste 3: Verificar Ranking Vazio** 🏆

1. **Tocar em "🏆 Ranking"**
2. **Verificar tela vazia** com mensagem "Nenhum jogador encontrado"
3. **Voltar ao catálogo**

**Resultado Esperado**: Ranking vazio (normal, ainda não jogou)

---

### **Teste 4: Jogar Quiz e Ganhar Pontos** 🎮

1. **Selecionar um questionário**
2. **Jogar completamente** (responder todas as perguntas)
3. **Na tela de resultado**, verificar nota
4. **Voltar ao catálogo**
5. **Tocar em "🏆 Ranking"**
6. **Verificar**: Seu perfil deve aparecer com pontos

**Resultado Esperado**: Perfil aparece no ranking com pontuação

---

### **Teste 5: Jogar Mais Quizzes** 📈

1. **Jogar 2-3 questionários diferentes**
2. **Verificar no ranking** após cada quiz
3. **Score deve aumentar** a cada jogo

**Resultado Esperado**: Pontuação acumula corretamente

---

### **Teste 6: Editar Perfil** ✏️

1. **Tocar em "👤 Perfil"**
2. **Tela agora mostra "Editar Perfil"**
3. **Ver pontuação atual**
4. **Mudar nome** para "João Silva"
5. **Trocar foto**
6. **Salvar alterações**

**Resultado Esperado**: Alterações salvas, nome e foto atualizados

---

### **Teste 7: Funcionalidades de Ranking** 📊

1. **Abrir ranking**
2. **Puxar para baixo** (pull-to-refresh)
3. **Verificar posição**: "Posição: #1"
4. **Verificar destaque**: Seu perfil deve ter borda azul
5. **Se você for top 3**: Deve ter medalha 🥇🥈🥉

**Resultado Esperado**: Ranking atualiza, posição correta, destaques visuais

---

## 🐛 Possíveis Problemas

### **Erro: "Usuário não autenticado"**
- **Causa**: Firebase não configurado corretamente
- **Solução**: Verificar variáveis no .env e autenticação anônima ativa

### **Erro: "Permission denied"**
- **Causa**: Regras de segurança não configuradas
- **Solução**: Aplicar regras do arquivo `FIREBASE_RULES.md`

### **Foto não carrega**
- **Causa**: Permissões de câmera/galeria
- **Solução**: Aceitar permissões quando solicitadas

### **Score não atualiza**
- **Causa**: Firestore não configurado ou regras restritivas
- **Solução**: Verificar regras e conexão com internet

### **Ranking vazio após jogar**
- **Causa**: Dados não sincronizaram
- **Solução**: Pull-to-refresh ou reiniciar app

## 📱 Teste em Múltiplos Dispositivos

Para testar o ranking completo:

1. **Instalar app em 2-3 dispositivos diferentes**
2. **Criar perfis diferentes** em cada um
3. **Jogar quizzes** com pontuações variadas
4. **Verificar ranking** em todos os dispositivos
5. **Testar pull-to-refresh**

**Resultado Esperado**: Ranking sincronizado entre dispositivos

## ✅ Checklist Final

- [ ] Autenticação anônima funciona
- [ ] Perfil pode ser criado/editado
- [ ] Foto é enviada e exibida corretamente
- [ ] Score acumula após cada quiz
- [ ] Ranking mostra todos os jogadores
- [ ] Pull-to-refresh funciona
- [ ] Posição do usuário está correta
- [ ] Top 3 tem medalhas
- [ ] Perfil do usuário atual tem destaque
- [ ] Sistema funciona offline (dados em cache)

## 🎉 Teste Completo!

Se todos os itens estão funcionando, o sistema de Perfil e Ranking está 100% operacional! 

Agora seus usuários podem:
- ✅ Criar perfis personalizados
- ✅ Competir em ranking global  
- ✅ Acumular pontos jogando
- ✅ Ver sua posição entre os melhores
- ✅ Personalizar com foto de perfil