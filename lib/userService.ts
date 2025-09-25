import AsyncStorage from '@react-native-async-storage/async-storage';
import { signInAnonymously, User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from './firebase';

// Implementação de UUID simples para React Native
function generateSimpleUUID(): string {
  // Usar timestamp + números aleatórios para gerar ID único
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substr(2, 9);
  return `${timestamp}-${randomPart}`;
}

// Chaves para AsyncStorage
const KEYS = {
  USER_UUID: '@user_uuid',
  FIREBASE_UID: '@firebase_uid',
};

export interface UserProfile {
  uuid: string;
  uid: string;
  nome: string;
  fotoURL?: string;
  score: number;
}

export interface RankingUser {
  nome: string;
  fotoURL?: string;
  score: number;
  posicao: number;
}

const ASYNC_STORAGE_UUID_KEY = '@BibleQuiz:userUuid';

// 1. Gerar ou recuperar UUID
// 1. Gerenciar UUID do usuário
async function getOrCreateUUID(): Promise<string> {
  try {
    const existingUUID = await AsyncStorage.getItem(KEYS.USER_UUID);
    if (existingUUID) {
      console.log('UUID existente encontrado:', existingUUID);
      return existingUUID;
    }

    const uuid = generateSimpleUUID();
    await AsyncStorage.setItem(KEYS.USER_UUID, uuid);
    console.log('Novo UUID criado e salvo:', uuid);
    return uuid;
  } catch (error) {
    console.error('Erro ao obter/criar UUID:', error);
    return generateSimpleUUID(); // fallback
  }
}

// Salvar UID do Firebase localmente
async function saveFirebaseUID(uid: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.FIREBASE_UID, uid);
    console.log('🔐 Firebase UID salvo localmente:', uid);
  } catch (error) {
    console.error('Erro ao salvar Firebase UID:', error);
  }
}

// Recuperar UID do Firebase salvo localmente
async function getSavedFirebaseUID(): Promise<string | null> {
  try {
    const savedUID = await AsyncStorage.getItem(KEYS.FIREBASE_UID);
    console.log('🔐 Firebase UID recuperado:', savedUID || 'nenhum');
    return savedUID;
  } catch (error) {
    console.error('Erro ao recuperar Firebase UID:', error);
    return null;
  }
}

// Encontrar perfil por UUID (para casos de mudança de Firebase UID)
async function findProfileByUUID(uuid: string): Promise<UserProfile | null> {
  try {
    console.log('🔍 Buscando perfil por UUID:', uuid);
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('uuid', '==', uuid));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      const profile = doc.data() as UserProfile;
      console.log('🔍 Perfil encontrado por UUID:', {
        docId: doc.id,
        nome: profile.nome,
        score: profile.score
      });
      return profile;
    }
    
    console.log('🔍 Nenhum perfil encontrado para UUID:', uuid);
    return null;
  } catch (error) {
    console.error('Erro ao buscar perfil por UUID:', error);
    return null;
  }
}

// 2. Autenticação anônima com persistência aprimorada
export async function authenticateAnonymously(): Promise<User> {
  try {
    console.log('🔐 Verificando autenticação atual...');
    
    // Verificar se já está autenticado
    if (auth.currentUser) {
      console.log('🔐 Usuário já autenticado:', { 
        uid: auth.currentUser.uid, 
        isAnonymous: auth.currentUser.isAnonymous 
      });
      await saveFirebaseUID(auth.currentUser.uid);
      return auth.currentUser;
    }

    console.log('🔐 Iniciando nova autenticação anônima...');
    const userCredential = await signInAnonymously(auth);
    console.log('🔐 Autenticação anônima bem-sucedida:', { 
      uid: userCredential.user.uid,
      isAnonymous: userCredential.user.isAnonymous 
    });
    
    // Salvar o novo UID
    await saveFirebaseUID(userCredential.user.uid);
    
    return userCredential.user;
  } catch (error: any) {
    console.error('❌ Erro na autenticação anônima:', {
      message: error.message,
      code: error.code,
      name: error.name
    });
    throw error;
  }
}

