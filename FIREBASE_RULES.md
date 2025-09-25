# Regras de Segurança do Firebase

## Firestore Security Rules

Adicione as seguintes regras no console do Firebase (Firestore Database > Rules):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Regras para coleção de usuários
    match /users/{userId} {
      // Permite leitura para todos (para ranking)
      allow read: if true;
      
      // Permite criação e atualização apenas para o próprio usuário
      allow create, update: if request.auth.uid == request.resource.data.uid;
      
      // Não permite deleção
      allow delete: if false;
    }
  }
}
```

## Firebase Storage Security Rules

Adicione as seguintes regras no console do Firebase (Storage > Rules):

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Regras para imagens de perfil
    match /profile-images/{userId}/{allPaths=**} {
      // Permite leitura para todos
      allow read: if true;
      
      // Permite escrita apenas para o próprio usuário
      allow write: if request.auth.uid == userId;
    }
  }
}
```

## Como configurar:

1. Acesse o [Console do Firebase](https://console.firebase.google.com/)
2. Selecione seu projeto
3. Vá para **Firestore Database** > **Rules** e cole as regras do Firestore
4. Vá para **Storage** > **Rules** e cole as regras do Storage
5. Publique as regras