// 3. Criar/Atualizar perfil do usuário
export async function createOrUpdateUserProfile(
  nome: string, 
  fotoURL?: string
): Promise<void> {
  try {
    console.log('Iniciando createOrUpdateUserProfile:', { nome, fotoURL });
    
    const user = auth.currentUser;
    console.log('Usuário atual:', user ? { uid: user.uid, isAnonymous: user.isAnonymous } : 'null');
    
    if (!user) {
      throw new Error('Usuário não autenticado');
    }

    const uuid = await getOrCreateUUID();
    console.log('UUID obtido:', uuid);
    
    const userProfile: UserProfile = {
      uuid,
      uid: user.uid,
      nome,
      fotoURL: fotoURL || '',
      score: 0
    };

    // Verificar se o usuário já existe
    const userDocRef = doc(db, 'users', user.uid);
    console.log('Verificando documento existente para uid:', user.uid);
    
    const userDoc = await getDoc(userDocRef);
    console.log('Documento existe?', userDoc.exists());
    
    if (userDoc.exists()) {
      // Atualizar apenas nome e foto, manter score
      console.log('Atualizando perfil existente...');
      await updateDoc(userDocRef, {
        nome,
        fotoURL: fotoURL || ''
      });
      console.log('Perfil atualizado com sucesso');
    } else {
      // Criar novo documento
      console.log('Criando novo perfil...', userProfile);
      await setDoc(userDocRef, userProfile);
      console.log('Novo perfil criado com sucesso');
    }
  } catch (error: any) {
    console.error('Erro detalhado ao criar/atualizar perfil:', {
      message: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack
    });
    throw error;
  }
}

// 4. Obter perfil do usuário atual com migração automática
export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  try {
    console.log('🔍 Iniciando getCurrentUserProfile...');
    
    const user = auth.currentUser;
    console.log('🔍 Usuário atual:', user ? {
      uid: user.uid,
      isAnonymous: user.isAnonymous
    } : 'null');
    
    if (!user) {
      console.log('❌ Nenhum usuário autenticado encontrado');
      return null;
    }

    // Primeiro, tentar buscar perfil com o UID atual
    const userDocRef = doc(db, 'users', user.uid);
    console.log('🔍 Buscando documento para uid:', user.uid);
    
    const userDoc = await getDoc(userDocRef);
    console.log('🔍 Documento encontrado?', userDoc.exists());
    
    if (userDoc.exists()) {
      const profileData = userDoc.data() as UserProfile;
      console.log('✅ Dados do perfil carregados diretamente:', {
        nome: profileData.nome,
        score: profileData.score,
        hasPhoto: !!profileData.fotoURL
      });
      return profileData;
    } 
    
    // Se não encontrou, tentar migrar dados usando UUID
    console.log('🔄 Documento não encontrado, tentando migração por UUID...');
    const uuid = await getOrCreateUUID();
    const existingProfile = await findProfileByUUID(uuid);
    
    if (existingProfile) {
      console.log('🔄 Perfil encontrado para migração:', {
        oldUID: existingProfile.uid,
        newUID: user.uid,
        nome: existingProfile.nome,
        score: existingProfile.score
      });
      
      // Criar novo documento com o UID atual
      const newProfile: UserProfile = {
        ...existingProfile,
        uid: user.uid // Atualizar para o novo UID
      };
      
      await setDoc(userDocRef, newProfile);
      console.log('✅ Perfil migrado com sucesso para novo UID:', user.uid);
      
      return newProfile;
    }
    
    console.log('❌ Nenhum perfil encontrado para migração');
    return null;
  } catch (error: any) {
    console.error('❌ Erro detalhado ao obter perfil do usuário:', {
      message: error.message,
      code: error.code,
      name: error.name
    });
    return null;
  }
}

// 5. Atualizar score do usuário
export async function atualizarScore(novoScore: number): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Usuário não autenticado');
    }

    const userDocRef = doc(db, 'users', user.uid);
    await updateDoc(userDocRef, {
      score: novoScore
    });
  } catch (error) {
    console.error('Erro ao atualizar score:', error);
    throw error;
  }
}

// 6. Buscar ranking
export async function buscarRanking(topN: number = 10): Promise<RankingUser[]> {
  try {
    const usersCollection = collection(db, 'users');
    const rankingQuery = query(
      usersCollection,
      orderBy('score', 'desc'),
      limit(topN)
    );
    
    const querySnapshot = await getDocs(rankingQuery);
    const ranking: RankingUser[] = [];
    
    let index = 0;
    querySnapshot.forEach((doc) => {
      const userData = doc.data() as UserProfile;
      ranking.push({
        nome: userData.nome,
        fotoURL: userData.fotoURL,
        score: userData.score,
        posicao: index + 1
      });
      index++;
    });
    
    return ranking;
  } catch (error) {
    console.error('Erro ao buscar ranking:', error);
    return [];
  }
}

// 7. Upload de imagem para Firebase Storage
export async function uploadProfileImage(imageUri: string): Promise<string> {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Usuário não autenticado');
    }

    // Converter URI para blob
    const response = await fetch(imageUri);
    const blob = await response.blob();

    // Criar referência no Storage
    const imageRef = ref(storage, `profile-images/${user.uid}/profile.jpg`);
    
    // Upload da imagem
    await uploadBytes(imageRef, blob);
    
    // Obter URL de download
    const downloadURL = await getDownloadURL(imageRef);
    
    return downloadURL;
  } catch (error) {
    console.error('Erro no upload da imagem:', error);
    throw error;
  }
}